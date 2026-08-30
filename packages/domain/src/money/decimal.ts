// Exact decimal arithmetic over the vendored big.js (ADR-0005). Addition,
// subtraction and multiplication are exact; division keeps 10 decimals rounded
// half-up ("derived values with 10 decimals"). Values are immutable.

import type { Big as BigValue } from "../../vendor/big.js";
import Big from "../../vendor/big.js";
import { ValidationError } from "../errors.js";

Big.DP = 10;
Big.RM = Big.roundHalfUp;

/** A decimal serialised as a string: optional sign, digits, optional fraction. No exponent, no separators. */
export type DecimalString = string;

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export const isDecimalString = (value: unknown): value is DecimalString =>
  typeof value === "string" && DECIMAL_PATTERN.test(value);

export class Decimal {
  private constructor(private readonly value: BigValue) {}

  /** Strict parser: only decimal strings. Numbers are rejected (floating point is never accepted). */
  static parse(text: unknown): Decimal {
    if (!isDecimalString(text)) {
      throw new ValidationError("invalid_decimal", "expected a decimal string", { value: text });
    }
    return new Decimal(new Big(text));
  }

  static readonly ZERO = Decimal.parse("0");
  static readonly ONE = Decimal.parse("1");

  add(other: Decimal): Decimal {
    return new Decimal(this.value.plus(other.value));
  }

  sub(other: Decimal): Decimal {
    return new Decimal(this.value.minus(other.value));
  }

  mul(other: Decimal): Decimal {
    return new Decimal(this.value.times(other.value));
  }

  /** Division rounded half-up to 10 decimals. Throws on division by zero. */
  div(other: Decimal): Decimal {
    if (other.isZero()) {
      throw new ValidationError("division_by_zero", "cannot divide by zero", {
        dividend: this.toString(),
      });
    }
    return new Decimal(this.value.div(other.value));
  }

  neg(): Decimal {
    return new Decimal(this.value.neg());
  }

  abs(): Decimal {
    return new Decimal(this.value.abs());
  }

  /** Half-up rounding to `decimals` places. Idempotent. */
  round(decimals: number): Decimal {
    return new Decimal(this.value.round(decimals, Big.roundHalfUp));
  }

  cmp(other: Decimal): -1 | 0 | 1 {
    return this.value.cmp(other.value);
  }

  eq(other: Decimal): boolean {
    return this.value.eq(other.value);
  }

  lt(other: Decimal): boolean {
    return this.value.lt(other.value);
  }

  gt(other: Decimal): boolean {
    return this.value.gt(other.value);
  }

  isZero(): boolean {
    return this.value.eq(0);
  }

  isNegative(): boolean {
    return this.value.lt(0);
  }

  isPositive(): boolean {
    return this.value.gt(0);
  }

  /** Canonical decimal string: normal notation, no exponent, no trailing zeros, no negative zero. */
  toString(): DecimalString {
    return this.value.toFixed();
  }
}
