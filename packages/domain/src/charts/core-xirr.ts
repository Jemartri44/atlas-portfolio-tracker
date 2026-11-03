// What the core has earned on the money put into it since the first deposit: «he aportado X, vale
// Y, he ganado Z %», and the money-weighted annual rate (XIRR) that those flows give.
//
// **Only the core** (its assets and the cash of its own accounts), with the same flows and the same
// value as `coreReturn` and the line drawn (`coreCashFlows`, `bookCashSeries`): dividends, interest
// and fees are not flows, they are the return. The bucket never enters (constitution III).
//
// The rate is the one that makes every flow, grown daily to the end date, add up to the value:
//
//   Σ Fᵢ · (1 + g)^(days from i to the end) = V,   rate = (1 + g)^365 − 1
//
// which is the usual XIRR (actual days / 365) written with a whole exponent, so no floating point
// is needed: `g` is found by bisection in decimal. It depends on prices, so it is informative and
// **never estimated**: a missing price, a purchase whose cash was never recorded, no money put in,
// or a flow pattern with no rate, give no figure and the reason says why.

import { type CivilDate, daysBetween } from "../dates/civil-date.js";
import { Decimal, HUNDRED } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { LedgerEvent } from "../schema/events.js";
import { bookCashSeries } from "./book-cash.js";
import { buysUncovered, coreCashFlows } from "./contributed.js";

export type CoreXirrGap =
  /** A price or a rate of the core is missing at the end date. */
  | "partial"
  /** The core bought before any deposit paid for it: a flow is unknown. */
  | "uncovered_buys"
  /** No money has been put into the core by that date. */
  | "no_flows"
  /** The flows admit no rate (for instance, only withdrawals). */
  | "no_rate";

export interface CoreXirr {
  to: CivilDate;
  /** First deposit or withdrawal of the core; absent with no flows. */
  from?: CivilDate;
  /** Deposits minus withdrawals up to `to`. */
  contributed_eur?: Money;
  /** The core with the cash of its accounts at `to`. */
  value_eur?: Money;
  /** `value − contributed`. */
  gain_eur?: Money;
  /** `gain / contributed`, percent; absent if nothing net was contributed. */
  gain_pct?: Decimal;
  /** Annual money-weighted rate, percent, to 4 decimals. */
  xirr_pct?: Decimal;
  gap?: CoreXirrGap;
}

const GRID = 14;
/** Daily rate bounds: about −99 % and +1000 % a year. */
const LOW = Decimal.parse("-0.0125");
const HIGH = Decimal.parse("0.0066");
const ITERATIONS = 60;
const DAYS_IN_YEAR = 365;

/** `base^exponent` for a whole exponent by squaring, rounded as it goes so it stays small. */
const power = (base: Decimal, exponent: number): Decimal => {
  let result = Decimal.ONE;
  let square = base;
  for (let rest = exponent; rest > 0; rest = Math.floor(rest / 2)) {
    if (rest % 2 === 1) {
      result = result.mul(square).round(GRID);
    }
    square = square.mul(square).round(GRID);
  }
  return result;
};

/** Where the flows grown at the daily rate `g` stand against the final value. */
const surplus = (
  flows: readonly { days: number; eur: Decimal }[],
  value: Decimal,
  g: Decimal,
): Decimal => {
  const growth = Decimal.ONE.add(g);
  return flows
    .reduce((sum, flow) => sum.add(flow.eur.mul(power(growth, flow.days))), Decimal.ZERO)
    .sub(value);
};

export const coreXirr = (events: readonly LedgerEvent[], to: CivilDate): CoreXirr => {
  const state = projectLedger(events, { collectErrors: true });
  const cash = coreCashFlows(state, events);
  const flows = cash.flows.filter((flow) => flow.date <= to);
  if (flows.length === 0) {
    return { to, gap: "no_flows" };
  }
  const from = flows.reduce((first, flow) => (flow.date < first ? flow.date : first), to);
  if (cash.firstBuy !== undefined && cash.firstBuy <= to && buysUncovered(cash)) {
    return { to, from, gap: "uncovered_buys" };
  }
  const [point] = bookCashSeries(events, { to, dates: [to] }).points;
  const value = point?.core_eur;
  if (value === undefined) {
    return { to, from, gap: "partial" };
  }
  const contributed = flows.reduce((sum, flow) => sum.add(flow.eur), Money.zero("EUR"));
  const gain = value.sub(contributed);
  const base = {
    to,
    from,
    contributed_eur: contributed,
    value_eur: value,
    gain_eur: gain,
    ...(contributed.amount.isPositive()
      ? { gain_pct: gain.amount.div(contributed.amount).mul(HUNDRED) }
      : {}),
  };

  const dated = flows.map((flow) => ({ days: daysBetween(flow.date, to), eur: flow.eur.amount }));
  let low = LOW;
  let high = HIGH;
  const atLow = surplus(dated, value.amount, low);
  const atHigh = surplus(dated, value.amount, high);
  if (atLow.isPositive() === atHigh.isPositive() || atLow.isZero() || atHigh.isZero()) {
    // A root on the very edge is as good as none: the bounds are far beyond any real portfolio.
    return { ...base, gap: "no_rate" };
  }
  for (let step = 0; step < ITERATIONS; step += 1) {
    const middle = low.add(high).div(Decimal.parse("2"));
    if (surplus(dated, value.amount, middle).isPositive() === atLow.isPositive()) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const daily = low.add(high).div(Decimal.parse("2"));
  return {
    ...base,
    xirr_pct: power(Decimal.ONE.add(daily), DAYS_IN_YEAR).sub(Decimal.ONE).mul(HUNDRED).round(4),
  };
};
