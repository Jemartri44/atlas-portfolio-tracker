// Criterion #19b: which repurchased units carry a deferred loss when more are
// inside the window than the loss needs. Atlas loads the closest to the sale;
// the other reading, the oldest, is measured in the doubtful section.
//
// Case C20 of the third tax audit (2026-11-03), by hand: 10 units bought on
// 10/01 at 100, 10 on 10/02 at 90, 10 on 10/03 at 80; 15 sold on 20/03 at 82
// (-220, deferred whole: 5 of February, 10 of March and 10 of April remain in
// the window, art. 33.5.f LIRPF); 10 bought on 10/04 at 85; 10 sold on 20/11 at
// 95 (+100, FIFO: 5 of February and 5 of March).
//  - Closest first (Atlas): March and April carry it; the sale of November
//    releases the -73,33 of 5 March units: +26,67, base 26,67, 146,67 still
//    deferred.
//  - Oldest first: February and March carry it; it releases -146,67: -46,67,
//    base 0, 46,67 to carry, 73,33 still deferred.

import { describe, expect, it } from "vitest";
import { taxYear } from "../../src/tax/year.js";
import { c20 } from "./cases/cases.js";
import { ledgerOf, TODAY } from "./cases/short-form.js";
import { buy, HAND_SETTINGS, sell, taxBuilder, text } from "./helpers.js";

describe("criterion #19b, the units that carry a deferred loss (case C20)", () => {
  const report = taxYear(ledgerOf(c20), 2025, { today: TODAY });

  it("marks the loss and its release with the criterion", () => {
    expect(report.capital_gains.lines.map((line) => line.criteria.includes("19b"))).toEqual([
      true,
      true,
    ]);
  });

  it("measures the oldest-first reading in the doubtful section", () => {
    const stake = report.doubtful.find((entry) => entry.criterion === "19b");
    expect(stake?.certainty).toBe("medium");
    // 0 − 26,67; −46,67 to carry against none; −73,33 − (−146,67) = 73,34,
    // each figure rounded on its own.
    expect(text(stake?.base_difference_eur)).toBe("-26.67");
    expect(text(stake?.pending_difference_eur)).toBe("-46.67");
    expect(text(stake?.deferred_difference_eur)).toBe("73.34");
  });
});

// The criterion is only marked when the two readings load different units.
// A share at 10, sold at 8 (two months, HAND_SETTINGS).
describe("criterion #19b is marked only when there was a choice", () => {
  const marked = (purchases: [string, string][], sale: [string, string]): boolean => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-01-04", "10", "10");
    for (const [date, quantity] of purchases.filter(([date]) => date < sale[0])) {
      buy(b, "stock_s", date, quantity, "10");
    }
    sell(b, "stock_s", sale[0], sale[1], "8");
    for (const [date, quantity] of purchases.filter(([date]) => date > sale[0])) {
      buy(b, "stock_s", date, quantity, "8");
    }
    const line = taxYear(b.build(), 2027, { today: TODAY }).capital_gains.lines[0];
    return line?.criteria.includes("19b") === true;
  };

  it.each([
    ["a single partial repurchase", [["2027-04-05", "5"]], false],
    [
      "repurchases that cover the sale exactly",
      [
        ["2027-04-05", "5"],
        ["2027-04-20", "5"],
      ],
      false,
    ],
    // Both after the sale: the closest are also the oldest.
    [
      "two later repurchases, more than needed",
      [
        ["2027-04-05", "6"],
        ["2027-04-20", "6"],
      ],
      false,
    ],
    // 10 of 01/02 stay after the sale; 10 more on 05/03. The closest is 05/03,
    // the oldest 01/02: the readings differ.
    [
      "one before and one after, the later closer",
      [
        ["2027-02-01", "10"],
        ["2027-03-05", "10"],
      ],
      true,
    ],
  ] as [string, [string, string][], boolean][])("%s", (_name, purchases, expected) => {
    expect(marked(purchases, ["2027-03-01", "10"])).toBe(expected);
  });
});
