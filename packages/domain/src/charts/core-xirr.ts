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
import { ValidationError } from "../errors.js";
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
  /**
   * No rate within the bounds: beyond about −99 % / +1000 % a year (also what a first flow of a
   * few days ago gives), or flows of mixed sign whose equation has an even number of roots.
   */
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
  /** Present when the inflation was given. */
  real?: RealReturn;
}

export interface RealReturn {
  /** Years of the period with no inflation entered: without them there is no real figure. */
  missing_years: string[];
  /** The same rate with every flow and the value in euros of the end date; absent without a root. */
  xirr_pct?: Decimal;
  /** What the core earned in euros of the end date: value − the flows brought up to it. */
  gain_eur?: Money;
}

type DatedFlow = { days: number; eur: Decimal };

const GRID = 14;
/** Daily rate bounds: about −99 % and +1000 % a year. */
const LOW = Decimal.parse("-0.0125");
const HIGH = Decimal.parse("0.0066");
const HALVINGS = 12;
const ITERATIONS = 100;
/** One unit of the 10 places decimal division keeps. */
const EPSILON = Decimal.parse("0.0000000001");
const DAYS_IN_YEAR = 365;
const MIN_INFLATION = Decimal.parse("-99");
const MAX_INFLATION = Decimal.parse("1000");
const TWO = Decimal.parse("2");

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

/**
 * Where the flows grown at the daily rate `g` stand against the final value. Flows come earliest
 * first (most days to the end); they are folded forward (Horner), so each step raises to the gap
 * between two flows, not to the whole span: 240 monthly flows cost a few multiplications each.
 */
const surplus = (flows: readonly DatedFlow[], value: Decimal, g: Decimal): Decimal => {
  const growth = Decimal.ONE.add(g);
  let total = Decimal.ZERO;
  let at = (flows[0] as DatedFlow).days;
  for (const flow of flows) {
    total = total
      .mul(power(growth, at - flow.days))
      .round(GRID)
      .add(flow.eur);
    at = flow.days;
  }
  return total.mul(power(growth, at)).round(GRID).sub(value);
};

/**
 * The root of `f` between `low` and `high`, whose signs differ: a dozen halvings, then false
 * position, which on the small bracket left is almost a line: a few evaluations where bisection
 * needs forty. It stops when the guess no longer moves at the 10 places decimal division keeps.
 */
const root = (f: (x: Decimal) => Decimal, lowStart: Decimal, highStart: Decimal): Decimal => {
  let low = lowStart;
  let high = highStart;
  let atLow = f(low);
  let atHigh = f(high);
  // The ends are far apart (the value at the high one is astronomically larger), which would make
  // false position crawl: a dozen halvings first bring them to a comparable size.
  for (let step = 0; step < HALVINGS; step += 1) {
    const middle = low.add(high).div(TWO);
    const atMiddle = f(middle);
    if (atMiddle.isPositive() === atLow.isPositive()) {
      low = middle;
      atLow = atMiddle;
    } else {
      high = middle;
      atHigh = atMiddle;
    }
  }
  let previous = low;
  let done = false;
  for (let step = 0; step < ITERATIONS && !done; step += 1) {
    const guess = low.mul(atHigh).sub(high.mul(atLow)).div(atHigh.sub(atLow));
    const atGuess = f(guess);
    done = atGuess.isZero() || guess.sub(previous).abs().lt(EPSILON);
    previous = guess;
    if (done) {
      continue;
    }
    if (atGuess.isPositive() === atLow.isPositive()) {
      low = guess;
      atLow = atGuess;
    } else {
      high = guess;
      atHigh = atGuess;
    }
  }
  return previous;
};

/**
 * The annual rate (percent, 4 decimals) that makes the flows, grown daily, add up to `value`, or
 * undefined when none lies within the bounds. Flows are euros of the end date.
 */
const annualRateOf = (unsorted: readonly DatedFlow[], value: Decimal): Decimal | undefined => {
  const flows = [...unsorted].sort((a, b) => b.days - a.days);
  const f = (g: Decimal) => surplus(flows, value, g);
  const atLow = f(LOW);
  const atHigh = f(HIGH);
  if (atLow.isPositive() === atHigh.isPositive() || atLow.isZero() || atHigh.isZero()) {
    // A root on the very edge is as good as none: the bounds are far beyond any real portfolio.
    return undefined;
  }
  const daily = root(f, LOW, HIGH);
  return power(Decimal.ONE.add(daily), DAYS_IN_YEAR).sub(Decimal.ONE).mul(HUNDRED).round(4);
};

/** The daily rate whose 365th power is the year's change `pct` (percent). */
const dailyRateOf = (pct: Decimal): Decimal => {
  const target = Decimal.ONE.add(pct.div(HUNDRED));
  return root((g) => power(Decimal.ONE.add(g), DAYS_IN_YEAR).sub(target), LOW, HIGH);
};

/** How much prices rose from `from` to `to`: each calendar year at its own change, day by day. */
const inflationBetween = (
  from: CivilDate,
  to: CivilDate,
  daily: ReadonlyMap<string, Decimal>,
): Decimal => {
  let factor = Decimal.ONE;
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year += 1) {
    const start = `${year}-01-01` > from ? `${year}-01-01` : from;
    const end = `${year + 1}-01-01` < to ? `${year + 1}-01-01` : to;
    factor = factor
      .mul(power(Decimal.ONE.add(daily.get(String(year)) as Decimal), daysBetween(start, end)))
      .round(GRID);
  }
  return factor;
};

const realOf = (
  flows: readonly { date: CivilDate; eur: Money }[],
  from: CivilDate,
  to: CivilDate,
  value: Money,
  inflationPct: Readonly<Record<string, string>>,
): RealReturn => {
  const years: string[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year += 1) {
    years.push(String(year));
  }
  const missing = years.filter((year) => inflationPct[year] === undefined);
  if (missing.length > 0) {
    return { missing_years: missing };
  }
  const daily = new Map(
    years.map((year) => {
      const pct = Decimal.parse(inflationPct[year] as string);
      if (!pct.gt(MIN_INFLATION) || !pct.lt(MAX_INFLATION)) {
        throw new ValidationError(
          "invalid_inflation",
          "the yearly change of prices is out of range",
          {
            year,
          },
        );
      }
      return [year, dailyRateOf(pct)] as const;
    }),
  );
  const brought = flows.map((flow) => ({
    date: flow.date,
    eur: flow.eur.amount.mul(inflationBetween(flow.date, to, daily)).round(GRID),
  }));
  const net = brought.reduce((sum, flow) => sum.add(flow.eur), Decimal.ZERO);
  const rate = annualRateOf(
    brought.map((flow) => ({ days: daysBetween(flow.date, to), eur: flow.eur })),
    value.amount,
  );
  return {
    missing_years: [],
    gain_eur: Money.of(value.amount.sub(net), "EUR"),
    ...(rate === undefined ? {} : { xirr_pct: rate }),
  };
};

export const coreXirr = (
  events: readonly LedgerEvent[],
  to: CivilDate,
  /** Yearly change of prices, percent, by calendar year: `{ "2027": "2.8" }`. */
  inflationPct?: Readonly<Record<string, string>>,
): CoreXirr => {
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
  const rate = annualRateOf(dated, value.amount);
  const real =
    inflationPct === undefined ? {} : { real: realOf(flows, from, to, value, inflationPct) };
  return rate === undefined
    ? { ...base, ...real, gap: "no_rate" }
    : { ...base, ...real, xirr_pct: rate };
};
