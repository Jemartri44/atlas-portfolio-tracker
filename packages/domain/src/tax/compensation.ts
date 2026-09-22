// Integration and offsetting of the savings base (art. 49 LIRPF), criteria #10
// and #22, as the practical manual of the AEAT describes it:
//
// - **Phase 1, the year.** Capital gains and losses are netted among
//   themselves, and so is movable capital income. A negative balance of one
//   offsets the positive balance of the other up to 25 % of **that** positive
//   balance.
// - **Phase 2, what is pending.** A negative balance of the four previous years
//   first offsets what is left of the positive balance **of its own category**,
//   with no limit; then what is left of the other one, with the 25 % limit
//   **jointly** with phase 1. The oldest years first (#22), so that what
//   expires is always the least.
//
// Offsetting as much as possible is mandatory (art. 49.2): nothing here is a
// choice. What is left is carried with its year and category of origin, and
// what reaches the end of its fourth year expires.
//
// The practical case of the manual (4,000 of gains, −800 of movable capital
// income in the year, 700 and 2,100 of pending losses and 500 of pending
// negative income; base 200) is a test of this file, as it is.

import { Decimal } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { sortCriteria } from "./criteria.js";
import type { BalanceCategory, Compensation, CompensationStep, PendingLoss } from "./report.js";

const EUR = "EUR";

export interface YearBalances {
  /** Sum of the rounded figures of the year, per category. */
  capital_gain: Money;
  movable_capital: Money;
}

export interface CompensationRules {
  /** Percentage, e.g. 25. */
  limitPct: Decimal;
  /** Years a negative balance can be carried. */
  carryYears: number;
}

const min = (...values: Money[]): Money =>
  values.reduce((least, value) => (value.cmp(least) < 0 ? value : least));

const positive = (money: Money): Money => (money.isNegative() ? Money.zero(EUR) : money);

const OTHER: Record<BalanceCategory, BalanceCategory> = {
  capital_gain: "movable_capital",
  movable_capital: "capital_gain",
};

// Marked pure so that a bundle that never compensates (the web, today) can drop
// this module whole: a call at module level is kept by default, and with it
// the whole catalogue of criteria.
const CRITERIA = /* @__PURE__ */ sortCriteria(["10", "22"]);

const HUNDRED = /* @__PURE__ */ Decimal.parse("100");

/** Compensates one year: `pending` is what the previous years left, oldest or not. */
export const compensate = (
  year: number,
  balances: YearBalances,
  pending: readonly PendingLoss[],
  rules: CompensationRules,
): Compensation => {
  const balance: Record<BalanceCategory, Money> = {
    capital_gain: balances.capital_gain,
    movable_capital: balances.movable_capital,
  };
  // The joint limit: 25 % of each positive balance before anything crosses it.
  const limitOf = (value: Money): Money =>
    positive(value).mul(rules.limitPct).div(HUNDRED).roundToCents();
  const limit: Record<BalanceCategory, Money> = {
    capital_gain: limitOf(balance.capital_gain),
    movable_capital: limitOf(balance.movable_capital),
  };
  const room = { ...limit };
  const steps: CompensationStep[] = [];
  const offset = (
    phase: 1 | 2,
    from: BalanceCategory,
    originYear: number,
    owed: Money,
    against: BalanceCategory,
  ): Money => {
    const crosses = from !== against;
    const available = positive(balance[against]);
    const amount = crosses ? min(owed.neg(), available, room[against]) : min(owed.neg(), available);
    if (!amount.isZero()) {
      balance[against] = balance[against].sub(amount);
      if (crosses) {
        room[against] = room[against].sub(amount);
      }
      steps.push({
        phase,
        from,
        origin_year: originYear,
        against,
        amount_eur: amount,
        limited: crosses,
        criteria: CRITERIA,
      });
    }
    return owed.add(amount);
  };

  // Phase 1: a negative balance of the year against the other one.
  for (const category of ["capital_gain", "movable_capital"] as const) {
    if (balance[category].isNegative()) {
      balance[category] = offset(1, category, year, balance[category], OTHER[category]);
    }
  }
  const carried: PendingLoss[] = [];
  for (const category of ["capital_gain", "movable_capital"] as const) {
    if (balance[category].isNegative()) {
      carried.push({
        origin_year: year,
        category,
        amount_eur: balance[category],
        expires_after: year + rules.carryYears,
      });
      balance[category] = Money.zero(EUR);
    }
  }

  // Phase 2: what the previous years left, oldest first; own category, then the other.
  const open = pending
    .filter((entry) => entry.origin_year < year && entry.expires_after >= year)
    .map((entry) => ({ ...entry }))
    .sort((a, b) => a.origin_year - b.origin_year || a.category.localeCompare(b.category));
  for (const entry of open) {
    entry.amount_eur = offset(
      2,
      entry.category,
      entry.origin_year,
      entry.amount_eur,
      entry.category,
    );
  }
  for (const entry of open) {
    entry.amount_eur = offset(
      2,
      entry.category,
      entry.origin_year,
      entry.amount_eur,
      OTHER[entry.category],
    );
  }
  const left = open.filter((entry) => entry.amount_eur.isNegative());
  // What reaches the end of its last year, plus anything handed over already
  // past it (a declared anchor can carry one): nothing disappears in silence.
  const expired = [
    ...pending.filter((entry) => entry.expires_after < year && entry.amount_eur.isNegative()),
    ...left.filter((entry) => entry.expires_after === year),
  ];
  return {
    capital_gain_eur: balances.capital_gain,
    movable_capital_eur: balances.movable_capital,
    limit_pct: rules.limitPct.toString(),
    limit_eur: limit,
    steps,
    pending: [...left.filter((entry) => entry.expires_after > year), ...carried],
    expired,
    capital_gain_final_eur: balance.capital_gain,
    movable_capital_final_eur: balance.movable_capital,
    base_eur: balance.capital_gain.add(balance.movable_capital),
  };
};
