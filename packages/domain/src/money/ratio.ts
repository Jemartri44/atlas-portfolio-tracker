// Scaling ratio of a corporate action (data-schema.md §6.5): a decimal string
// or a fraction "new/old" of positive integers, so that 1:3 stays exact in the
// ledger. Parsing and scaling arrive with the primitives; the predicate is
// what shape validation needs.

import { Decimal, isDecimalString } from "./decimal.js";

const FRACTION_PATTERN = /^(\d+)\/(\d+)$/;

/** `"4"`, `"0.25"` (positive decimal) or `"4/3"` (positive integers). */
export const isRatioString = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }
  const fraction = FRACTION_PATTERN.exec(value);
  if (fraction !== null) {
    return Number(fraction[1]) > 0 && Number(fraction[2]) > 0;
  }
  return isDecimalString(value) && Decimal.parse(value).isPositive();
};
