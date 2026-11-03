// The core's return **after the income tax it causes**, next to the one before (never instead).
//
// It reads prices (the value of the core), so it lives with the charts and reads the tax engine,
// never the other way round: no tax calculation may depend on a price (constitution II).
//
// The same flows and value as `coreXirr`, plus one cost per closed year: the core's part of what
// the portfolio adds to the estimated result of the savings part of the return,
//
//   added = result(the portfolio and the income from outside) − result(only the income from outside)
//
// where `result = quota − double taxation deduction − withholdings` (`savingsQuota`). The
// withholdings of the portfolio already left its cash, so only the rest is a new cost; the income
// from outside is taken away because it is not the portfolio's (art. 49 LIRPF offsets both in one
// base, so the difference is what the portfolio adds at the margin).
//
// - **Split between the books** in proportion to what each adds to the base of the year with its
//   own lines (gains and losses, income, expenses), with their sign, the core's share bounded to
//   0–100 %: the quota is per taxpayer, the return is only the core's (constitution III). What a
//   year carries forward is not split again: it is in the base it offsets.
// - **Dated** the day the return of that year was paid (several instalments, in proportion to
//   their amount) or, with no payment recorded, on 30/06 of the next year, the end of the
//   campaign. A cost dated after the end date is still owed: it counts at the end date.
// - **What was paid is never subtracted**: it is the whole return (work, business…).
// - A ledger with invalid events, or a closed year the engine refuses (one before the regime of
//   2018), gives no figure, and says which year and why. Every year from 2018 has a scale
//   (`savings-scale.ts`); one later than the day it was checked keeps the notes of the quota, as
//   the estimate does.
//
// The tax is a cost the money of the portfolio bears without becoming value: in the equation of
// the rate it enters as one more contribution.

import { type CivilDate, daysBetween } from "../dates/civil-date.js";
import { Decimal, HUNDRED } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { projectLedger } from "../projections/project-ledger.js";
import { settingsAt } from "../projections/settings-at.js";
import type { Account, LedgerState } from "../projections/state.js";
import type { LedgerEvent } from "../schema/events.js";
import { tryReading } from "../tax/chain.js";
import { type QuotaNote, savingsQuota } from "../tax/quota.js";
import type { TaxYearReport } from "../tax/report.js";
import { taxYear } from "../tax/year.js";
import { coreCashFlows } from "./contributed.js";
import { annualRateOf, type CoreXirr, coreXirr } from "./core-xirr.js";

/** The reading of the year would start before 2018, the regime the engine applies. */
export type AfterTaxYearGap = "unsupported";

export interface AfterTaxYear {
  year: number;
  /** What the portfolio adds to the estimated result of the savings part; negative, what it saves. */
  added_eur?: Money;
  /** The core's share of the base of the year, percent, 0 to 100. */
  core_share_pct?: Decimal;
  /** `added × share`: the core's cost of the year. */
  core_eur?: Money;
  /** When the cost is counted: the payments of the year in proportion, or 30/06 of the next. */
  dated: { date: CivilDate; eur: Money }[];
  /** The notes of the estimated quota of the year (a scale after the check, the settings'). */
  notes: QuotaNote[];
  gap?: AfterTaxYearGap;
}

export interface CoreXirrAfterTax {
  /** The return before tax, exactly as `coreXirr` gives it. */
  before: CoreXirr;
  /** The closed years from the first flow of the core to `to`. */
  years: AfterTaxYear[];
  /** The core's tax of every closed year, added up. */
  tax_eur?: Money;
  /** `value − contributed − tax`. */
  gain_eur?: Money;
  /** The annual money-weighted rate with the tax as a contribution, percent, 4 decimals. */
  xirr_pct?: Decimal;
  /**
   * Why there is no figure: the one before has none (its own gap), the ledger has invalid
   * events, a closed year has none, or the rate after tax has no root.
   */
  gap?: "before" | "invalid" | "year" | "no_rate";
}

const zero = Money.zero("EUR");
const HALF_YEAR_END = "06-30";

/** The year's own lines of the report that add to the base, by the book of their account. */
const shareOfCore = (report: TaxYearReport, state: LedgerState): Decimal => {
  const byBook = { core: zero, bucket: zero };
  const add = (account: string, amount: Money): void => {
    // Every line comes from an account the ledger created.
    const book = (state.accounts.get(account) as Account).book;
    byBook[book] = byBook[book].add(amount);
  };
  for (const line of [...report.capital_gains.lines, ...report.movable_capital.transmissions]) {
    add(line.account_id, line.computable_eur_rounded);
  }
  for (const line of report.capital_gains.currency_lines) {
    add(line.account_id, line.computable_eur_rounded);
  }
  for (const line of [...report.movable_capital.dividends, ...report.movable_capital.interest]) {
    add(line.account_id, line.gross_eur_rounded);
  }
  for (const line of report.movable_capital.expenses) {
    add(line.account_id, line.amount_eur_rounded);
  }
  const total = byBook.core.add(byBook.bucket);
  if (total.isZero()) {
    return Decimal.ZERO;
  }
  const share = byBook.core.amount.div(total.amount);
  return share.isNegative() ? Decimal.ZERO : share.gt(Decimal.ONE) ? Decimal.ONE : share;
};

/** Only what is not the portfolio's: the income from outside, its reversals, the settings. */
const outsideOnly = (events: readonly LedgerEvent[]): LedgerEvent[] => {
  const outside = new Set(
    events.filter((event) => event.type === "external_income").map((event) => event.id),
  );
  return events.filter(
    (event) =>
      event.type === "settings_changed" ||
      outside.has(event.id) ||
      (event.type === "reversal" && outside.has(event.reverses_id)),
  );
};

/**
 * The estimated result of the savings part of `year`, read with the income from outside. Every
 * year the engine reads (from 2018) has a scale, so there is always a result.
 */
const quotaOf = (
  events: readonly LedgerEvent[],
  state: LedgerState,
  year: number,
  to: CivilDate,
): { report: TaxYearReport; result: Money; notes: QuotaNote[] } => {
  const report = taxYear(events, year, { today: to, external: true });
  const brackets = settingsAt(state, `${year}-12-31`).settings.savings_tax_brackets;
  const quota = savingsQuota(report, brackets);
  return { report, result: quota.result_eur as Money, notes: quota.notes };
};

/** The cost of the year spread over the payments recorded for it, or on 30/06 of the next. */
const datesOf = (state: LedgerState, year: number, cost: Money): AfterTaxYear["dated"] => {
  const payments = state.taxPayments.filter((entry) => entry.tax_year === year);
  if (payments.length === 0) {
    return [{ date: `${year + 1}-${HALF_YEAR_END}`, eur: cost }];
  }
  const total = payments.reduce(
    (sum, entry) => sum.add(Money.of(entry.amount_eur.amount.abs(), "EUR")),
    zero,
  );
  return payments.map((entry) => ({
    date: entry.date,
    eur: cost.mul(entry.amount_eur.amount.abs()).div(total.amount),
  }));
};

const closedYear = (
  events: readonly LedgerEvent[],
  outside: readonly LedgerEvent[],
  state: LedgerState,
  year: number,
  to: CivilDate,
): AfterTaxYear => {
  const all = tryReading(() => quotaOf(events, state, year, to));
  if ("unsupported" in all) {
    return { year, dated: [], notes: [], gap: "unsupported" };
  }
  // The income from outside is part of the ledger read above: if that reading was supported, so
  // is this one, which starts no earlier.
  const hasOutside = state.externalIncome.some((entry) => entry.year === year);
  const alone = hasOutside ? quotaOf(outside, state, year, to).result : zero;
  const added = all.result.sub(alone);
  const share = shareOfCore(all.report, state);
  const cost = added.mul(share);
  return {
    year,
    added_eur: added,
    core_share_pct: share.mul(HUNDRED),
    core_eur: cost,
    notes: all.notes,
    dated: cost.isZero() ? [] : datesOf(state, year, cost),
  };
};

export const coreXirrAfterTax = (
  events: readonly LedgerEvent[],
  to: CivilDate,
): CoreXirrAfterTax => {
  const before = coreXirr(events, to);
  if (before.xirr_pct === undefined || before.from === undefined) {
    return { before, years: [], gap: "before" };
  }
  const state = projectLedger(events, { collectErrors: true });
  // The engine refuses a ledger with invalid events, and so does this: the answer is what to repair.
  if (state.invalid.length > 0) {
    return { before, years: [], gap: "invalid" };
  }
  const outside = outsideOnly(events);
  const years: AfterTaxYear[] = [];
  for (let year = Number(before.from.slice(0, 4)); `${year}-12-31` <= to; year += 1) {
    years.push(closedYear(events, outside, state, year, to));
  }
  if (years.some((entry) => entry.gap !== undefined)) {
    return { before, years, gap: "year" };
  }
  const value = before.value_eur as Money;
  const contributed = before.contributed_eur as Money;
  const costs = years.flatMap((entry) => entry.dated);
  const tax = years.reduce((sum, entry) => sum.add(entry.core_eur as Money), zero);
  const flows = [
    ...coreCashFlows(state, events).flows.filter((flow) => flow.date <= to),
    ...costs,
  ].map((flow) => ({ days: Math.max(0, daysBetween(flow.date, to)), eur: flow.eur.amount }));
  const rate = annualRateOf(flows, value.amount);
  const common = { before, years, tax_eur: tax, gain_eur: value.sub(contributed).sub(tax) };
  return rate === undefined ? { ...common, gap: "no_rate" } : { ...common, xirr_pct: rate };
};
