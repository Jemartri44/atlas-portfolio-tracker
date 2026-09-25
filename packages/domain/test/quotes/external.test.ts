import { describe, expect, it } from "vitest";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import { priceAt } from "../../src/projections/prices.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import {
  approximationAt,
  externalPricesOf,
  quoteDates,
  SUBUNITS,
} from "../../src/quotes/external.js";
import { type CloseLine, type EffectiveClose, effectiveCloses } from "../../src/quotes/line.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const history = readEcbZipCsv(
  ["Date,USD,GBP,", "2027-01-05,1.25,0.8,", "2027-01-04,1.2,0.8,", "2026-12-31,1.1,0.8,"].join(
    "\n",
  ),
);

const line = (
  date: string,
  close: string,
  currency = "EUR",
  source: "eodhd" | "alpha_vantage" = "eodhd",
): CloseLine => ({
  schema_version: 1,
  date,
  close,
  currency,
  source,
  fetched_at: "2027-01-06T06:00:00.000Z",
});

const book = (entries: Record<string, CloseLine[]>, withHistory = true) => ({
  closes: new Map<string, EffectiveClose[]>(
    Object.entries(entries).map(([id, lines]) => [id, effectiveCloses(lines)]),
  ),
  ...(withHistory ? { history } : {}),
  staleDays: 30,
});

const state = (valuation?: { date: string; unit_value: string }) => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.asset("ast_wetf", { asset_type: "etf" });
  b.assetUpdated({
    asset_id: "ast_world",
    asset_type: "fund",
    book: "core",
    asset_class: "equity",
    name: "ast_world",
    currency: "EUR",
    transferable: true,
    active: true,
    reference_etf_id: "ast_wetf",
  });
  if (valuation !== undefined) {
    b.valuation({ account_id: "acc_fund", asset_id: "ast_world", ...valuation });
  }
  return projectLedger(b.build());
};

describe("the automatic closes as quotes", () => {
  it("converts with the ECB rate of the quote's date, never the day before", () => {
    const external = externalPricesOf(
      state(),
      book({ ast_gold: [line("2027-01-04", "120", "USD"), line("2027-01-06", "125", "USD")] }),
    );
    expect(external.at("ast_gold", "2027-01-05")).toMatchObject({
      date: "2027-01-04",
      unit_value: expect.objectContaining({}),
      fx_rate_date: "2027-01-04",
      source: "eodhd",
    });
    expect(external.at("ast_gold", "2027-01-05")?.fx_rate?.toString()).toBe("1.2");
    // The 6th has no ECB rate yet: it is never converted with the rate of the
    // 5th. The quote in euros is the close of the 4th, with its own rate, and
    // the 6th travels with it as information (review of PR #78).
    const sixth = external.at("ast_gold", "2027-01-06");
    expect(sixth).toMatchObject({ date: "2027-01-04", fx_rate_date: "2027-01-04" });
    expect(sixth?.fx_rate?.toString()).toBe("1.2");
    expect(sixth?.newer).toMatchObject({ date: "2027-01-06", fx_missing: "not_yet_published" });
    expect(sixth?.newer?.fx_rate).toBeUndefined();
    // With no earlier close that converts, the newest is all there is.
    const alone = externalPricesOf(state(), book({ ast_gold: [line("2027-01-06", "125", "USD")] }));
    expect(alone.at("ast_gold", "2027-01-06")).toMatchObject({ fx_missing: "not_yet_published" });
    expect(alone.at("ast_gold", "2027-01-06")?.newer).toBeUndefined();
    expect(external.at("ast_gold", "2027-01-03")).toBeUndefined();
    expect(external.at("ast_bonds", "2027-01-05")).toBeUndefined();
  });

  it("converts pence as pounds / 100, an exact unit, and never treats GBX as GBP", () => {
    const external = externalPricesOf(
      state(),
      book({
        ast_gold: [line("2027-01-04", "5000", "GBX")],
        ast_bonds: [line("2027-01-04", "5000", "ILA")],
      }),
    );
    const pence = external.at("ast_gold", "2027-01-04");
    // 0.8 pounds per euro is 80 pence per euro: 5000 pence are 62.5 euros, not 6250.
    expect(pence).toMatchObject({ currency: "GBX", fx_rate_date: "2027-01-04" });
    expect(pence?.fx_rate?.toString()).toBe("80");
    // A subunit that is not in the table has no rate at all.
    expect(external.at("ast_bonds", "2027-01-04")).toMatchObject({
      currency: "ILA",
      fx_missing: "currency_not_published",
    });
    expect(SUBUNITS).toEqual({ GBX: { of: "GBP", per: "100" } });
  });

  it("stops looking back when no close of that currency can convert", () => {
    const external = externalPricesOf(
      state(),
      book({ ast_gold: [line("2027-01-04", "1", "ILA"), line("2027-01-05", "2", "ILA")] }),
    );
    expect(external.at("ast_gold", "2027-01-05")).toMatchObject({
      date: "2027-01-05",
      fx_missing: "currency_not_published",
    });
  });

  it("does not convert a currency the ECB stopped publishing (currency_stale)", () => {
    const stale = readEcbZipCsv(
      ["Date,USD,BGN,", "2027-03-01,1.2,N/A,", "2027-01-04,1.2,1.9558,"].join("\n"),
    );
    const external = externalPricesOf(state(), {
      closes: new Map([["ast_gold", effectiveCloses([line("2027-03-01", "10", "BGN")])]]),
      history: stale,
      staleDays: 30,
    });
    expect(external.at("ast_gold", "2027-03-01")).toMatchObject({ fx_missing: "currency_stale" });
  });

  it("converts euros at 1 even without a history, and nothing else", () => {
    const external = externalPricesOf(
      state(),
      book(
        { ast_bonds: [line("2027-01-04", "7")], ast_gold: [line("2027-01-04", "7", "USD")] },
        false,
      ),
    );
    expect(external.at("ast_bonds", "2027-01-04")?.fx_rate?.toString()).toBe("1");
    expect(external.at("ast_gold", "2027-01-04")?.fx_missing).toBe("no_history");
  });

  it("goes through the gate with P2 and its age", () => {
    const s = state({ date: "2027-01-01", unit_value: "100" });
    const external = externalPricesOf(s, book({ ast_bonds: [line("2027-01-05", "7")] }));
    expect(priceAt(s, "ast_bonds", "2027-01-06", DEFAULT_SETTINGS, external)).toMatchObject({
      origin: "external",
      source: "eodhd",
      age_days: 1,
    });
  });

  it("lists every date with a close, once, in order", () => {
    expect(
      quoteDates(
        book({
          a: [line("2027-01-05", "1")],
          b: [line("2027-01-04", "1"), line("2027-01-05", "2")],
        }).closes,
      ),
    ).toEqual(["2027-01-04", "2027-01-05"]);
  });
});

describe("the approximation through the reference ETF (P3)", () => {
  const etf = [line("2026-12-31", "50"), line("2027-01-04", "55"), line("2027-01-05", "60")];

  it("is the real value × (ETF on the day / ETF on the day of that value), marked", () => {
    const s = state({ date: "2026-12-31", unit_value: "200" });
    const result = approximationAt(s, book({ ast_wetf: etf }).closes, "ast_world", "2027-01-05");
    expect(result).toMatchObject({
      date: "2027-01-05",
      currency: "EUR",
      anchor: { date: "2026-12-31", kind: "valuation" },
      source: "eodhd",
    });
    expect(typeof result !== "string" && result.value.toString()).toBe("240");
    const quote = externalPricesOf(s, book({ ast_wetf: etf })).at("ast_world", "2027-01-05");
    expect(quote).toMatchObject({ approximate: true, date: "2027-01-05" });
    // Through the gate the approximation wins over the older valuation, and stays marked.
    expect(
      priceAt(
        s,
        "ast_world",
        "2027-01-05",
        DEFAULT_SETTINGS,
        externalPricesOf(s, book({ ast_wetf: etf })),
      ),
    ).toMatchObject({
      origin: "external",
      approximate: true,
    });
  });

  it("anchors on the more recent real value: a close of its own (EUFUND) beats an older valuation", () => {
    const s = state({ date: "2026-12-31", unit_value: "200" });
    const result = approximationAt(
      s,
      book({ ast_wetf: etf, ast_world: [line("2027-01-04", "210")] }).closes,
      "ast_world",
      "2027-01-05",
    );
    expect(result).toMatchObject({ anchor: { date: "2027-01-04", kind: "close" } });
    expect(typeof result !== "string" && result.value.toString()).toBe("229.0909090909");
    // On the same date, the valuation is the anchor.
    const same = approximationAt(
      state({ date: "2027-01-04", unit_value: "205" }),
      book({ ast_wetf: etf, ast_world: [line("2027-01-04", "210")] }).closes,
      "ast_world",
      "2027-01-05",
    );
    expect(same).toMatchObject({ anchor: { kind: "valuation" } });
  });

  it("does not exist without a real value to anchor it, and says why", () => {
    expect(
      approximationAt(state(), book({ ast_wetf: etf }).closes, "ast_world", "2027-01-05"),
    ).toBe("no_anchor");
    expect(approximationAt(state(), book({}).closes, "ast_bonds", "2027-01-05")).toBe(
      "no_reference_etf",
    );
  });

  it("never takes the nearest ETF close when there is none on the day of the anchor", () => {
    const s = state({ date: "2027-01-02", unit_value: "200" });
    expect(approximationAt(s, book({ ast_wetf: etf }).closes, "ast_world", "2027-01-05")).toBe(
      "no_etf_close_at_anchor",
    );
    const quote = externalPricesOf(s, book({ ast_wetf: etf })).at("ast_world", "2027-01-05");
    expect(quote).toBeUndefined();
  });

  it("needs an ETF close after the anchor, in the same currency", () => {
    const s = state({ date: "2027-01-05", unit_value: "200" });
    expect(approximationAt(s, book({ ast_wetf: etf }).closes, "ast_world", "2027-01-05")).toBe(
      "no_newer_etf_close",
    );
    expect(approximationAt(s, book({}).closes, "ast_world", "2027-01-05")).toBe(
      "no_newer_etf_close",
    );
    const changed = [line("2026-12-31", "50"), line("2027-01-05", "60", "USD")];
    expect(
      approximationAt(
        state({ date: "2026-12-31", unit_value: "1" }),
        book({ ast_wetf: changed }).closes,
        "ast_world",
        "2027-01-05",
      ),
    ).toBe("etf_currency_changed");
  });
});
