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
  missing?: string;
}

const numberOrNull = (value: { amount: { toString: () => string } } | undefined): number | null =>
  value === undefined ? null : Number.parseFloat(value.amount.toString());

const stringOrUndefined = (
  value: { amount: { toString: () => string } } | undefined,
): string | undefined => (value === undefined ? undefined : value.amount.toString());

/**
 * The reason, in one sentence: which assets and how many points went missing.
 *
 * It counts **complete** points — the three blocks present — and the count and
 * the sentence have to mean the same thing. They did not: the count ignored the
 * cash and the sentence named the currency whose rate was missing, so a chart
 * could say "8 de 8" and, underneath, why one of the eight was incomplete.
 *
 * The wording says what actually happens: the point is not complete, and only
 * the series that lacks the datum breaks there — the other two are drawn.
 */
const reasonOf = (
  drawn: number,
  total: number,
  subjects: readonly string[],
): string | undefined => {
  if (drawn === total) {
    return undefined;
  }
  const gaps = total - drawn;
  const what =
    subjects.length === 0
      ? "falta algún dato en esas fechas"
      : `falta el dato de ${[...new Set(subjects)].join(", ")}`;
  return `${drawn} de ${total} ${total === 1 ? "punto" : "puntos"} completos: en ${gaps} ${
    gaps === 1 ? "punto falta un bloque" : "puntos faltan bloques"
  } porque ${what}, y la serie a la que le falta se corta ahí. No se interpola: donde no hay dato, hay hueco.`;
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
      : { missing: reasonOf(drawn, series.points.length, subjects) as string }),
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
          missing: `${drawn} de ${series.points.length} puntos con datos: en el resto falta el precio del índice o de algún activo del cubo, y una suma parcial no se puede comparar con nada.`,
        }),
  };
};
