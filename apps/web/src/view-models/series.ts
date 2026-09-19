// From the domain's series to what uPlot eats, and to the sentence that explains
// the holes.
//
// **Nothing decides here what a hole is.** `netWorthSeries` already returned a
// block as absent when a price was missing, because a partial total is smaller
// than reality and, drawn on a line, indistinguishable from a fall (Q1). This
// only turns "absent" into `null`, which is what uPlot draws as a gap with
// `spanGaps` off.

import type { BucketIndexSeries, NetWorthSeries } from "@atlas/domain";
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

export const bucketIndexPlot = (series: BucketIndexSeries): PlottedSeries => {
  const drawn = series.points.filter((point) => point.vs_index_eur !== undefined).length;
  return {
    x: series.points.map((point) => secondsOf(point.date)),
    values: [
      series.points.map((point) => numberOrNull(point.result_eur)),
      series.points.map((point) => numberOrNull(point.benchmark_eur)),
    ],
    rows: series.points.map((point) => ({
      date: point.date,
      values: [stringOrUndefined(point.result_eur), stringOrUndefined(point.benchmark_eur)],
    })),
    drawn,
    total: series.points.length,
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
