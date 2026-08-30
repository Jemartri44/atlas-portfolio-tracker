// Scaling ratio of a corporate action (data-schema.md §6.5): a decimal string
// or a fraction "new/old" of positive integers, so that 1:3 stays exact in the
// ledger. Scaling multiplies exactly and divides only by a real denominator
// (10 decimals half-up when the division is not exact, ADR-0005).

import { ValidationError } from "../errors.js";
import { Decimal, isDecimalString } from "./decimal.js";
import { Quantity } from "./quantity.js";

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

export class Ratio {
  private constructor(
    readonly numerator: Decimal,
    readonly denominator: Decimal,
    private readonly text: string,
  ) {}

  static parse(text: unknown): Ratio {
    if (!isRatioString(text)) {
      throw new ValidationError("invalid_ratio", "expected a positive decimal or an n/d fraction", {
        value: text,
      });
    }
    const fraction = FRACTION_PATTERN.exec(text);
    return fraction === null
      ? new Ratio(Decimal.parse(text), Decimal.ONE, text)
      : new Ratio(Decimal.parse(fraction[1] as string), Decimal.parse(fraction[2] as string), text);
  }

  /** `quantity × numerator / denominator`; exact unless a real denominator leaves a remainder. */
  apply(quantity: Quantity): Quantity {
    const scaled = quantity.value.mul(this.numerator);
    return Quantity.of(this.denominator.eq(Decimal.ONE) ? scaled : scaled.div(this.denominator));
  }

  toString(): string {
    return this.text;
  }
}

/**
 * Scales a list so that the sum is exactly `ratio.apply(sum)`: every element
 * is scaled on its own and the last one takes the exact remainder. With an
 * exact ratio the remainder is zero and each element is exactly `q × ratio`.
 */
export const scaleQuantities = (quantities: readonly Quantity[], ratio: Ratio): Quantity[] => {
  const total = ratio.apply(quantities.reduce((sum, q) => sum.add(q), Quantity.ZERO));
  let assigned = Quantity.ZERO;
  return quantities.map((quantity, index) => {
    const scaled = index === quantities.length - 1 ? total.sub(assigned) : ratio.apply(quantity);
    assigned = assigned.add(scaled);
    return scaled;
  });
};
