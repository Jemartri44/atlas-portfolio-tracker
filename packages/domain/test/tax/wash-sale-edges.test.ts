// The ends of the window on both sides of the sale where the month or the year
// has to be clamped or does not repeat: the rule counts date to date, so an
// end that lands on a day the month does not have falls on its last day.

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.js";
import { buy, lineOf, reportOf, sell, taxBuilder, text } from "./helpers.js";

const WITH_YEAR: Settings = {
  ...DEFAULT_SETTINGS,
  wash_sale_window: { ...DEFAULT_SETTINGS.wash_sale_window, fund: "1y" },
};

/** What is deferred of a loss of 100 on `saleDate` when 5 units are bought on `buyDate`. */
const deferred = (asset: string, settings: Settings, saleDate: string, buyDate: string): string => {
  const b = taxBuilder(settings);
  // Held through the whole window, so that the purchase is not the only holding.
  buy(b, asset, "2025-01-05", "5", "100");
  const early = buyDate < saleDate;
  if (early) {
    buy(b, asset, buyDate, "5", "100");
  }
  const loss = sell(b, asset, saleDate, "5", "80");
  if (!early) {
    buy(b, asset, buyDate, "5", "80");
  }
  const year = Number(saleDate.slice(0, 4));
  return text(lineOf(reportOf(b.build(), year), loss.id).deferred_eur.roundToCents());
};

describe("two months", () => {
  it.each([
    // [sale, last day inside, first day outside]
    ["31 December into a leap February", "2027-12-31", "2028-02-29", "2028-03-01"],
    ["31 December into a plain February", "2026-12-31", "2027-02-28", "2027-03-01"],
    ["29 December into a leap February", "2027-12-29", "2028-02-29", "2028-03-01"],
  ])("after the sale, %s", (_, sale, inside, outside) => {
    expect(deferred("stock_s", DEFAULT_SETTINGS, sale, inside)).toBe("-100");
    expect(deferred("stock_s", DEFAULT_SETTINGS, sale, outside)).toBe("0");
  });

  it.each([
    // [sale, first day inside, last day outside]
    ["30 April back to a plain February", "2027-04-30", "2027-02-28", "2027-02-27"],
    ["31 December back to October", "2027-12-31", "2027-10-31", "2027-10-30"],
    ["31 March back to a leap January", "2028-03-31", "2028-01-31", "2028-01-30"],
  ])("before the sale, %s", (_, sale, inside, outside) => {
    expect(deferred("stock_s", DEFAULT_SETTINGS, sale, inside)).toBe("-100");
    expect(deferred("stock_s", DEFAULT_SETTINGS, sale, outside)).toBe("0");
  });
});

describe("one year", () => {
  it("after the sale: the same date a year later defers, the next day does not", () => {
    expect(deferred("fund_f", WITH_YEAR, "2027-03-15", "2028-03-15")).toBe("-100");
    expect(deferred("fund_f", WITH_YEAR, "2027-03-15", "2028-03-16")).toBe("0");
  });

  it("before the sale: the same date a year earlier defers, the day before does not", () => {
    expect(deferred("fund_f", WITH_YEAR, "2027-03-15", "2026-03-15")).toBe("-100");
    expect(deferred("fund_f", WITH_YEAR, "2027-03-15", "2026-03-14")).toBe("0");
  });

  it("across a leap day: 28 February 2027 looks forward to 28 February 2028, not the 29th", () => {
    expect(deferred("fund_f", WITH_YEAR, "2027-02-28", "2028-02-28")).toBe("-100");
    expect(deferred("fund_f", WITH_YEAR, "2027-02-28", "2028-02-29")).toBe("0");
  });
});
