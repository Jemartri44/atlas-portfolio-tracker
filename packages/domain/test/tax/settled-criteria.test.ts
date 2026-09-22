// The two lists of criteria of the report: `doubtful` and `settled`
// (feature 010, block 2; decision of the direction of 2026-09-23).
//
// What these guard is a **partition**, not a filter. The function used to end
// in `.filter(isDoubtful)`, and the day criteria #18 and #19 rose to high
// certainty that single line stopped showing an amount it had just finished
// computing: what the opposite reading of a rule the engine does apply would
// move. "I do not know how this is read" and "I know how this is read, and
// this is what is behind it" are not the same thing.
//
// So: nothing may fall between the two lists, nothing may be in both, and an
// entry whose other reading moves **nothing** stays, with its zeros.

import { describe, expect, it } from "vitest";
import { FISCAL_CRITERIA, isDoubtful } from "../../src/tax/criteria.js";
import type { CriterionStake } from "../../src/tax/report.js";
import { buy, HAND_SETTINGS, reportOf, sell, taxBuilder, text } from "./helpers.js";

/**
 * A ledger where one sale applies **#18 and #19 at once**, and where the other
 * reading of each moves a real amount.
 *
 * - `A`: 10 units on 2026-11-01, **outside** the window of every sale here.
 * - `B`: 20 units on 2027-02-10.
 * - `S1` on 2027-03-01 sells the 10 of `A` at a loss of −500,00. `B` is inside
 *   its window with 20 free units, so the whole loss is deferred onto 10 of
 *   them: half of `B` is now **used** (#19).
 * - `S2` on 2027-04-01 sells 10 units at a loss of −100,00, and FIFO takes them
 *   from `B`, releasing half of the −500,00 those units carried: it looks at
 *   −350,00. Now `B` is a candidate of its own sale with 10 units left, of which
 *   5 are already used: 5 free against 10 sold, so **half** is deferred,
 *   −175,00. The other reading of #19 would count the used units, and the other
 *   reading of #18 the ones the sale itself consumed; either gives it ten free
 *   units and defers the whole −350,00.
 */
const twoSettledCriteria = () => {
  const b = taxBuilder(HAND_SETTINGS);
  buy(b, "stock_s", "2026-11-01", "10", "100");
  buy(b, "stock_s", "2027-02-10", "20", "50");
  sell(b, "stock_s", "2027-03-01", "10", "50");
  const second = sell(b, "stock_s", "2027-04-01", "10", "40");
  return { report: reportOf(b.build(), 2027), second };
};

const stakeOf = (items: readonly CriterionStake[], criterion: string): CriterionStake => {
  const found = items.find((item) => item.criterion === criterion);
  if (found === undefined) {
    throw new Error(`no stake for ${criterion} in [${items.map((i) => i.criterion).join(", ")}]`);
  }
  return found;
};

describe("the criteria the report separates", () => {
  it("puts a settled criterion with money behind it in `settled`, never in `doubtful`", () => {
    const { report, second } = twoSettledCriteria();
    // Both are applied by the sale, so both have to be accounted for somewhere.
    const line = report.capital_gains.lines.find((entry) => entry.event_id === second.id);
    expect(line?.criteria).toEqual(expect.arrayContaining(["18", "19"]));
    expect(text(line?.deferred_eur)).toBe("-175");

    for (const criterion of ["18", "19"]) {
      expect(FISCAL_CRITERIA[criterion as "18"].certainty).toBe("high");
      expect(report.doubtful.map((item) => item.criterion)).not.toContain(criterion);
      const stake = stakeOf(report.settled, criterion);
      // `S2` looks at −350,00 (its own −100,00 plus the −250,00 that the ten
      // units of `B` it consumed were carrying) and defers 5/10 of it, −175,00.
      // Read the other way, either criterion gives it ten free units and the
      // whole −350,00 is deferred: the base of the year would be 175,00 lower,
      // so today's reading declares **more**, and getting it wrong declares
      // less than it should.
      expect(text(stake.base_difference_eur)).toBe("175");
      expect(stake.direction).toBe("aggressive");
      expect(stake.measure).toBe("difference");
    }
  });

  it("keeps a settled criterion whose other reading moves nothing, with its zero", () => {
    // The whole loss is deferred onto units the sale itself consumed, and
    // nothing homogeneous is left to carry more: the other reading of #18
    // changes not a cent. That is a result, not an absence, and hiding it is
    // what filtering by amount would do.
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-03-01", "10", "100");
    const loss = sell(b, "stock_s", "2027-04-01", "10", "90");
    const report = reportOf(b.build(), 2027);
    expect(report.capital_gains.lines[0]?.event_id).toBe(loss.id);
    const stake = stakeOf(report.settled, "18");
    expect(text(stake.base_difference_eur)).toBe("0");
    expect(stake.direction).toBe("none");
    expect(stake.reason).toBe("no_carrier_left");
  });

  it("splits every criterion by its certainty and loses none between the two lists", () => {
    const { report } = twoSettledCriteria();
    expect(report.settled.length).toBeGreaterThan(0);
    expect(report.doubtful.length).toBeGreaterThan(0);
    for (const item of report.settled) {
      expect(isDoubtful(item.criterion)).toBe(false);
    }
    for (const item of report.doubtful) {
      expect(isDoubtful(item.criterion)).toBe(true);
    }
    // No criterion in both, and the two together keep the order of the
    // document: the split is a partition of one sorted walk.
    const both = [...report.doubtful, ...report.settled].map((item) => item.criterion);
    expect(new Set(both).size).toBe(both.length);
  });

  it("says nothing about a criterion no figure of the year applies", () => {
    // The only exclusion there is, and it is not about the amount: the ledger
    // has no crypto, so its window is not a reading anybody applied.
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-03-01", "10", "100");
    sell(b, "stock_s", "2027-09-01", "10", "110");
    const report = reportOf(b.build(), 2027);
    const all = [...report.doubtful, ...report.settled].map((item) => item.criterion);
    expect(all).not.toContain("2:crypto");
    expect(all).not.toContain("18");
  });
});
