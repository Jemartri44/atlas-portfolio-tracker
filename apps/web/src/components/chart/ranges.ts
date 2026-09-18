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
