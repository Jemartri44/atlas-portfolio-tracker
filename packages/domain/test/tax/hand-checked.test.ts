// Five years computed by hand (feature 009, fiscal review): the ledger of
// `tests/fixtures/ledger/tax-hand-v1.jsonl`, with compensation inside the year
// and across years, releases, an expiry, a transfer chain, a reverse split
// with cash in lieu, a swap, a dividend and a sale in dollars and a custody fee
// in dollars at a rate of its own.
//
// `synthetic-v1.tax.json` is written by the engine itself: it says that
// something changed, not that it is right. Here every figure is a literal
// worked out by hand, and the working is in the comment above it. The
// fiscal reviewer computed the first version by hand and the engine matched it
// to the cent; the custody fee of 2024 was added afterwards, and its effect on
// 2024 is worked out below.

import { describe, expect, it } from "vitest";
import type { Money } from "../../src/money/money.js";
import { decodeLine } from "../../src/schema/line.js";
import type { TaxYearReport } from "../../src/tax/report.js";
import { taxYear } from "../../src/tax/year.js";
import { fixtureLines } from "../fixtures-path.js";

/** The events of the ledger, by the name the working uses. */
const ID = {
  P2: "01ARYZ6S41TSV4RRFFQ690000M",
  F2: "01ARYZ6S41TSV4RRFFQ690000Q",
  S3: "01ARYZ6S41TSV4RRFFQ690000W",
  SX1: "01ARYZ6S41TSV4RRFFQ690000X",
  S5: "01ARYZ6S41TSV4RRFFQ690000Y",
  S6: "01ARYZ6S41TSV4RRFFQ690000Z",
  RS: "01ARYZ6S41TSV4RRFFQ6900010",
  U2: "01ARYZ6S41TSV4RRFFQ6900011",
  U3: "01ARYZ6S41TSV4RRFFQ6900012",
  I1: "01ARYZ6S41TSV4RRFFQ6900013",
  F4: "01ARYZ6S41TSV4RRFFQ6900015",
  SX2: "01ARYZ6S41TSV4RRFFQ6900016",
  T3: "01ARYZ6S41TSV4RRFFQ690001A",
  Y2: "01ARYZ6S41TSV4RRFFQ690001B",
  I2: "01ARYZ6S41TSV4RRFFQ690001C",
  Y3: "01ARYZ6S41TSV4RRFFQ690001E",
  F5: "01ARYZ6S41TSV4RRFFQ690001F",
  D1: "01ARYZ6S41TSV4RRFFQ690001J",
  C2: "01ARYZ6S41TSV4RRFFQ690001K",
  FX: "01ARYZ6S41TSV4RRFFQ690001M",
  I3: "01ARYZ6S41TSV4RRFFQ690001N",
  Y4: "01ARYZ6S41TSV4RRFFQ690001Q",
  FE: "01ARYZ6S41TSV4RRFFQ690001R",
  I4: "01ARYZ6S41TSV4RRFFQ690001S",
} as const;

const NAME = new Map<string, string>(Object.entries(ID).map(([name, id]) => [id, name]));
const nameOf = (id: string | undefined): string => NAME.get(id ?? "") ?? `? ${id}`;
const eur = (money: Money | undefined): string =>
  money === undefined ? "—" : money.roundToCents().amount.toString();

const events = fixtureLines("tax-hand-v1.jsonl").map((line) => decodeLine(line).event);
const reportOf = (year: number): TaxYearReport => taxYear(events, year, { today: "2026-09-18" });

/** Each transmission: own result, released, deferred and computable, in euros. */
const lines = (report: TaxYearReport) =>
  [...report.capital_gains.lines, ...report.movable_capital.transmissions].map((line) => [
    nameOf(line.event_id),
    eur(line.own_eur),
    eur(line.released_eur),
    eur(line.deferred_eur),
    eur(line.computable_eur_rounded),
  ]);

const steps = (report: TaxYearReport) =>
  report.compensation.steps.map((step) => [
    step.phase,
    step.origin_year,
    step.against,
    eur(step.amount_eur),
    step.limited,
  ]);

const carried = (entries: TaxYearReport["compensation"]["pending"]) =>
  entries.map((entry) => [
    entry.origin_year,
    entry.category,
    eur(entry.amount_eur),
    entry.expires_after,
  ]);

const pending = (report: TaxYearReport) =>
  report.wash_sale.pending.map((entry) => [
    nameOf(entry.origin_event_id),
    entry.lot_id === undefined ? `awaits ${nameOf(entry.awaiting_event_id)}` : entry.asset_id,
    eur(entry.amount_eur),
    entry.travelled,
  ]);

const doubtful = (report: TaxYearReport, criterion: string) =>
  report.doubtful.find((item) => item.criterion === criterion);

describe("the hand-checked ledger, year by year", () => {
  it("2020: a loss of 800 that nothing absorbs, carried for four years", () => {
    const report = reportOf(2020);
    // 100 × 12 − 100 × 20 = 1,200 − 2,000 = −800; nothing bought in the window.
    expect(lines(report)).toEqual([["P2", "-800", "0", "0", "-800"]]);
    expect(eur(report.capital_gains.balance_eur)).toBe("-800");
    expect(steps(report)).toEqual([]);
    // Four years: it can be used until 2024.
    expect(carried(report.compensation.pending)).toEqual([[2020, "capital_gain", "-800", 2024]]);
    expect(eur(report.base_eur)).toBe("0");
  });

  it("2021: two deferrals, a sale in dollars, and 2020 absorbs the gains and 25 % of the income", () => {
    const report = reportOf(2021);
    // SX1: 12 × 7 = 84 against 10 × 10 + 2 × 12 = 124: −40. Two-month window
    // [01-05, 01-09]: S3 (4 held, 01-05) and S5 (2, 01-09) cover 6 of 12 units:
    // −40 × 6/12 = −20 deferred, −20 computable.
    // RS: the reverse split 1:4 leaves 0.5 in cash at 40: 20 against the 0.5 of
    // S2 left, 0.5/0.75 of its remaining 36 = 24: −4. Window [01-08, 01-12]: S5
    // is used by SX1 (#19), S6 (1.5 after the split) takes 0.5: −4 deferred.
    // U3: (1,200 − 2) / 1.10 = 1,089.0909… against (1,000 + 2) / 1.20 = 835:
    // +254.09.
    expect(lines(report)).toEqual([
      ["SX1", "-40", "0", "-20", "-20"],
      ["RS", "-4", "0", "-4", "0"],
      ["U3", "254.09", "0", "0", "254.09"],
    ]);
    expect(eur(report.capital_gains.gains_eur)).toBe("254.09");
    expect(eur(report.capital_gains.losses_eur)).toBe("-20");
    expect(eur(report.capital_gains.balance_eur)).toBe("234.09");
    // Dividend 30 USD / 1.20 = 25; interest 40: 65 of movable capital.
    expect(
      report.movable_capital.dividends.map((d) => [nameOf(d.event_id), eur(d.gross_eur_rounded)]),
    ).toEqual([["U2", "25"]]);
    expect(
      report.movable_capital.interest.map((i) => [nameOf(i.event_id), eur(i.gross_eur_rounded)]),
    ).toEqual([["I1", "40"]]);
    expect(eur(report.movable_capital.balance_eur)).toBe("65");
    // 2020 absorbs the 234.09 of gains whole, then up to 25 % of 65 = 16.25 of
    // the income: 800 − 234.09 − 16.25 = 549.66 left. Base 65 − 16.25 = 48.75.
    expect(eur(report.compensation.limit_eur.capital_gain)).toBe("58.52");
    expect(eur(report.compensation.limit_eur.movable_capital)).toBe("16.25");
    expect(steps(report)).toEqual([
      [2, 2020, "capital_gain", "234.09", false],
      [2, 2020, "movable_capital", "16.25", true],
    ]);
    expect(carried(report.compensation.pending)).toEqual([[2020, "capital_gain", "-549.66", 2024]]);
    expect(eur(report.base_eur)).toBe("48.75");
    // The Spanish withholding of the interest; the dividend had none in Spain.
    expect(eur(report.withholdings.total_eur)).toBe("7.6");
    // 9 USD / 1.20 = 7.50 withheld in the US; the treaty's 15 % of 25 = 3.75.
    expect(
      report.double_taxation.lines.map((line) => [
        nameOf(line.event_id),
        eur(line.foreign_tax_eur),
        eur(line.deductible_eur),
        eur(line.not_deductible_eur),
      ]),
    ).toEqual([["U2", "7.5", "3.75", "3.75"]]);
    // 20 × 4/6 = 13.33 on S3 and 20 × 2/6 = 6.67 on S5; the 4 of RS on S6.
    expect(pending(report)).toEqual([
      ["SX1", "stk_eu", "-13.33", false],
      ["SX1", "stk_eu", "-6.67", false],
      ["RS", "stk_eu", "-4", false],
    ]);
    // #4 the other way: (1,198 − 1,002) USD = 196 USD / 1.10 = 178.18, 75.91 less.
    expect(eur(doubtful(report, "4")?.base_difference_eur)).toBe("-75.91");
    expect(doubtful(report, "4")?.direction).toBe("conservative");
    // Only 2020 has losses to carry: no other year competes with it.
    expect(eur(doubtful(report, "22")?.exposure_eur)).toBe("0");
  });

  it("2022: the fund loss waits on a purchase of 2023, the transfer chain carries its share", () => {
    const report = reportOf(2022);
    // F4: 904.50 against F1's 1,005: −100.50. One-year window [2021-02-10,
    // 2023-02-10]: F2 (20.25, 2021-02-10) and F5 (30, 2023-02-10) cover 50.25
    // of 100.5 units: −50.25 deferred.
    // SX2: the last 4 stk_eu at 30 = 120 against 12 + 33 + 44 + 16 + 48 = 153:
    // −33, and it releases what S3, S5 and S6 carried: −13.33 − 6.67 − 4 = −24.
    // Y2: 80 against Y1's 100: −20, all deferred on Y3 (10, 2023-01-10); Y1 was
    // sold by Y2 itself (#18).
    expect(lines(report)).toEqual([
      ["F4", "-100.5", "0", "-50.25", "-50.25"],
      ["SX2", "-33", "-24", "0", "-57"],
      ["Y2", "-20", "0", "-20", "0"],
    ]);
    expect(eur(report.capital_gains.balance_eur)).toBe("-107.25");
    expect(eur(report.movable_capital.balance_eur)).toBe("50");
    // The year's own loss first, against 25 % of its income: 12.50. 94.75 left
    // for later; 2020 has no room left this year.
    expect(steps(report)).toEqual([[1, 2022, "movable_capital", "12.5", true]]);
    expect(carried(report.compensation.pending)).toEqual([
      [2020, "capital_gain", "-549.66", 2024],
      [2022, "capital_gain", "-94.75", 2026],
    ]);
    expect(eur(report.base_eur)).toBe("37.5");
    expect(eur(report.withholdings.total_eur)).toBe("9.5");
    // At 31/12 the −30 of F4 and the −20 of Y2 wait for purchases of January
    // and February; −5.25 is on what is left of F2, and −15 went with the 15
    // units of F2 that travelled to fund_b, fund_c and fund_d (T1, T2, T3).
    expect(pending(report)).toEqual([
      ["F4", "awaits F5", "-30", false],
      ["Y2", "awaits Y3", "-20", false],
      ["F4", "fund_x", "-5.25", false],
      ["F4", "fund_d", "-15", true],
    ]);
    // What travelled and is pending is at stake under #15.
    expect(eur(doubtful(report, "15")?.exposure_eur)).toBe("15");
    // #18 the other way would count Y1 too, but it is of high certainty since
    // 2026-09-23 (the manual of the AEAT says it literally) and no longer
    // offers an alternative reading.
    expect(doubtful(report, "18")).toBeUndefined();
  });

  it("2023: releases through the transfers, a swap, and two years that compete", () => {
    const report = reportOf(2023);
    // D1: 20 fund_d at 17 = 340 against 120 + 180 = 300: +40; releases the −15
    // that travelled: +25.
    // C2: swap valued at what it hands over, 1,300 − 15 of fee = 1,285, against
    // 1,000: +285.
    // FX: 35.25 at 12 = 423 against 5.25 × 12 + 30 × 10 = 363: +60; releases
    // −5.25 (F2) and −30 (F5): +24.75.
    expect(lines(report)).toEqual([
      ["D1", "40", "-15", "0", "25"],
      ["C2", "285", "0", "0", "285"],
      ["FX", "60", "-35.25", "0", "24.75"],
    ]);
    expect(eur(report.capital_gains.gains_eur)).toBe("334.75");
    expect(eur(report.movable_capital.balance_eur)).toBe("20");
    // The oldest first: 2020 absorbs 334.75 of gains and 25 % of 20 = 5 of
    // income; 549.66 − 339.75 = 209.91 left of 2020, and 2022 gets nothing.
    expect(steps(report)).toEqual([
      [2, 2020, "capital_gain", "334.75", false],
      [2, 2020, "movable_capital", "5", true],
    ]);
    expect(carried(report.compensation.pending)).toEqual([
      [2020, "capital_gain", "-209.91", 2024],
      [2022, "capital_gain", "-94.75", 2026],
    ]);
    expect(eur(report.base_eur)).toBe("15");
    expect(eur(report.withholdings.total_eur)).toBe("3.8");
    expect(
      report.wash_sale.released.map((r) => [
        nameOf(r.event_id),
        nameOf(r.origin_event_id),
        eur(r.amount_eur),
        r.travelled,
      ]),
    ).toEqual([
      ["D1", "F4", "-15", true],
      ["FX", "F4", "-5.25", false],
      ["FX", "F4", "-30", false],
    ]);
    // Y2's −20 now sits on Y3's lot.
    expect(pending(report)).toEqual([["Y2", "fund_y", "-20", false]]);
    // The fee of the swap, 15, is what #17 puts at stake.
    expect(eur(doubtful(report, "17")?.exposure_eur)).toBe("15");
    // 2020 and 2022 both had losses to carry and the year could not take them
    // all: the order decided which 339.75 were used.
    expect(eur(doubtful(report, "22")?.exposure_eur)).toBe("339.75");
  });

  it("2024: a custody fee in dollars at its own rate, and what is left of 2020 expires", () => {
    const report = reportOf(2024);
    // Y4: 95 against Y3's 90: +5; releases Y2's −20: −15.
    expect(lines(report)).toEqual([["Y4", "5", "-20", "0", "-15"]]);
    expect(eur(report.capital_gains.balance_eur)).toBe("-15");
    // 12.50 USD / 1.25 = 10.00 at the rate of its own day, not at 1.20 or 1.10
    // of the other operations in dollars. Interest 100 − 10 = 90.
    expect(
      report.movable_capital.expenses.map((e) => [nameOf(e.event_id), eur(e.amount_eur_rounded)]),
    ).toEqual([["FE", "-10"]]);
    expect(eur(report.movable_capital.balance_eur)).toBe("90");
    // 25 % of 90 = 22.50: the year's own −15 first, then 7.50 of 2020.
    expect(eur(report.compensation.limit_eur.movable_capital)).toBe("22.5");
    expect(steps(report)).toEqual([
      [1, 2024, "movable_capital", "15", true],
      [2, 2020, "movable_capital", "7.5", true],
    ]);
    // 209.91 − 7.50 = 202.41 of 2020 expires with the year; 2022 goes on.
    expect(carried(report.compensation.expired)).toEqual([[2020, "capital_gain", "-202.41", 2024]]);
    expect(carried(report.compensation.pending)).toEqual([[2022, "capital_gain", "-94.75", 2026]]);
    // 90 − 15 − 7.50.
    expect(eur(report.base_eur)).toBe("67.5");
    expect(eur(report.withholdings.total_eur)).toBe("19");
    expect(pending(report)).toEqual([]);
    // 2020 used 7.50 and 2022 nothing, and 2020 expires: the order is at stake.
    expect(eur(doubtful(report, "22")?.exposure_eur)).toBe("7.5");
  });
});
