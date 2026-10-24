// Time series (with tests, not by a loop inside a component").
//
// A series is N projections of the same ledger cut at N dates (`asOf`,
// ADR-0016). It is the same code path `atlas networth --date` walks, so a point
// of the series and the command can never disagree.
//
// **The rule that decides everything here**: a figure exists only when *all* of
// its components have a price. `netWorth` returns, in a partial block, the sum
// of what *does* have a price — a number smaller than reality and, drawn on a
// line, indistinguishable from a fall. Drawing it would invent a loss that
// never happened, which is worse than drawing nothing (constitution V). So a
// partial block is **absent**, never a number, and `missing` says what was
// lacking.
//
// Nothing is interpolated, carried forward or filled in. There is no option to
// do so.

import type { CivilDate } from "../dates/civil-date.js";
import type { Currency } from "../money/money.js";
import { EUR, Money } from "../money/money.js";
import type { AssetId, LedgerEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { type BenchmarkGap, bucketTheses } from "./bucket.js";
import { netWorth } from "./networth.js";
import { priceDates } from "./prices.js";
import { projectLedger } from "./project-ledger.js";
import { settingsAt } from "./settings-at.js";
import type { LedgerState } from "./state.js";

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
 * What the ledger showed on each of `dates`, read in **one pass** over its
 * events instead of one projection per date: the `onDate` hook hands over the
 * state after the last operation of each business date, which is the state
 * `asOf` of any date up to the next one would build (pass B applies the
 * operations in the very order the cut keeps them).
 *
 * `read` runs inside the hook, while the state is still being built: it must
 * return values that hold no reference into it (a thesis view shares its legs
 * with the state, which keeps growing). A date before the first operation sees
 * the empty pass B, which one cut projection gives.
 */
const readAt = <T>(
  events: readonly LedgerEvent[],
  dates: readonly CivilDate[],
  read: (state: LedgerState, date: CivilDate, settings: Settings) => T,
): Map<CivilDate, T> => {
  const wanted = [...new Set(dates)].sort();
  const readings = new Map<CivilDate, T>();
  if (wanted.length === 0) {
    return readings;
  }
  const readOn = (state: LedgerState, date: CivilDate): void => {
    readings.set(date, read(state, date, settingsAt(state, date).settings));
  };
  const early: CivilDate[] = [];
  let index = 0;
  projectLedger(events, {
    collectErrors: true,
    onDate: (date, state, next) => {
      for (; index < wanted.length && (wanted[index] as CivilDate) < date; index += 1) {
        early.push(wanted[index] as CivilDate);
      }
      for (
        ;
        index < wanted.length && (next === undefined || (wanted[index] as CivilDate) < next);
        index += 1
      ) {
        readOn(state, wanted[index] as CivilDate);
      }
    },
  });
  early.push(...wanted.slice(index));
  if (early.length > 0) {
    const before = projectLedger(events, { collectErrors: true, asOf: early[0] as CivilDate });
    for (const date of early) {
      readOn(before, date);
    }
  }
  return readings;
};

/** One date of a series: its point, and whether a price or a rate is lacking at it. */
interface Reading<P> {
  point: P;
  incomplete: boolean;
}

export interface Series<P> {
  dates: CivilDate[];
  from: CivilDate;
  to: CivilDate;
  points: P[];
}

/**
 * The dates of the series, sorted, deduplicated and clipped to the range, each
 * with its reading. `to` is always one of them: the user asked about that day,
 * and the answer to "how much do I have today" cannot depend on when the last
 * valuation was recorded.
 *
 * **The cap never samples a hole away.** Sampling drops intermediate dates, and
 * a dropped date that happened to be the incomplete one turns a gap into a
 * continuous line — the interpolation decision forbids, arrived at by
 * arithmetic instead of by drawing. The cap shapes which **complete** points are
 * drawn; a date known to be incomplete is kept on top of it, as is the last date
 * of the range, which is the day the user asked about.
 *
 * So `max_points` is a target, not a hard ceiling, and it is the right way round:
 * a chart with more gaps than the cap allows is a chart about a ledger that is
 * barely valued, and that is information, not noise. Telling the incomplete
 * dates takes reading every candidate, so `read` is told when the cap bites
 * (`scan`) and only then needs to work out the flag of a reading it will not draw.
 *
 * Every series shares this axis: the same options give the same dates in all of
 * them.
 */
export const readSeries = <P>(
  events: readonly LedgerEvent[],
  options: SeriesOptions,
  read: (state: LedgerState, date: CivilDate, settings: Settings, scan: boolean) => Reading<P>,
): Series<P> => {
  const from = options.from;
  const candidates = options.dates ?? [
    ...priceDates(projectLedger(events, { collectErrors: true })),
    options.to,
  ];
  const sorted = [
    ...new Set(
      candidates.filter((date) => date <= options.to && (from === undefined || date >= from)),
    ),
  ].sort();
  const scan = options.max_points !== undefined && sorted.length > options.max_points;
  const readings = readAt(events, sorted, (state, date, settings) =>
    read(state, date, settings, scan),
  );
  const kept = new Set<CivilDate>(sorted);
  if (scan) {
    kept.clear();
    for (const date of [
      ...sampleEvenly(sorted, options.max_points as number),
      // Never dropped, whatever the cap says.
      sorted[sorted.length - 1] as CivilDate,
      ...sorted.filter((date) => (readings.get(date) as Reading<P>).incomplete),
    ]) {
      kept.add(date);
    }
  }
  const dates = sorted.filter((date) => kept.has(date));
  return {
    dates,
    from: from ?? dates[0] ?? options.to,
    to: options.to,
    points: dates.map((date) => (readings.get(date) as Reading<P>).point),
  };
};

/** Evolution of the net worth, one point per date, broken down by book. */
export const netWorthSeries = (
  events: readonly LedgerEvent[],
  options: SeriesOptions,
): NetWorthSeries => {
  const { from, to, points } = readSeries(events, options, (state, date, settings) => {
    const worth = netWorth(state, date, settings);
    const core = worth.core.partial ? undefined : worth.core.total_eur;
    const bucket = worth.bucket.partial ? undefined : worth.bucket.total_eur;
    const cash = worth.cash.partial ? undefined : worth.cash.total_eur;
    const whole = core !== undefined && bucket !== undefined && cash !== undefined;
    return {
      incomplete: !whole,
      point: {
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
      },
    };
  });
  return {
    from,
    to,
    points,
    complete: points.filter((point) => point.total_eur !== undefined).length,
  };
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
  const { from, to, points } = readSeries(events, options, (state, date, settings) => {
    const gaps: BenchmarkGap[] = [];
    let result = Money.zero(EUR);
    let benchmark = Money.zero(EUR);
    let idle = 0;
    let incomplete = false;
    for (const thesis of bucketTheses(state, date, settings).rows) {
      if (thesis.buys.length === 0 && thesis.sells.length === 0) {
        idle += 1;
        continue;
      }
      if (thesis.unrealized_eur === undefined || thesis.benchmark_equivalent_eur === undefined) {
        incomplete = true;
        gaps.push(...thesis.missing_benchmark);
        continue;
      }
      result = result.add(thesis.result_eur).add(thesis.unrealized_eur);
      benchmark = benchmark.add(thesis.benchmark_equivalent_eur.sub(thesis.invested_eur));
    }
    const point: BucketIndexPoint =
      gaps.length > 0
        ? { date, missing: gaps, idle }
        : {
            date,
            result_eur: result,
            benchmark_eur: benchmark,
            vs_index_eur: result.sub(benchmark),
            missing: [],
            idle,
          };
    return { point, incomplete };
  });
  return {
    from,
    to,
    points,
    complete: points.filter((point) => point.missing.length === 0).length,
  };
};
