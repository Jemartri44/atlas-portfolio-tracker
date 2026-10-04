// From the domain's series to what uPlot eats, and to the sentence that explains
// the holes.
//
// **Nothing decides here what a hole is.** `netWorthSeries` already returned a
// block as absent when a price was missing, because a partial total is smaller
// than reality and, drawn on a line, indistinguishable from a fall (Q1). This
// only turns "absent" into `null`, which is what uPlot draws as a gap with
// `spanGaps` off.

import type { NetWorthSeries } from "@atlas/domain";
import type {
  BookCashSeries,
  BucketIndexPctSeries,
  ContributedSeries,
  NoPercentageReason,
} from "@atlas/domain/charts";
import { gapsOf } from "../components/chart/gaps.js";
import { displayName, type NameIndex, NO_NAMES } from "../format/names.js";

/** Seconds since the epoch, which is what uPlot's time scale wants. */
export const secondsOf = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 1000;

export interface PlottedSeries {
  x: number[];
  values: (number | null)[][];
  /** Rows of the equivalent table, in the same order as `values`. */
  rows: { date: string; values: (string | undefined)[] }[];
  /** Points drawn, points asked for, and why the rest are missing. */
  drawn: number;
  total: number;
  missing?: MissingNote;
  /**
   * Why nothing is drawn when it is not a hole in the prices (the bucket has
   * no investments, or no deposits to divide by): said apart, never as «sin
   * precios» nor as pending prices.
   */
  idle?: NoPercentageReason;
}

/**
 * What a chart lacks, said in **one line**, and what it lacks it from, apart:
 * the list of assets folded under the line, where it does not push the chart
 * off the screen (review of 2026-09-19).
 */
export interface MissingNote {
  line: string;
  /** The assets or currencies whose datum is missing, each once. */
  from: readonly string[];
}

const numberOrNull = (value: { amount: { toString: () => string } } | undefined): number | null =>
  value === undefined ? null : Number.parseFloat(value.amount.toString());

const stringOrUndefined = (
  value: { amount: { toString: () => string } } | undefined,
): string | undefined => (value === undefined ? undefined : value.amount.toString());

/**
 * The reason, in one line: in how many dates of how many something is
 * missing, and what happens there — only the series that lacks the datum
 * stops. Which assets lack it goes apart, to be folded.
 *
 * It counts **complete** points — the three blocks present — and the count and
 * the list have to mean the same thing: the cash counts too, and the currency
 * whose rate was missing is on the list.
 */
const reasonOf = (
  drawn: number,
  total: number,
  subjects: readonly string[],
): MissingNote | undefined => {
  if (drawn === total) {
    return undefined;
  }
  return {
    line: `En ${total - drawn} de ${total} fechas falta algún precio: la línea a la que le falta se corta ahí, sin inventar el tramo.`,
    from: [...new Set(subjects)],
  };
};

export const netWorthPlot = (
  series: NetWorthSeries,
  names: NameIndex = NO_NAMES,
): PlottedSeries => {
  const subjects: string[] = [];
  let drawn = 0;
  for (const point of series.points) {
    // The three blocks, cash included: it is one of the three lines drawn and
    // one of the three the sentence below explains.
    if (
      point.core_eur !== undefined &&
      point.bucket_eur !== undefined &&
      point.cash_eur !== undefined
    ) {
      drawn += 1;
    }
    for (const id of [...point.missing.core, ...point.missing.bucket]) {
      subjects.push(displayName(names, id));
    }
    subjects.push(...point.missing.cash);
  }
  return {
    x: series.points.map((point) => secondsOf(point.date)),
    values: [
      series.points.map((point) => numberOrNull(point.core_eur)),
      series.points.map((point) => numberOrNull(point.bucket_eur)),
      series.points.map((point) => numberOrNull(point.cash_eur)),
    ],
    rows: series.points.map((point) => ({
      date: point.date,
      values: [
        stringOrUndefined(point.core_eur),
        stringOrUndefined(point.bucket_eur),
        stringOrUndefined(point.cash_eur),
      ],
    })),
    drawn,
    total: series.points.length,
    ...(reasonOf(drawn, series.points.length, subjects) === undefined
      ? {}
      : { missing: reasonOf(drawn, series.points.length, subjects) as MissingNote }),
  };
};

/**
 * The two books **with the cash of their own accounts**, in place of the three
 * blocks of the net worth (ADR-0004: net worth is the core, the bucket and the
 * cash of the investment accounts). A portfolio funded with 10.000 that bought
 * 2.000 stands at 10.000 against what was put in, not at 2.000, and the cash is
 * not a third line that would count it again. The dates, the holes and the
 * sentence about what is missing are those of `netWorthPlot`: a book is absent
 * on the same dates that the three blocks were, so only the values change.
 */
export const withBookCash = (plot: PlottedSeries, series: BookCashSeries): PlottedSeries => ({
  ...plot,
  values: [
    series.points.map((point) => numberOrNull(point.core_eur)),
    series.points.map((point) => numberOrNull(point.bucket_eur)),
  ],
  rows: plot.rows.map((row, index) => ({
    ...row,
    values: [
      stringOrUndefined(series.points[index]?.core_eur),
      stringOrUndefined(series.points[index]?.bucket_eur),
    ],
  })),
});

/**
 * What was contributed, as one more series of the net worth plot, on **the
 * same dates** (the domain guarantees it): it is never absent, so it adds no
 * hole. The amounts of the table stay strings.
 */
export const withContributed = (plot: PlottedSeries, series: ContributedSeries): PlottedSeries => ({
  ...plot,
  values: [...plot.values, series.points.map((point) => numberOrNull(point.contributed_eur))],
  rows: plot.rows.map((row, index) => ({
    ...row,
    values: [...row.values, stringOrUndefined(series.points[index]?.contributed_eur)],
  })),
});

/**
 * The bucket against the index **in percent** of what was contributed (feature
 * 020, E4, M7). The values are numbers only to place the line: what is shown
 * is the decimal string of the domain, formatted once.
 */
export const bucketIndexPlot = (full: BucketIndexPctSeries): PlottedSeries => {
  // A date with a reason (nothing invested yet, or nothing contributed) is not a
  // hole: it is left out wherever it falls, so no band says «sin precios» over it
  // and the rule of the holes does not count it. If nothing is drawn, the card
  // says the reason of the last one, if the series ends there.
  const points = full.points.filter((point) => point.reason === undefined);
  const series = { ...full, points };
  const drawn = series.points.filter((point) => point.vs_index_pct !== undefined).length;
  // Only when the series ENDS quiet: a hole after the quiet dates is a missing price, not a reason.
  const lastReason: NoPercentageReason | undefined = full.points.at(-1)?.reason;
  const share = (value: { toString: () => string } | undefined): number | null =>
    value === undefined ? null : Number.parseFloat(value.toString());
  const text = (value: { toString: () => string } | undefined): string | undefined =>
    value?.toString();
  return {
    x: series.points.map((point) => secondsOf(point.date)),
    values: [
      series.points.map((point) => share(point.result_pct)),
      series.points.map((point) => share(point.benchmark_pct)),
    ],
    rows: series.points.map((point) => ({
      date: point.date,
      values: [text(point.result_pct), text(point.benchmark_pct)],
    })),
    drawn,
    total: series.points.length,
    ...(drawn === 0 && lastReason !== undefined ? { idle: lastReason } : {}),
    ...(drawn === series.points.length
      ? {}
      : {
          missing: {
            line: `En ${series.points.length - drawn} de ${series.points.length} fechas falta el precio del índice o de algún activo del cubo: la comparación se corta ahí.`,
            from: [],
          },
        }),
  };
};

/**
 * What to do when the holes take up **more than half** of the width of the
 * range chosen (feature 020, E4, M7): nothing, jump to the last stretch with
 * data (the indices of its first and last point), or, with no data at all,
 * `"pending"`, and no chart. A hole is where no series has a value, measured
 * as the band the chart draws over it. Presentation, not a rule of the
 * domain: nothing is estimated, the stretch is simply the last one known.
 */
export type HoleRule = undefined | "pending" | { from: number; to: number };

export const gapRule = (
  x: readonly number[],
  values: readonly (readonly (number | null)[])[],
): HoleRule => {
  const known = x.map((_, index) => values.some((series) => (series[index] ?? null) !== null));
  const last = known.lastIndexOf(true);
  if (last === -1) {
    return "pending";
  }
  const width = gapsOf(
    x,
    values.map((series) => ({ values: series })),
  ).reduce((sum, gap) => sum + (gap.to - gap.from), 0);
  if (2 * width <= (x[x.length - 1] as number) - (x[0] as number)) {
    return undefined;
  }
  let first = last;
  while (first > 0 && known[first - 1] === true) {
    first -= 1;
  }
  return { from: first, to: last };
};
