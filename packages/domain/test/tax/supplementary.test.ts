// The hand-computed supplementary return of `specs/010-tax-output/questions.md`
// §6.3, checked against the engine.
//
// **Every literal here comes from that hand calculation**, written and
// committed before any of this code existed (commit "docs(010): record the
// answers and the hand-computed returns"); none was copied from the engine's
// output. A discrepancy is investigated and written down there before a
// literal is touched.
//
// And the ledger is built on `HAND_SETTINGS`, which writes the configuration
// down in full, instead of on the documented defaults: a calculation whose
// literals move when the code changes its mind about a default is a mirror of
// the engine, not a check on it.

import { describe, expect, it } from "vitest";
import { closedYearImpact } from "../../src/filings/closed-years.js";
import type { FilingCauses, FilingFigure } from "../../src/filings/comparison.js";
import type { Money } from "../../src/money/money.js";
import type { LedgerEvent, TaxReturnFiledEvent } from "../../src/schema/events.js";
import { normalizeSettings } from "../../src/settings/settings.js";
import { taxYear } from "../../src/tax/year.js";
import { buy, HAND_SETTINGS, sell, taxBuilder } from "./helpers.js";

const text = (money: Money | undefined): string =>
  money === undefined ? "—" : money.amount.toString();

/**
 * The configuration in force when the first return was filed: the 25 % limit.
 * `HAND_SETTINGS`, not the defaults — every value this exercise depends on is
 * written down there, so no change of a documented default can move a literal
 * of this file without the file saying so.
 */
const AT_25 = normalizeSettings(HAND_SETTINGS);
/** The one in force after C11, which lowers the limit to 20 %. */
const AT_20 = normalizeSettings({ ...HAND_SETTINGS, savings_offset_limit_pct: "20" });

interface Exercise {
  events: LedgerEvent[];
  id: Record<string, string>;
}

/**
 * The ledger of §6.3, event by event as the table lists them. `upTo` cuts it
 * where a step needs it, so each step is read on the ledger it had then.
 */
const exercise = (upTo = "C11", computedBase = "30"): Exercise => {
  const b = taxBuilder(HAND_SETTINGS);
  const id: Record<string, string> = {};
  const stop = (label: string) => upTo === label;
  id.C1 = buy(b, "fund_f", "2027-01-11", "100", "10").id;
  id.C2 = buy(b, "stock_s", "2027-02-01", "10", "100").id;
  id.C3 = sell(b, "stock_s", "2027-06-01", "10", "50").id;
  const c4 = sell(b, "fund_f", "2027-11-10", "100", "12");
  id.C4 = c4.id;
  id.C5 = b.interest({ account_id: "acc_a", value_date: "2027-12-20", gross: "40" }).id;
  id.C6 = buy(b, "stock_t", "2028-02-01", "10", "100").id;
  id.C7 = sell(b, "stock_t", "2028-09-01", "10", "180").id;
  if (stop("C7")) {
    return { events: b.build(), id };
  }
  // F1: what the application computed that day is what was filed.
  const filedFigures = (pending: string) => ({
    savings_base_eur: "30",
    pending_losses: [{ origin_year: 2027, category: "capital_gain" as const, amount_eur: pending }],
    deferred_losses_eur: "0",
  });
  id.F1 = b.filed({
    tax_year: 2027,
    filed_at: "2028-06-10",
    declared: filedFigures("-290"),
    computed: {
      as_of: "2028-06-10",
      settings_origin: "default",
      settings: AT_25,
      ...filedFigures("-290"),
    },
  }).id;
  if (stop("F1")) {
    return { events: b.build(), id };
  }
  id.C8 = b.reversal(id.C4 as string, "el precio estaba mal").id;
  const c9 = sell(b, "fund_f", "2027-11-10", "100", "13");
  c9.corrects_id = id.C4 as string;
  id.C9 = c9.id;
  if (stop("C9")) {
    return { events: b.build(), id };
  }
  // F2, the supplementary return: it declares −200,00 where the application
  // computed −190,00, because the user changed it before filing.
  id.F2 = b.filed({
    tax_year: 2027,
    filed_at: "2028-11-05",
    supersedes: id.F1 as string,
    declared: filedFigures("-200"),
    computed: {
      as_of: "2028-11-05",
      settings_origin: "default",
      settings: AT_25,
      ...filedFigures("-190"),
      savings_base_eur: computedBase,
    },
  }).id;
  if (stop("F2")) {
    return { events: b.build(), id };
  }
  id.C10 = b.interest({ account_id: "acc_a", value_date: "2027-12-28", gross: "20" }).id;
  id.C11 = b.settings({ ...HAND_SETTINGS, savings_offset_limit_pct: "20" }).id;
  return { events: b.build(), id };
};

describe("the hand-computed supplementary return, step by step (§6.3)", () => {
  it("step 1: 2027 as the application computed it the day the first return was filed", () => {
    const report = taxYear(exercise("C7").events, 2027, { today: "2028-06-10" });
    expect(text(report.base_eur)).toBe("30");
    expect(
      report.compensation.pending.map((p) => [p.origin_year, p.category, text(p.amount_eur)]),
    ).toEqual([[2027, "capital_gain", "-290"]]);
    expect(report.wash_sale.deferred).toEqual([]);
    // The two-month window of a listed security: the buy of 1 February is
    // outside [01/04, 01/08], so the whole loss is computable.
    expect(text(report.capital_gains.balance_eur)).toBe("-300");
  });

  it("step 2: correcting the sale warns about the return of 2027 and says what it moves", () => {
    const before = exercise("F1");
    const after = exercise("C9");
    const [impact] = closedYearImpact(
      { events: before.events },
      { events: after.events },
      "2028-10-01",
    );
    expect(impact?.year).toBe(2027);
    expect(impact?.filing_id).toBe(before.id.F1);
    expect(impact?.by_date).toBe(true);
    expect(impact?.moves.map((move) => [move.figure, move.before, move.after])).toEqual([
      ["pending:2027:capital_gain", "-290", "-190"],
    ]);
  });

  it("step 4: the late interest moves the base and the pending of the supplementary return", () => {
    const before = exercise("F2");
    const after = exercise("C11");
    // Only the interest, without the change of settings: the fourth step.
    const events = after.events.filter((event) => event.id !== after.id.C11);
    const [impact] = closedYearImpact({ events: before.events }, { events }, "2029-01-10");
    expect(impact?.filing_id).toBe(after.id.F2);
    expect(impact?.moves.map((move) => [move.figure, move.before, move.after])).toEqual([
      ["savings_base", "30", "45"],
      ["pending:2027:capital_gain", "-190", "-185"],
    ]);
  });

  it("step 5: lowering the limit to 20 % moves it again, and only that year", () => {
    const after = exercise("C11");
    const events = after.events.filter((event) => event.id !== after.id.C11);
    const [impact, ...rest] = closedYearImpact(
      { events, settings: AT_25 },
      { events, settings: AT_20 },
      "2029-01-10",
    );
    expect(rest).toEqual([]);
    expect(impact?.moves.map((move) => [move.figure, move.before, move.after])).toEqual([
      ["savings_base", "45", "48"],
      ["pending:2027:capital_gain", "-185", "-188"],
    ]);
  });

  it("step 7: 2028 is anchored on the return in force that day, not on the last one written", () => {
    const { events } = exercise();
    // With the supplementary return in force: −200,00 declared.
    expect(text(taxYear(events, 2028, { today: "2029-01-10" }).base_eur)).toBe("600");
    // Before it was filed, the original one was in force: −290,00.
    expect(text(taxYear(events, 2028, { today: "2028-08-01" }).base_eur)).toBe("510");
    // And with no return at all, what the ledger computes today: −188,00.
    const noFilings = events.filter((event) => event.type !== "tax_return_filed");
    expect(text(taxYear(noFilings, 2028, { today: "2029-01-10" }).base_eur)).toBe("612");
  });

  it("step 8: the four causes of the difference, and they add up to it", () => {
    const { events, id } = exercise();
    const report = taxYear(events, 2027, { today: "2029-01-10" });
    expect(report.filing?.filing_id).toBe(id.F2);
    expect(report.filing?.chain).toEqual([id.F1, id.F2]);
    expect(report.filing?.fingerprint_ok).toBe(true);
    const figure = (name: string) => report.filing?.figures.find((entry) => entry.figure === name);
    const base = figure("savings_base");
    const pending = figure("pending:2027:capital_gain");
    expect([text(base?.declared), text(base?.computed_then), text(base?.now)]).toEqual([
      "30",
      "30",
      "48",
    ]);
    expect([text(pending?.declared), text(pending?.computed_then), text(pending?.now)]).toEqual([
      "-200",
      "-190",
      "-188",
    ]);
    expect([
      text(base?.causes?.at_filing),
      text(base?.causes?.engine),
      text(base?.causes?.settings),
      text(base?.causes?.later_events),
    ]).toEqual(["0", "0", "2", "16"]);
    expect([
      text(pending?.causes?.at_filing),
      text(pending?.causes?.engine),
      text(pending?.causes?.settings),
      text(pending?.causes?.later_events),
    ]).toEqual(["10", "0", "-2", "4"]);
    // The four add up to the whole difference, exactly.
    const adds = (entry: FilingFigure): string => {
      const causes = entry.causes as FilingCauses;
      return text(
        causes.at_filing.add(causes.engine).add(causes.settings).add(causes.later_events),
      );
    };
    const whole = (entry: FilingFigure): string => text(entry.now.sub(entry.declared));
    expect(adds(base as FilingFigure)).toBe(whole(base as FilingFigure));
    expect(adds(pending as FilingFigure)).toBe(whole(pending as FilingFigure));
  });

  it("the cause «engine» is what an older version of the application would show", () => {
    // The same ledger with an F2 that recorded a base of 31,00, as an engine
    // of the time would have computed it: the engine cause is −1,00.
    const { events } = exercise("C11", "31");
    const report = taxYear(events, 2027, { today: "2029-01-10" });
    const base = report.filing?.figures.find((entry) => entry.figure === "savings_base");
    expect(text(base?.computed_then)).toBe("31");
    expect(text(base?.causes?.engine)).toBe("-1");
    expect(text(base?.causes?.at_filing)).toBe("1");
  });

  it("with a fingerprint that no longer names its prefix, it compares without causes", () => {
    const { events, id } = exercise();
    const broken = events.map((event) =>
      event.id === id.F2
        ? ({
            ...(event as TaxReturnFiledEvent),
            ledger_fingerprint: {
              ...(event as TaxReturnFiledEvent).ledger_fingerprint,
              lines: 1,
            },
          } as LedgerEvent)
        : event,
    );
    const report = taxYear(broken, 2027, { today: "2029-01-10" });
    expect(report.filing?.fingerprint_ok).toBe(false);
    // The figures are still compared: what cannot be said is **why**.
    const base = report.filing?.figures.find((entry) => entry.figure === "savings_base");
    expect(text(base?.declared)).toBe("30");
    expect(text(base?.now)).toBe("48");
    expect(base?.causes).toBeUndefined();
  });
});
