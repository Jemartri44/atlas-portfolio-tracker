// The hand-computed exercise, checked against the engine. **Every literal here
// comes from the hand calculation**, committed before the engine existed; none
// was copied from the engine's output. A discrepancy is investigated before a
// literal is touched.
//
// Recomputed by hand for spec 029 (2026-10-27): the dollar operations E2, E5,
// E8, E9, E16 and E21 are now computed first in dollars (criterion #4), and the
// dollars themselves are lots. E2 and E9 spend more dollars than the account
// holds, so they open negative lots at the rate of their day, which later
// inflows cover: each cover is an exchange difference (`currency_lines`).

import { describe, expect, it } from "vitest";
import type { Money } from "../../src/money/money.js";
import type { TaxYearReport, TransmissionLine } from "../../src/tax/report.js";
import { taxYear } from "../../src/tax/year.js";
import { exerciseLedger } from "./exercise-ledger.js";

const TODAY = "2029-06-01";
const { events, id } = exerciseLedger();
const report2027 = taxYear(events, 2027, { today: TODAY });
const report2028 = taxYear(events, 2028, { today: TODAY });

const text = (money: Money | undefined): string =>
  money === undefined ? "—" : money.amount.toString();

const lineOf = (report: TaxYearReport, label: string): TransmissionLine => {
  const line = [...report.capital_gains.lines, ...report.movable_capital.transmissions].find(
    (entry) => entry.event_id === id[label],
  );
  if (line === undefined) {
    throw new Error(`no line for ${label}`);
  }
  return line;
};

describe("hand-computed exercise, 2027", () => {
  it("E5: (799 − 1,001) $ at 1.25 = −161.60, cost 800.80 at the rate of the sale, nothing deferred", () => {
    const line = lineOf(report2027, "E5");
    // Before spec 029, leg by leg: cost 1,001 / 1.10 = 910.00 and loss −270.80.
    expect(text(line.cost_eur.roundToCents())).toBe("800.8");
    expect(text(line.proceeds.eur.roundToCents())).toBe("639.2");
    expect(text(line.own_eur.roundToCents())).toBe("-161.6");
    expect(text(line.deferred_eur)).toBe("0");
    expect(line.deferral).toBeUndefined();
    expect(text(line.computable_eur_rounded)).toBe("-161.6");
    expect(line.criteria).toEqual(["1", "2:listed", "3", "4", "6", "14"]);
    expect(line.proceeds.amount.toString()).toBe("799 USD");
    expect(line.proceeds.fx_rate).toBe("1.25");
    expect(line.lots[0]?.root.cost.amount.toString()).toBe("1001 USD");
  });

  it("E5's dollars cover 799 of the 1,001 E2 spent without having them: −22.04", () => {
    // E2 spent 1,001 $ the account did not have: a negative lot worth 1,001 / 1.10 = 910.00.
    // E5 brings 799 $ costing 910.00 − 161.60 = 748.40; the 799 $ they cover were worth
    // 910.00 × 799 / 1,001 = 726.36. The 202 $ still owed are covered by E8 in 2028.
    expect(
      report2027.capital_gains.currency_lines.map((line) => [
        line.event_id,
        line.kind,
        text(line.amount),
        text(line.proceeds_eur.roundToCents()),
        text(line.cost_eur.roundToCents()),
        text(line.gain_eur_rounded),
      ]),
    ).toEqual([[id.E5, "cover", "799", "726.36", "748.4", "-22.04"]]);
    expect(report2027.notes.map((n) => n.code)).toContain("tax_currency_spent_without_lots");
  });

  it("offsets 10.00 in phase 1 and carries −173.64 until 2031; base 30.00", () => {
    const c = report2027.compensation;
    // −161.60 − 22.04; before spec 029, −270.80.
    expect(text(c.capital_gain_eur)).toBe("-183.64");
    expect(text(c.movable_capital_eur)).toBe("40");
    expect(c.steps.map((s) => [s.phase, s.from, s.against, text(s.amount_eur)])).toEqual([
      [1, "capital_gain", "movable_capital", "10"],
    ]);
    expect(
      c.pending.map((p) => [p.origin_year, p.category, text(p.amount_eur), p.expires_after]),
    ).toEqual([[2027, "capital_gain", "-173.64", 2031]]);
    expect(text(report2027.base_eur)).toBe("30");
    expect(text(report2027.withholdings.total_eur)).toBe("7.6");
  });
});

describe("hand-computed exercise, 2028: transmissions", () => {
  const rows = (): (string | undefined)[][] =>
    ["E11", "E12", "E13", "E17", "E19", "E20", "E21"].map((label) => {
      const line = lineOf(report2028, label);
      return [
        label,
        text(line.own_eur.roundToCents()),
        text(line.released_eur.roundToCents()),
        text(line.deferred_eur.roundToCents()),
        text(line.computable_eur_rounded),
      ];
    });

  it("gives the table of the hand calculation, operation by operation", () => {
    expect(rows()).toEqual([
      ["E11", "-80", "0", "-40", "-40"],
      ["E12", "-150", "0", "-75", "-75"],
      ["E13", "5", "0", "0", "5"],
      ["E17", "190", "0", "0", "190"],
      ["E19", "50", "-75", "-30", "5"],
      ["E20", "165", "-30", "0", "135"],
      // (1,299 − 1,001) $ at 1.20; before spec 029, 1,082.50 − 910.00 = 172.50.
      ["E21", "248.33", "0", "0", "248.33"],
    ]);
  });

  it("E11: 40 of L1 at 400.00, half the loss deferred to the posterior purchase E15", () => {
    const line = lineOf(report2028, "E11");
    expect(text(line.cost_eur.roundToCents())).toBe("400");
    expect(line.deferral?.window_start).toBe("2027-03-01");
    expect(line.deferral?.window_end).toBe("2029-03-01");
    expect(
      line.deferral?.acquisitions.map((a) => [
        a.event_id,
        a.timing,
        a.units.toString(),
        text(a.amount_eur),
      ]),
    ).toEqual([[id.E15, "posterior", "20", "-40"]]);
    expect(line.criteria).toEqual(["1", "2:fund_1y", "3", "6", "14"]);
  });

  it("E12: E7 counts on the edge d − 2m, E14 misses by one day", () => {
    const line = lineOf(report2028, "E12");
    expect(line.deferral?.window_start).toBe("2028-01-10");
    expect(line.deferral?.window_end).toBe("2028-05-10");
    expect(
      line.deferral?.acquisitions.map((a) => [
        a.event_id,
        a.timing,
        a.units.toString(),
        text(a.amount_eur),
      ]),
    ).toEqual([[id.E7, "prior", "5", "-75"]]);
    expect(line.criteria).toEqual(["1", "2:listed", "3", "6", "14", "24:etc_gain"]);
  });

  it("E13: the cash in lieu of the reverse split, 45.00 − 40.00", () => {
    const line = lineOf(report2028, "E13");
    expect(line.event_type).toBe("forced_sale");
    expect(text(line.proceeds.eur.roundToCents())).toBe("45");
    expect(text(line.cost_eur.roundToCents())).toBe("40");
    expect(line.criteria).toEqual(["3", "6"]);
  });

  it("E17: the swap is valued at the greater value and the fee subtracts from it (#17)", () => {
    const line = lineOf(report2028, "E17");
    expect(text(line.proceeds.eur.roundToCents())).toBe("1190");
    expect(text(line.cost_eur.roundToCents())).toBe("1000");
    expect(line.criteria).toEqual(["1", "3", "6", "17"]);
  });

  /**
   * E22 buys back 2 of its 5 units inside its window: those 2 are not a
   * definitive transmission (#21, DGT V3282-18), so 2/5 of the −75.00 it
   * releases, −30.00, stays deferred on E22, and its own +50.00 is computable
   * whole: 50.00 − 45.00 = +5.00. (The hand calculation of feature 009 netted
   * the release with the gain first, −25.00 × 2/5 = −10.00, the reading
   * V3282-18 rules out.)
   */
  it("E19: releases the −75.00 of E12, not definitive for 2 of 5 units: −30.00 deferred to E22 (#21)", () => {
    const line = lineOf(report2028, "E19");
    expect(line.released.map((r) => [r.origin_event_id, text(r.amount_eur), r.travelled])).toEqual([
      [id.E12, "-75", false],
    ]);
    expect(
      line.deferral?.acquisitions.map((a) => [
        a.event_id,
        a.timing,
        a.units.toString(),
        text(a.amount_eur),
      ]),
    ).toEqual([[id.E22, "posterior", "2", "-30"]]);
    expect(line.deferral?.window_end).toBe("2029-01-02");
    expect(line.criteria).toEqual(["1", "2:listed", "3", "6", "14", "21", "24:etc_gain"]);
  });

  it("E20: 600.00 + 135.00 of cost, releases −30.00 that travelled through the transfer (#15)", () => {
    const line = lineOf(report2028, "E20");
    expect(text(line.cost_eur.roundToCents())).toBe("735");
    expect(line.released.map((r) => [r.origin_event_id, text(r.amount_eur), r.travelled])).toEqual([
      [id.E11, "-30", true],
    ]);
    // It releases, so it is tested for definitiveness: the 10 units left are
    // the ones E15 bought back for E11 (#18 for the 150 it sold, #19 for those),
    // so nothing defers it again.
    expect(line.criteria).toEqual(["1", "2:fund_1y", "3", "6", "14", "15", "18", "19", "21"]);
    // The lots keep the date of the original purchases through the transfer.
    expect(line.lots.map((lot) => [lot.quantity.toString(), lot.acquisition_date])).toEqual([
      ["120", "2027-02-01"],
      ["30", "2028-06-01"],
    ]);
    // The first lot went through the fund transfer E18, from the purchase E1.
    expect(line.lots[0]?.lineage.map((step) => step.event_id)).toEqual([id.E18, id.E1]);
    expect(text(line.withholding?.eur)).toBe("31.35");
  });

  it("E21: 1,299 / 1.20 = 1,082.50 against 1,001 $ at 1.20 = 834.17", () => {
    const line = lineOf(report2028, "E21");
    expect(text(line.proceeds.eur.roundToCents())).toBe("1082.5");
    expect(text(line.cost_eur.roundToCents())).toBe("834.17");
    expect(line.criteria).toEqual(["1", "3", "4", "6"]);
  });

  it("the dollars of E8, E16 and E21 cover what E2 and E9 spent without having them", () => {
    // E8: 202 $ at 1.10 for the 202 $ E2 left owing at 1.10: nothing.
    // E9 spends 1,001 $: the 898 $ left of E8 (816.36) and 103 $ owed at 1.10 (93.64).
    // E16: 14 $ net at 1.25 (11.20) cover 14 of them, worth 12.73: +1.53.
    // E21: 1,299 $ costing 910.00 + 248.33; 89 of them (79.36) cover the rest, worth 80.91: +1.55.
    expect(
      report2028.capital_gains.currency_lines.map((line) => [
        line.event_id,
        line.kind,
        text(line.amount),
        text(line.gain_eur_rounded),
      ]),
    ).toEqual([
      [id.E8, "cover", "202", "0"],
      [id.E16, "cover", "14", "1.53"],
      [id.E21, "cover", "89", "1.55"],
    ]);
  });

  it("adds up to gains 586.41, losses −115.00, balance +471.41", () => {
    // 507.50 before spec 029, + 75.83 on E21 + 3.08 of exchange differences.
    expect(text(report2028.capital_gains.gains_eur)).toBe("586.41");
    expect(text(report2028.capital_gains.losses_eur)).toBe("-115");
    expect(text(report2028.capital_gains.balance_eur)).toBe("471.41");
    expect(report2028.movable_capital.transmissions).toEqual([]);
  });
});

describe("hand-computed exercise, 2028: the rest of the base", () => {
  it("movable capital income: 16.00 + 60.00 − 12.00 = 64.00", () => {
    const m = report2028.movable_capital;
    expect(m.dividends.map((d) => text(d.gross_eur_rounded))).toEqual(["16"]);
    expect(m.interest.map((i) => text(i.gross_eur_rounded))).toEqual(["60"]);
    expect(m.expenses.map((e) => [e.event_id, text(e.amount_eur_rounded)])).toEqual([
      [id.E24, "-12"],
    ]);
    expect(m.expenses[0]?.criteria).toEqual(["6", "23"]);
    expect(text(m.balance_eur)).toBe("64");
  });

  it("offsets the −173.64 of 2027 against the gains in phase 2: base 361.77, nothing pending", () => {
    const c = report2028.compensation;
    expect(
      c.steps.map((s) => [
        s.phase,
        s.from,
        s.origin_year,
        s.against,
        text(s.amount_eur),
        s.limited,
      ]),
    ).toEqual([[2, "capital_gain", 2027, "capital_gain", "173.64", false]]);
    // 471.41 − 173.64 = 297.77; plus 64.00 of movable capital income. Before spec 029,
    // 392.50 − 260.80 = 131.70 and base 195.70.
    expect(text(c.capital_gain_final_eur)).toBe("297.77");
    expect(text(report2028.base_eur)).toBe("361.77");
    expect(c.pending).toEqual([]);
    expect(c.expired).toEqual([]);
  });

  it("defers −145.00, releases −105.00 and keeps −40.00 pending at 31/12, −10.00 of it having travelled", () => {
    const w = report2028.wash_sale;
    expect(w.deferred.map((d) => [d.event_id, text(d.amount_eur_rounded)])).toEqual([
      [id.E11, "-40"],
      [id.E12, "-75"],
      [id.E19, "-30"],
    ]);
    expect(w.released.map((r) => [r.event_id, r.origin_event_id, text(r.amount_eur)])).toEqual([
      [id.E19, id.E12, "-75"],
      [id.E20, id.E11, "-30"],
    ]);
    expect(
      w.pending
        .map((p) => [p.origin_event_id, text(p.amount_eur), p.travelled])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      [id.E11, "-10", true],
      [id.E19, "-30", false],
    ]);
  });

  it("withholds 31.35 + 11.40 = 42.75", () => {
    expect(
      report2028.withholdings.lines.map((l) => [l.event_id, text(l.amount_eur_rounded)]),
    ).toEqual([
      [id.E20, "31.35"],
      [id.E23, "11.4"],
    ]);
    expect(text(report2028.withholdings.total_eur)).toBe("42.75");
  });

  it("limits the 4.80 withheld in the US to the 2.40 of the treaty and says the rest is not deductible", () => {
    const [line] = report2028.double_taxation.lines;
    expect(text(line?.foreign_tax_eur)).toBe("4.8");
    expect(text(line?.deductible_eur)).toBe("2.4");
    expect(text(line?.not_deductible_eur)).toBe("2.4");
    expect(line?.treaty_pct).toBe("15");
  });

  it("says what it does not compute, and that E9 spent dollars without having them", () => {
    const codes = report2028.notes.map((n) => n.code);
    expect(codes).toContain("tax_quota_not_computed");
    expect(codes).toContain("tax_double_taxation_partial");
    const spent = report2028.notes.find((n) => n.code === "tax_currency_spent_without_lots");
    expect(spent?.details).toEqual({ currencies: ["USD"], events: [id.E9] });
    expect(codes).not.toContain("tax_fx_differences_not_computed");
    // E20 releases −30.00 and its window for funds (a year here) runs to
    // 2029-11-15: a purchase of fund_b before then would defer it again.
    expect(
      report2028.notes
        .filter((n) => n.code === "tax_window_open")
        .map((n) => [n.event_id, n.details]),
    ).toEqual([[id.E20, { asset_id: "fund_b", loss_eur: "-30", window_end: "2029-11-15" }]]);
    expect(codes).not.toContain("tax_settings_default_used");
  });

  it("is a fiscal total of both books", () => {
    expect(report2028.scope).toBe("fiscal_total");
    expect(new Set(report2028.capital_gains.lines.map((l) => l.book))).toEqual(
      new Set(["core", "bucket"]),
    );
  });
});

describe("hand-computed exercise, 2028: the doubtful criteria", () => {
  const doubtful = (criterion: string) =>
    report2028.doubtful.find((entry) => entry.criterion === criterion);

  /**
   * With one year, E21 releases the −161.60 of E5 (it was −270.80 before spec
   * 029), E12 defers its whole −150.00 instead of −75.00 (+75.00), and 2027
   * leaves −12.04 pending instead of −173.64 (+161.60): the cover of E5 is not
   * deferred, and it takes the 10.00 offset in 2027 in both readings. Before,
   * −270.80 released against +260.80 less offset gave +65.00.
   */
  it("#2 listed: +75.00 of base with one year, 75.00 more deferred, aggressive", () => {
    const entry = doubtful("2:listed");
    expect(entry?.measure).toBe("difference");
    expect(text(entry?.base_difference_eur)).toBe("75");
    expect(text(entry?.pending_difference_eur)).toBe("0");
    expect(text(entry?.deferred_difference_eur)).toBe("-75");
    expect(entry?.direction).toBe("aggressive");
    // E12 and E19 apply the window; E21 changes because the loss of E5 (2027)
    // would have been deferred into it.
    expect(entry?.event_ids).toEqual([id.E12, id.E19, id.E21]);
    expect(entry?.markets).toEqual(["XETR", "XNAS"]);
  });

  /**
   * The other reading of #4 is now leg by leg: E21 would compute 172.50
   * (−75.83), and its dollars would cost 910.00 + 172.50, so its cover would
   * give +6.74 instead of +1.55 (+5.19). It used to be the other way round,
   * +75.83 and aggressive, when leg by leg was the method applied and no
   * exchange difference was computed.
   */
  it("#4 method: −70.64 leg by leg, conservative", () => {
    const entry = doubtful("4");
    expect(entry?.measure).toBe("difference");
    expect(text(entry?.base_difference_eur)).toBe("-70.64");
    expect(entry?.direction).toBe("conservative");
    expect(entry?.event_ids).toEqual([id.E21, id.E8, id.E16]);
  });

  it("#4 currency FIFO: the 3.08 of exchange differences of the year", () => {
    const entry = doubtful("4:currency_fifo");
    expect(text(entry?.exposure_eur)).toBe("3.08");
    expect(entry?.event_ids).toEqual([id.E8, id.E16, id.E21]);
  });

  it("#15: 30.00 released and 10.00 pending after travelling, conservative", () => {
    const entry = doubtful("15");
    expect(text(entry?.exposure_eur)).toBe("40");
    expect(entry?.direction).toBe("conservative");
  });

  it("#17: the 10.00 fee, aggressive", () => {
    const entry = doubtful("17");
    expect(text(entry?.exposure_eur)).toBe("10");
    expect(entry?.direction).toBe("aggressive");
  });

  it("#21: −30.00 of base with the other reading, conservative", () => {
    // Releasing whatever the transmission: E19 computes −25.00 instead of +5.00.
    const entry = doubtful("21");
    expect(text(entry?.base_difference_eur)).toBe("-30");
    expect(entry?.direction).toBe("conservative");
  });

  it("#1, the category of ETC and #22 move nothing this year", () => {
    expect(text(doubtful("1")?.base_difference_eur)).toBe("0");
    expect(doubtful("1")?.direction).toBe("none");
    expect(text(doubtful("24:etc_gain")?.base_difference_eur)).toBe("0");
    expect(text(doubtful("22")?.exposure_eur)).toBe("0");
  });

  /**
   * The other reading of the window of a fund (criterion #2), hand-computed:
   * with two months, E11 defers nothing —its only repurchase, E15 of 1 June 2028, falls outside
   * [01/01/2028, 01/05/2028]— so its computable goes from −40,00 to −80,00 and
   * E20 stops releasing the −30,00 that travelled to it, going from +135,00 to
   * +165,00. Balance 471,41 − 40,00 + 30,00 = 461,41; base 461,41 − 173,64 +
   * 64,00 = 351,77 against 361,77 (before spec 029, 185,70 against 195,70).
   */
  it("#2 of funds: two months would give 10.00 less base and leave 10.00 less deferred", () => {
    const entry = doubtful("2:fund_1y");
    expect(text(entry?.base_difference_eur)).toBe("-10");
    expect(text(entry?.pending_difference_eur)).toBe("0");
    expect(text(entry?.deferred_difference_eur)).toBe("10");
    expect(entry?.direction).toBe("conservative");
    expect(entry?.certainty).toBe("medium");
  });

  it("lists nothing else", () => {
    expect(report2028.doubtful.map((entry) => entry.criterion)).toEqual([
      "1",
      "2:listed",
      "2:fund_1y",
      "4",
      "4:currency_fifo",
      "15",
      "17",
      "21",
      "22",
      "24:etc_gain",
    ]);
  });
});
