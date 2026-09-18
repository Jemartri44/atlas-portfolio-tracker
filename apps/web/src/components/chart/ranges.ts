// The time ranges, as plain data.
//
// Separate from `RangeButtons.tsx` on purpose: the view-model that decides how
// many points fall inside a range needs these numbers, and importing them from
// the component would drag Solid's JSX runtime — and therefore `window` — into a
// module that is meant to be a pure function with a test.

export type RangeKey = "1M" | "1A" | "5A" | "TODO";

export const RANGE_KEYS: readonly RangeKey[] = ["1M", "1A", "5A", "TODO"];

/** Days each window spans back from the last point. "Todo" has no window. */
export const RANGE_DAYS: Record<Exclude<RangeKey, "TODO">, number> = {
  "1M": 31,
  "1A": 366,
  "5A": 1827,
};

export const RANGE_LABELS: Record<RangeKey, string> = {
  "1M": "1 mes",
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
): RangeCount[] => {
  const last = x[x.length - 1] ?? 0;
  return RANGE_KEYS.map((key) => ({
    key,
    label: RANGE_LABELS[key],
    points: x.filter(
      (value, index) =>
        (key === "TODO" || value >= last - RANGE_DAYS[key] * DAY_SECONDS) &&
        values.some((series) => series[index] !== null && series[index] !== undefined),
    ).length,
  }));
};

/** The indices a range selects, which is what the chart and the table both draw. */
export const rangeIndices = (x: readonly number[], key: RangeKey): number[] => {
  if (key === "TODO") {
    return x.map((_, index) => index);
  }
  const from = (x[x.length - 1] ?? 0) - RANGE_DAYS[key] * DAY_SECONDS;
  return x.flatMap((value, index) => (value >= from ? [index] : []));
};
