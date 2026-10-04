// The bucket against the index in **percent**, on each date (feature 020, E4,
// M7): the result of the bucket and what the same money would have made in the
// index, both over what was contributed to the bucket by that date.
//
// **Nothing of rule 16 is recomputed.** Each point is a point of
// `bucketIndexSeries`, divided by the gross contribution of the bucket at that
// date: the denominator `bucketStats` uses for `vs_index_pct`, valued by the
// same function of cash flows. A point with no comparison (a price of the
// index or of a position missing) has no percentage, and neither has one with
// nothing contributed: a percentage over a partial total, or over zero, is a
// number that looks complete and is not (constitution V). A percentage does
// not give the size of the bucket away, so it draws with the privacy on.
//
// **A point without a percentage says why when it is not a missing price.** Before
// the bucket has bought or sold anything there is nothing to compare
// (`no_investments`), and a bucket that bought without any deposit recorded has
// nothing to divide by (`no_contributions`): neither is a hole in the prices, and
// the screen must not paint them as one nor say «pending prices» about them.

import type { CivilDate } from "../dates/civil-date.js";
import { Decimal } from "../money/decimal.js";
import { type BenchmarkGap, bucketAccountIds } from "../projections/bucket.js";
import { cashFlowsOf } from "../projections/bucket-stats.js";
import { businessDateOf, isOperationEvent, projectLedger } from "../projections/project-ledger.js";
import { bucketIndexSeries, type SeriesOptions } from "../projections/series.js";
import type { LedgerEvent } from "../schema/events.js";

const HUNDRED = Decimal.parse("100");

/** Why a point has no percentage when it is not a missing price. */
export type NoPercentageReason = "no_investments" | "no_contributions";

export interface BucketIndexPctPoint {
  date: CivilDate;
  /** Set only when the absence is not a missing price: see the header. */
  reason?: NoPercentageReason;
  result_pct?: Decimal;
  benchmark_pct?: Decimal;
  /** `result_pct − benchmark_pct`, in percentage points of what was contributed. */
  vs_index_pct?: Decimal;
  missing: BenchmarkGap[];
  idle: number;
}

export interface BucketIndexPctSeries {
  from: CivilDate;
  to: CivilDate;
  points: BucketIndexPctPoint[];
  complete: number;
}

export const bucketIndexPctSeries = (
  events: readonly LedgerEvent[],
  options: SeriesOptions,
): BucketIndexPctSeries => {
  const series = bucketIndexSeries(events, options);
  const state = projectLedger(events, { collectErrors: true });
  const accounts = bucketAccountIds(state);
  const invalid = new Set(state.invalid.map((entry) => entry.event.id));
  let firstTrade: CivilDate | undefined;
  for (const event of events) {
    if (state.reversed.has(event.id) || invalid.has(event.id) || !isOperationEvent(event)) {
      continue;
    }
    const account = (event as { account_id?: string }).account_id;
    if ((event.type === "buy" || event.type === "sell") && accounts.has(account as string)) {
      const date = businessDateOf(state, event);
      firstTrade = firstTrade === undefined || date < firstTrade ? date : firstTrade;
    }
  }
  let complete = 0;
  const points = series.points.map((point): BucketIndexPctPoint => {
    const gross = cashFlowsOf(state, events, accounts, point.date).deposits.amount;
    const { result_eur: result, benchmark_eur: benchmark, vs_index_eur: vs } = point;
    if (result === undefined || benchmark === undefined || vs === undefined) {
      return { date: point.date, missing: point.missing, idle: point.idle };
    }
    if (gross.isZero()) {
      return {
        date: point.date,
        reason:
          firstTrade !== undefined && firstTrade <= point.date
            ? "no_contributions"
            : "no_investments",
        missing: point.missing,
        idle: point.idle,
      };
    }
    complete += 1;
    return {
      date: point.date,
      result_pct: result.amount.div(gross).mul(HUNDRED),
      benchmark_pct: benchmark.amount.div(gross).mul(HUNDRED),
      vs_index_pct: vs.amount.div(gross).mul(HUNDRED),
      missing: point.missing,
      idle: point.idle,
    };
  });
  return { from: series.from, to: series.to, points, complete };
};
