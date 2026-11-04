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

/**
 * Digits a decimal string may carry **when it is written**, sign and point aside. Far above any
 * amount, quantity or rate of a real ledger (the widest, a rate to ten decimals of a large sum,
 * takes some 25); what it stops is a number of thousands of digits, whose arithmetic grows with
 * its length. Only on writing (`recordEvent`, the API): the loader never applies it, because
 * narrowing what a ledger may hold is a change of `schema_version` (ADR-0018).
 */
export const MAX_DECIMAL_DIGITS = 40;

/** Whether a value to be written holds, at any depth, a decimal string of more than `MAX_DECIMAL_DIGITS` digits. */
export const hasOverlongDecimal = (value: unknown): boolean => {
  if (typeof value === "string") {
    return (
      value.length > MAX_DECIMAL_DIGITS &&
      DECIMAL_PATTERN.test(value) &&
      value.replace(/[-.]/g, "").length > MAX_DECIMAL_DIGITS
    );
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.entries(value).some(
    ([key, member]) => !key.includes("fingerprint") && hasOverlongDecimal(member),
  );
};

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

  /** Square root rounded half-up to 10 decimals, as `div`. Only of a value that is not negative. */
  sqrt(): Decimal {
    return new Decimal(this.value.sqrt());
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

/** 100, for percentages. */
export const HUNDRED = /* @__PURE__ */ Decimal.parse("100");
