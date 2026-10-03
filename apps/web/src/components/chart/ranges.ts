// The time ranges, as plain data.
//
// Separate from `RangeButtons.tsx` on purpose: the view-model that decides how
// many points fall inside a range needs these numbers, and importing them from
// the component would drag Solid's JSX runtime — and therefore `window` — into a
// module that is meant to be a pure function with a test.

export type RangeKey = "ESTE_ANO" | "1A" | "5A" | "TODO";

export const RANGE_KEYS: readonly RangeKey[] = ["ESTE_ANO", "1A", "5A", "TODO"];

/**
 * Days each window spans back from the last point. "Todo" has no window, and
 * "Este año" is not a span of days: it is the calendar year of the date asked
 * about (feature 020, E4).
 */
export const RANGE_DAYS: Record<Exclude<RangeKey, "TODO" | "ESTE_ANO">, number> = {
  "1A": 366,
  "5A": 1827,
};

export const RANGE_LABELS: Record<RangeKey, string> = {
  ESTE_ANO: "Este año",
  "1A": "1 año",
  "5A": "5 años",
  TODO: "Todo",
};

export const DAY_SECONDS = 86_400;

export interface RangeCount {
  key: RangeKey;
  label: string;
  /** Points **with data** inside the window. Zero means the button is dead. */
  points: number;
}

/**
 * How many points each range would actually draw.
 *
 * Two rules live here and neither is obvious:
 *
 *   1. a point only counts when **some series has a value there**. Counting the
 *      dates instead would light up a button that opens onto four holes;
 *   2. a range with zero points is offered **disabled, with its reason**, not
 *      hidden and not enabled. With prices recorded once or twice a year "1 mes"
 *      is empty most of the time, and an empty chart reads as a broken chart.
 */
export const rangeCounts = (
  x: readonly number[],
  values: readonly (readonly (number | null)[])[],
  asOf: string,
): RangeCount[] =>
  RANGE_KEYS.map((key) => ({
    key,
    label: RANGE_LABELS[key],
    points: rangeIndices(x, key, asOf).filter((index) =>
      values.some((series) => series[index] !== null && series[index] !== undefined),
    ).length,
  }));

/**
 * The indices a range selects, which is what the chart and the table both draw.
 * "Este año" runs from 1 January of the year of the date asked about to that
 * date, and the series ends at it: the points are dates at UTC midnight, so
 * their year is read in UTC and no zone can move a point across the new year.
 */
export const rangeIndices = (x: readonly number[], key: RangeKey, asOf: string): number[] => {
  const last = x[x.length - 1] ?? 0;
  const inside = (value: number): boolean =>
    key === "TODO" ||
    (key === "ESTE_ANO"
      ? new Date(value * 1000).getUTCFullYear() === Number(asOf.slice(0, 4))
      : value >= last - RANGE_DAYS[key] * DAY_SECONDS);
  return x.flatMap((value, index) => (inside(value) ? [index] : []));
};
