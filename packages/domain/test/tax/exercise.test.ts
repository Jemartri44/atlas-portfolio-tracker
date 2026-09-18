// The hand-computed exercise of specs/009-tax-engine/questions.md, checked
// against the engine. **Every literal here comes from the hand calculation**,
// committed before the engine existed (commit "docs(009): hand-computed tax
// year"); none was copied from the engine's output. A discrepancy is
// investigated and written down in that document before a literal is touched.

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
  it("E5: cost 910.00, proceeds 639.20, loss −270.80, nothing deferred", () => {
    const line = lineOf(report2027, "E5");
    expect(text(line.cost_eur.roundToCents())).toBe("910");
    expect(text(line.proceeds.eur.roundToCents())).toBe("639.2");
    expect(text(line.own_eur.roundToCents())).toBe("-270.8");
    expect(text(line.deferred_eur)).toBe("0");
    expect(line.deferral).toBeUndefined();
    expect(text(line.computable_eur_rounded)).toBe("-270.8");
    expect(line.criteria).toEqual(["1", "2:listed", "3", "4", "6", "14"]);
    expect(line.proceeds.amount.toString()).toBe("799 USD");
    expect(line.proceeds.fx_rate).toBe("1.25");
    expect(line.lots[0]?.root.cost.amount.toString()).toBe("1001 USD");
  });

  it("offsets 10.00 in phase 1 and carries −260.80 until 2031; base 30.00", () => {
    const c = report2027.compensation;
    expect(text(c.capital_gain_eur)).toBe("-270.8");
    expect(text(c.movable_capital_eur)).toBe("40");
    expect(c.steps.map((s) => [s.phase, s.from, s.against, text(s.amount_eur)])).toEqual([
      [1, "capital_gain", "movable_capital", "10"],
    ]);
    expect(
      c.pending.map((p) => [p.origin_year, p.category, text(p.amount_eur), p.expires_after]),
    ).toEqual([[2027, "capital_gain", "-260.8", 2031]]);
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
      ["E19", "50", "-75", "-10", "-15"],
      ["E20", "165", "-30", "0", "135"],
      ["E21", "172.5", "0", "0", "172.5"],
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
    expect(line.criteria).toEqual(["1", "2:fund", "3", "6", "14"]);
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
    expect(line.criteria).toEqual(["1", "2:listed", "3", "6", "14", "etc_etp_category"]);
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

  it("E19: releases the −75.00 of E12, the total is a loss and 2/5 of it is deferred to E22 (#21)", () => {
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
    ).toEqual([[id.E22, "posterior", "2", "-10"]]);
    expect(line.deferral?.window_end).toBe("2029-01-02");
    expect(line.criteria).toEqual(["1", "2:listed", "3", "6", "14", "21", "etc_etp_category"]);
  });

  it("E20: 600.00 + 135.00 of cost, releases −30.00 that travelled through the transfer (#15)", () => {
    const line = lineOf(report2028, "E20");
    expect(text(line.cost_eur.roundToCents())).toBe("735");
    expect(line.released.map((r) => [r.origin_event_id, text(r.amount_eur), r.travelled])).toEqual([
      [id.E11, "-30", true],
    ]);
    expect(line.criteria).toEqual(["1", "2:fund", "3", "6", "14", "15"]);
    // The lots keep the date of the original purchases through the transfer.
    expect(line.lots.map((lot) => [lot.quantity.toString(), lot.acquisition_date])).toEqual([
      ["120", "2027-02-01"],
      ["30", "2028-06-01"],
    ]);
    expect(line.lots[0]?.lineage.map((step) => step.event_id)).toEqual([expect.any(String), id.E1]);
    expect(text(line.withholding?.eur)).toBe("31.35");
  });

  it("E21: 1,299 / 1.20 = 1,082.50 against 910.00", () => {
    const line = lineOf(report2028, "E21");
    expect(text(line.proceeds.eur.roundToCents())).toBe("1082.5");
    expect(line.criteria).toEqual(["1", "3", "4", "6"]);
  });

  it("adds up to gains 502.50, losses −130.00, balance +372.50", () => {
    expect(text(report2028.capital_gains.gains_eur)).toBe("502.5");
    expect(text(report2028.capital_gains.losses_eur)).toBe("-130");
    expect(text(report2028.capital_gains.balance_eur)).toBe("372.5");
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

  it("offsets the −260.80 of 2027 against the gains in phase 2: base 175.70, nothing pending", () => {
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
    ).toEqual([[2, "capital_gain", 2027, "capital_gain", "260.8", false]]);
    expect(text(c.capital_gain_final_eur)).toBe("111.7");
    expect(text(report2028.base_eur)).toBe("175.7");
    expect(c.pending).toEqual([]);
    expect(c.expired).toEqual([]);
  });

  it("defers −125.00, releases −105.00 and keeps −20.00 pending at 31/12, −10.00 of it having travelled", () => {
    const w = report2028.wash_sale;
    expect(w.deferred.map((d) => [d.event_id, text(d.amount_eur_rounded)])).toEqual([
      [id.E11, "-40"],
      [id.E12, "-75"],
      [id.E19, "-10"],
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
      [id.E19, "-10", false],
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

  it("says what it does not compute, and lists E8", () => {
    const codes = report2028.notes.map((n) => n.code);
    expect(codes).toContain("tax_quota_not_computed");
    expect(codes).toContain("tax_double_taxation_partial");
    const fx = report2028.notes.find((n) => n.code === "tax_fx_differences_not_computed");
    expect(fx?.details).toEqual({ currencies: ["USD"], fx_exchanges: [id.E8] });
    expect(codes).not.toContain("tax_window_open");
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

  it("#2 listed: +65.00 of base with one year, 75.00 more deferred, aggressive", () => {
    const entry = doubtful("2:listed");
    expect(entry?.measure).toBe("difference");
    expect(text(entry?.base_difference_eur)).toBe("65");
    expect(text(entry?.pending_difference_eur)).toBe("0");
    expect(text(entry?.deferred_difference_eur)).toBe("-75");
    expect(entry?.direction).toBe("aggressive");
    // E12 and E19 apply the window; E21 changes because the loss of E5 (2027)
    // would have been deferred into it.
    expect(entry?.event_ids).toEqual([id.E12, id.E19, id.E21]);
    expect(entry?.markets).toEqual(["XETR", "XNAS"]);
  });

  it("#4 method: +75.83 on E21, aggressive", () => {
    const entry = doubtful("4");
    expect(entry?.measure).toBe("difference");
    expect(text(entry?.base_difference_eur)).toBe("75.83");
    expect(entry?.direction).toBe("aggressive");
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

  it("#21: −10.00 of base with the other reading, conservative", () => {
    const entry = doubtful("21");
    expect(text(entry?.base_difference_eur)).toBe("-10");
    expect(entry?.direction).toBe("conservative");
  });

  it("#1, the category of ETC and #22 move nothing this year", () => {
    expect(text(doubtful("1")?.base_difference_eur)).toBe("0");
    expect(doubtful("1")?.direction).toBe("none");
    expect(text(doubtful("etc_etp_category")?.base_difference_eur)).toBe("0");
    expect(text(doubtful("22")?.exposure_eur)).toBe("0");
  });

  it("lists nothing else", () => {
    expect(report2028.doubtful.map((entry) => entry.criterion)).toEqual([
      "1",
      "2:listed",
      "4",
      "15",
      "17",
      "21",
      "22",
      "etc_etp_category",
    ]);
  });
});
