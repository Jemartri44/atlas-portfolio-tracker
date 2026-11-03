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
import { text } from "./helpers.js";

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
