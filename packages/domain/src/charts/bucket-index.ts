// The bucket against the index over time (rule 16, `docs/specification.md`
// §6.2: "value curve of the bucket against the same money invested in the
// index"). With the other charts, behind `@atlas/domain/charts`: only the Cubo
// draws it, and the theses it reads are not on the boot path of the web.

import type { CivilDate } from "../dates/civil-date.js";
import { EUR, Money } from "../money/money.js";
import { type BenchmarkGap, bucketTheses } from "../projections/bucket-theses.js";
import { readSeries, type SeriesOptions } from "../projections/series.js";
import type { LedgerEvent } from "../schema/events.js";

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
