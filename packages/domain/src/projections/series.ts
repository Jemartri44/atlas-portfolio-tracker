// Time series (decision (f) of prompt 007: "the series are computed by the
// domain, with tests, not by a loop inside a component").
//
// A series is N projections of the same ledger cut at N dates (`asOf`,
// ADR-0016). It is the same code path `atlas networth --date` walks, so a point
// of the series and the command can never disagree.
//
// **The rule that decides everything here**: a figure exists only when *all* of
// its components have a price. `netWorth` returns, in a partial block, the sum
// of what *does* have a price — a number smaller than reality and, drawn on a
// line, indistinguishable from a fall. Drawing it would invent a loss that never
// happened, which is worse than drawing nothing (constitution V; Q1 of this
// feature). So a partial block is **absent**, never a number, and `missing`
// says what was lacking.
//
// Nothing is interpolated, carried forward or filled in. There is no option to
// do so.

import type { CivilDate } from "../dates/civil-date.js";
import type { Currency } from "../money/money.js";
import { Money } from "../money/money.js";
import type { AssetId, LedgerEvent } from "../schema/events.js";
import { type BenchmarkGap, bucketTheses } from "./bucket.js";
import { netWorth } from "./networth.js";
import { priceDates } from "./prices.js";
import { projectLedger } from "./project-ledger.js";
import { settingsAt } from "./settings-at.js";
import type { LedgerState } from "./state.js";

const EUR = "EUR";

export interface SeriesOptions {
  /** Last date of the series, inclusive. */
  to: CivilDate;
  /** First date, inclusive; defaults to the earliest date the ledger offers. */
  from?: CivilDate;
  /**
   * Exact dates to evaluate. By default, the **valuation dates** of the ledger
   * inside the range plus `to`: between two valuations the ledger knows nothing
   * new, so a fixed grid would only repeat points and multiply the cost.
   */
  dates?: readonly CivilDate[];
  /** Cap on the number of points; above it they are sampled evenly, keeping the ends. */
  max_points?: number;
}

export interface NetWorthPoint {
  date: CivilDate;
  /** Absent when a core asset held has no price at that date. */
  core_eur?: Money;
  bucket_eur?: Money;
  /** Cash needs no price, only an exchange rate; absent when one is missing. */
  cash_eur?: Money;
  /** Sum of the three. Absent when any of them is. */
  total_eur?: Money;
  /** What was lacking, block by block, so the view can say it in words. */
  missing: {
    core: AssetId[];
    bucket: AssetId[];
    cash: Currency[];
  };
}

export interface NetWorthSeries {
  from: CivilDate;
  to: CivilDate;
  points: NetWorthPoint[];
  /** Points with the three blocks present: what can actually be drawn as a total. */
  complete: number;
}

export interface BucketIndexPoint {
  date: CivilDate;
  /** Σ (realised + latent) of the theses that had moved by that date. */
  result_eur?: Money;
  /** Σ what the same money would have made in the index over the same periods. */
  benchmark_eur?: Money;
  /** `result − benchmark`, which is rule 16's answer. */
  vs_index_eur?: Money;
  /** Why the point could not be built; empty when it could. */
  missing: BenchmarkGap[];
  /** Theses that had not moved yet at that date: they add nothing to either sum. */
  idle: number;
}

export interface BucketIndexSeries {
  from: CivilDate;
  to: CivilDate;
  points: BucketIndexPoint[];
  complete: number;
}

/**
 * Evenly spaced sample of at most `limit` entries, keeping the **first and the
 * last**. A twenty-year ledger asked day by day would be thousands of
 * projections; the shape of the curve does not need them.
 *
 * With `limit` of 1 it keeps the last, which is the one the user asked about.
 */
export const sampleEvenly = <T>(values: readonly T[], limit: number): T[] => {
  if (limit <= 0) {
    return [];
  }
  if (values.length <= limit) {
    return [...values];
  }
  if (limit === 1) {
    return [values[values.length - 1] as T];
  }
  const step = (values.length - 1) / (limit - 1);
  const picked: T[] = [];
  for (let index = 0; index < limit; index += 1) {
    picked.push(values[Math.round(index * step)] as T);
  }
  return picked;
};

/**
 * The dates of the series, sorted, deduplicated and clipped to the range. `to`
 * is always one of them: the user asked about that day, and the answer to "how
 * much do I have today" cannot depend on when the last valuation was recorded.
 *
 * **The cap never samples a hole away.** Sampling drops intermediate dates, and
 * a dropped date that happened to be the incomplete one turns a gap into a
 * continuous line — the interpolation decision (d) forbids, arrived at by
 * arithmetic instead of by drawing. The cap shapes which **complete** points are
 * drawn; a date known to be incomplete is kept on top of it, as is the last date
 * of the range, which is the day the user asked about.
 *
 * So `max_points` is a target, not a hard ceiling, and it is the right way round:
 * a chart with more gaps than the cap allows is a chart about a ledger that is
 * barely valued, and that is information, not noise.
 *
 * It does not bite today (the cap is 120 and the ledger offers 8 dates); it
 * bites around year ten with monthly valuations, which is inside this project's
 * horizon.
 */
const resolveDates = (
  state: LedgerState,
  options: SeriesOptions,
  incomplete: (date: CivilDate) => boolean,
): CivilDate[] => {
  const from = options.from;
  const candidates = options.dates ?? [...priceDates(state), options.to];
  const inRange = candidates.filter(
    (date) => date <= options.to && (from === undefined || date >= from),
  );
  const sorted = [...new Set(inRange)].sort();
  if (options.max_points === undefined || sorted.length <= options.max_points) {
    return sorted;
  }
  const kept = new Set([
    ...sampleEvenly(sorted, options.max_points),
    // Never dropped, whatever the cap says.
    sorted[sorted.length - 1] as CivilDate,
    ...sorted.filter((date) => incomplete(date)),
  ]);
  return sorted.filter((date) => kept.has(date));
};

interface Resolved {
  dates: CivilDate[];
  from: CivilDate;
  to: CivilDate;
}

const rangeOf = (
  state: LedgerState,
  options: SeriesOptions,
  incomplete: (date: CivilDate) => boolean,
): Resolved => {
  const dates = resolveDates(state, options, incomplete);
  return {
    dates,
    from: options.from ?? dates[0] ?? options.to,
    to: options.to,
  };
};

/** The projection of the ledger cut at a date, with its settings in force. */
const at = (events: readonly LedgerEvent[], date: CivilDate) => {
  const state = projectLedger(events, { collectErrors: true, asOf: date });
  return { state, settings: settingsAt(state, date).settings };
};

/** Evolution of the net worth, one point per date, broken down by book. */
export const netWorthSeries = (
  events: readonly LedgerEvent[],
  options: SeriesOptions,
): NetWorthSeries => {
  const base = projectLedger(events, { collectErrors: true });
  const { dates, from, to } = rangeOf(base, options, (date) => {
    const { state, settings } = at(events, date);
    return netWorth(state, date, settings).partial;
  });
  let complete = 0;
  const points = dates.map((date): NetWorthPoint => {
    const { state, settings } = at(events, date);
    const worth = netWorth(state, date, settings);
    const core = worth.core.partial ? undefined : worth.core.total_eur;
    const bucket = worth.bucket.partial ? undefined : worth.bucket.total_eur;
    const cash = worth.cash.partial ? undefined : worth.cash.total_eur;
    const whole = core !== undefined && bucket !== undefined && cash !== undefined;
    if (whole) {
      complete += 1;
    }
    return {
      date,
      ...(core === undefined ? {} : { core_eur: core }),
      ...(bucket === undefined ? {} : { bucket_eur: bucket }),
      ...(cash === undefined ? {} : { cash_eur: cash }),
      ...(whole ? { total_eur: (core as Money).add(bucket as Money).add(cash as Money) } : {}),
      missing: {
        core: [...worth.core.missing_prices],
        bucket: [...worth.bucket.missing_prices],
        cash: [...worth.cash.missing_rates],
      },
    };
  });
  return { from, to, points, complete };
};

/**
 * The bucket against the index over time (rule 16, `docs/specification.md`
 * §6.2: "value curve of the bucket against the same money invested in the
 * index").
 *
 * It consumes `bucketTheses` at each date and **recomputes nothing** of rule
 * 16: the latent term is the latent gain, never the value of the position, and
 * that definition lives in one place.
 *
 * A thesis that has neither bought nor sold by that date contributes nothing to
 * either sum, so it is skipped and counted in `idle` — excluding it is not the
 * same as calling it zero, and saying how many there were keeps it honest. Any
 * other missing comparison makes the **whole point** absent: a partial sum is
 * not comparable with anything.
 */
export const bucketIndexSeries = (
  events: readonly LedgerEvent[],
  options: SeriesOptions,
): BucketIndexSeries => {
  const base = projectLedger(events, { collectErrors: true });
  const { dates, from, to } = rangeOf(base, options, (date) => {
    const { state, settings } = at(events, date);
    return bucketTheses(state, date, settings).rows.some(
      (thesis) =>
        (thesis.buys.length > 0 || thesis.sells.length > 0) &&
        (thesis.unrealized_eur === undefined || thesis.benchmark_equivalent_eur === undefined),
    );
  });
  let complete = 0;
  const points = dates.map((date): BucketIndexPoint => {
    const { state, settings } = at(events, date);
    const gaps: BenchmarkGap[] = [];
    let result = Money.zero(EUR);
    let benchmark = Money.zero(EUR);
    let idle = 0;
    for (const thesis of bucketTheses(state, date, settings).rows) {
      if (thesis.buys.length === 0 && thesis.sells.length === 0) {
        idle += 1;
        continue;
      }
      if (thesis.unrealized_eur === undefined || thesis.benchmark_equivalent_eur === undefined) {
        gaps.push(...thesis.missing_benchmark);
        continue;
      }
      result = result.add(thesis.result_eur).add(thesis.unrealized_eur);
      benchmark = benchmark.add(thesis.benchmark_equivalent_eur.sub(thesis.invested_eur));
    }
    if (gaps.length > 0) {
      return { date, missing: gaps, idle };
    }
    complete += 1;
    return {
      date,
      result_eur: result,
      benchmark_eur: benchmark,
      vs_index_eur: result.sub(benchmark),
      missing: [],
      idle,
    };
  });
  return { from, to, points, complete };
};
