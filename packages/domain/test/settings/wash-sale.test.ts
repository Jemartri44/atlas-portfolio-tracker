import { describe, expect, it } from "vitest";
import type { AssetType } from "../../src/schema/events.js";
import {
  ADMITTED_FUND_WINDOW,
  BY_DOMICILE_TYPES,
  DEFAULT_SETTINGS,
  FUND_REGULATED_MARKETS,
  mergeSettings,
  NOT_ADMITTED_FUND_WINDOW,
  type Settings,
} from "../../src/settings/settings.js";
import {
  fundAdmitted,
  washSaleTransferCounts,
  washSaleWindowEnd,
  washSaleWindowOf,
  washSaleWindowStart,
} from "../../src/settings/wash-sale.js";

/**
 * ADR-0014: the window is counted date to date, not in days. 61 days are not
 * two months, and with a monthly contribution on the same day of the month the
 * difference decides whether a loss is deferred.
 */
describe("washSaleTransferCounts", () => {
  it("counts a transfer in unless the settings say otherwise (fiscal question #2b)", () => {
    expect(washSaleTransferCounts(DEFAULT_SETTINGS)).toBe(true);
    expect(
      washSaleTransferCounts(mergeSettings(DEFAULT_SETTINGS, { wash_sale_transfer_counts: true })),
    ).toBe(true);
    expect(
      washSaleTransferCounts(mergeSettings(DEFAULT_SETTINGS, { wash_sale_transfer_counts: false })),
    ).toBe(false);
  });
});

const of = (asset_type: AssetType, isin?: string, issuer_country?: string) => ({
  asset_type,
  ...(isin === undefined ? {} : { isin }),
  ...(issuer_country === undefined ? {} : { issuer_country }),
});

/** The frozen rule, written down: a ledger that holds it keeps computing the same. */
const BY_DOMICILE = mergeSettings(DEFAULT_SETTINGS, {
  wash_sale_window: { fund: "by_domicile", money_market: "by_domicile" },
});

describe("washSaleWindowOf", () => {
  it("reads the setting, then the legacy form, then the documented default", () => {
    expect(washSaleWindowOf(DEFAULT_SETTINGS, of("stock"))).toBe("2m");
    expect(washSaleWindowOf(DEFAULT_SETTINGS, of("crypto"))).toBe("1y");
    expect(washSaleWindowOf(DEFAULT_SETTINGS, of("etf"))).toBe("2m");
    const configured = mergeSettings(DEFAULT_SETTINGS, { wash_sale_window: { stock: "30d" } });
    expect(washSaleWindowOf(configured, of("stock"))).toBe("30d");
    const legacy = {
      ...DEFAULT_SETTINGS,
      wash_sale_window: {},
      wash_sale_window_days: { stock: 61 },
    };
    expect(washSaleWindowOf(legacy, of("stock"))).toBe("61d");
    // A type neither form mentions falls back to its default, never to undefined.
    expect(washSaleWindowOf(legacy, of("crypto"))).toBe("1y");
  });

  // Criterion #2 by domicile: V0011-00 and V2067-06 put a Spanish fund under
  // article 33.5.f); a foreign one, or one the catalogue cannot place, stays
  // under g).
  it.each([
    ["fund", "ES0000000001", undefined, "2m"],
    ["fund", "IE0000000001", "ES", "1y"],
    ["money_market", undefined, "ES", "2m"],
    ["fund", "IE0000000001", undefined, "1y"],
    ["fund", "LU0000000001", "LU", "1y"],
    ["money_market", undefined, undefined, "1y"],
  ] as const)(
    "a %s with ISIN %s and country %s takes %s by domicile",
    (type, isin, country, window) => {
      expect(washSaleWindowOf(BY_DOMICILE, of(type, isin, country))).toBe(window);
    },
  );

  it.each([
    ["fund", "ES0000000001"],
    ["fund", "IE0000000001"],
    ["money_market", undefined],
  ] as const)("by default a %s with ISIN %s takes two months", (type, isin) => {
    expect(washSaleWindowOf(DEFAULT_SETTINGS, of(type, isin))).toBe("2m");
  });

  it("lets a window written in the settings replace the domicile", () => {
    const year = mergeSettings(DEFAULT_SETTINGS, { wash_sale_window: { fund: "1y" } });
    expect(washSaleWindowOf(year, of("fund", "ES0000000001"))).toBe("1y");
    const months = mergeSettings(DEFAULT_SETTINGS, { wash_sale_window: { fund: "2m" } });
    expect(washSaleWindowOf(months, of("fund", "IE0000000001"))).toBe("2m");
  });

  it("reads a change written before the window map existed (days only)", () => {
    const { wash_sale_window: _window, ...rest } = DEFAULT_SETTINGS;
    const old = { ...rest, wash_sale_window_days: { fund: 365 } } as unknown as Settings;
    expect(washSaleWindowOf(old, of("fund", "ES0000000001"))).toBe("365d");
    expect(washSaleWindowOf(old, of("crypto"))).toBe("1y");
  });
});

describe("washSaleWindowEnd / washSaleWindowStart", () => {
  it("counts whole months and years, forwards and backwards", () => {
    expect(washSaleWindowEnd("2027-01-15", "2m")).toBe("2027-03-15");
    expect(washSaleWindowStart("2027-03-15", "2m", "fund")).toBe("2027-01-15");
    expect(washSaleWindowEnd("2027-02-10", "1y")).toBe("2028-02-10");
    expect(washSaleWindowStart("2028-02-10", "1y", "fund")).toBe("2027-02-10");
  });

  it("falls on the last day of the month when the day does not exist", () => {
    // Two months after the 31st of December of a leap year.
    expect(washSaleWindowEnd("2027-12-31", "2m")).toBe("2028-02-29");
    expect(washSaleWindowEnd("2026-12-31", "2m")).toBe("2027-02-28");
    expect(washSaleWindowStart("2028-04-30", "2m", "fund")).toBe("2028-02-29");
    expect(washSaleWindowEnd("2028-02-29", "1y")).toBe("2029-02-28");
  });

  it("starts crypto on the sale day: article 33.5.e) only looks at the year after", () => {
    expect(washSaleWindowStart("2027-06-10", "1y", "crypto")).toBe("2027-06-10");
    expect(washSaleWindowEnd("2027-06-10", "1y")).toBe("2028-06-10");
    expect(washSaleWindowStart("2027-06-10", "1y", "etp")).toBe("2026-06-10");
  });

  it("counts calendar days in the legacy form", () => {
    expect(washSaleWindowEnd("2027-01-15", "61d")).toBe("2027-03-17");
    expect(washSaleWindowStart("2027-03-17", "61d", "fund")).toBe("2027-01-15");
  });
});

describe("fundAdmitted", () => {
  // A foreign class counts as admitted only on an EU regulated market, by the
  // MIC of its segment (criterion #2, V0422-09).
  it.each([
    ["XMSM", true],
    ["xlux", true],
    ["XDUB", false],
    ["XEYE", false],
    ["EMTF", false],
    ["XETR", false],
    [undefined, false],
  ] as const)("a foreign fund on %s counts as admitted: %s", (market, admitted) => {
    const asset = {
      asset_type: "fund" as const,
      isin: "IE0000000001",
      ...(market ? { market } : {}),
    };
    expect(fundAdmitted(asset)).toBe(admitted);
    expect(washSaleWindowOf(BY_DOMICILE, asset)).toBe(admitted ? "2m" : "1y");
  });

  it("lets the ISIN decide the domicile: issuer_country only counts without one", () => {
    expect(fundAdmitted({ asset_type: "fund", isin: "IE0000000001", issuer_country: "ES" })).toBe(
      false,
    );
    expect(fundAdmitted({ asset_type: "fund", issuer_country: "ES" })).toBe(true);
    expect(fundAdmitted({ asset_type: "fund", isin: "ES0000000001", issuer_country: "IE" })).toBe(
      true,
    );
  });
});

/**
 * **Frozen.** `"by_domicile"` is recorded in the ledger, these are not: a
 * year computed with it is reproducible only while they stay as they are
 * (ADR-0022). Changing one is a new criterion —a new value of the enum—, never
 * a commit that edits these literals.
 */
describe("what by_domicile means", () => {
  it("keeps its two windows and its list of regulated markets", () => {
    expect([ADMITTED_FUND_WINDOW, NOT_ADMITTED_FUND_WINDOW]).toEqual(["2m", "1y"]);
    expect(FUND_REGULATED_MARKETS).toEqual([
      "XMSM",
      "XLUX",
      "XAMS",
      "XPAR",
      "XBRU",
      "XLIS",
      "MTAA",
      "ETFP",
      "XETA",
      "FRAA",
      "WBAH",
      "XMAD",
      "XBAR",
      "XBIL",
      "XVAL",
      "XHEL",
      "XSTO",
      "XCSE",
      "XWAR",
      "XPRA",
      "XBUD",
      "XATH",
    ]);
    expect(BY_DOMICILE_TYPES).toEqual(["fund", "money_market"]);
  });
});
