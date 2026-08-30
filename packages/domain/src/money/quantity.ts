// Dimensionless quantity (shares, units, tokens). Exact; up to 18 decimals in practice.

import { Decimal } from "./decimal.js";

export class Quantity {
  private constructor(readonly value: Decimal) {}

  static of(value: Decimal): Quantity {
    return new Quantity(value);
  }

  static parse(text: unknown): Quantity {
    return new Quantity(Decimal.parse(text));
  }

  static readonly ZERO = Quantity.of(Decimal.ZERO);

  add(other: Quantity): Quantity {
    return new Quantity(this.value.add(other.value));
  }

  sub(other: Quantity): Quantity {
    return new Quantity(this.value.sub(other.value));
  }

  mul(factor: Decimal): Quantity {
    return new Quantity(this.value.mul(factor));
  }

  /** this / other as a plain decimal ratio (10 decimals). */
  ratio(other: Quantity): Decimal {
    return this.value.div(other.value);
  }

  cmp(other: Quantity): -1 | 0 | 1 {
    return this.value.cmp(other.value);
  }

  eq(other: Quantity): boolean {
    return this.value.eq(other.value);
  }

  lt(other: Quantity): boolean {
    return this.value.lt(other.value);
  }

  gt(other: Quantity): boolean {
    return this.value.gt(other.value);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  isPositive(): boolean {
    return this.value.isPositive();
  }

  toString(): string {
    return this.value.toString();
  }
}
