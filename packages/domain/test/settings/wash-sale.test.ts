import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import {
  washSaleWindowEnd,
  washSaleWindowOf,
  washSaleWindowStart,
} from "../../src/settings/wash-sale.js";

/**
 * ADR-0014: the window is counted date to date, not in days. 61 days are not
 * two months, and with a monthly contribution on the same day of the month the
 * difference decides whether a loss is deferred.
 */
describe("washSaleWindowOf", () => {
  it("reads the setting, then the legacy form, then the documented default", () => {
    expect(washSaleWindowOf(DEFAULT_SETTINGS, "stock")).toBe("2m");
    expect(washSaleWindowOf(DEFAULT_SETTINGS, "fund")).toBe("1y");
    expect(washSaleWindowOf(DEFAULT_SETTINGS, "etf")).toBe("2m");
    const configured = mergeSettings(DEFAULT_SETTINGS, { wash_sale_window: { stock: "30d" } });
    expect(washSaleWindowOf(configured, "stock")).toBe("30d");
    const legacy = {
      ...DEFAULT_SETTINGS,
      wash_sale_window: {},
      wash_sale_window_days: { stock: 61 },
    };
    expect(washSaleWindowOf(legacy, "stock")).toBe("61d");
    // A type neither form mentions falls back to its default, never to undefined.
    expect(washSaleWindowOf(legacy, "crypto")).toBe("1y");
  });
});

describe("washSaleWindowEnd / washSaleWindowStart", () => {
  it("counts whole months and years, forwards and backwards", () => {
    expect(washSaleWindowEnd("2027-01-15", "2m")).toBe("2027-03-15");
    expect(washSaleWindowStart("2027-03-15", "2m")).toBe("2027-01-15");
    expect(washSaleWindowEnd("2027-02-10", "1y")).toBe("2028-02-10");
    expect(washSaleWindowStart("2028-02-10", "1y")).toBe("2027-02-10");
  });

  it("falls on the last day of the month when the day does not exist", () => {
    // Two months after the 31st of December of a leap year.
    expect(washSaleWindowEnd("2027-12-31", "2m")).toBe("2028-02-29");
    expect(washSaleWindowEnd("2026-12-31", "2m")).toBe("2027-02-28");
    expect(washSaleWindowStart("2028-04-30", "2m")).toBe("2028-02-29");
    expect(washSaleWindowEnd("2028-02-29", "1y")).toBe("2029-02-28");
  });

  it("counts calendar days in the legacy form", () => {
    expect(washSaleWindowEnd("2027-01-15", "61d")).toBe("2027-03-17");
    expect(washSaleWindowStart("2027-03-17", "61d")).toBe("2027-01-15");
  });
});
