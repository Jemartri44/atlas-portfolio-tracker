// Hand-written minimal typings for the vendored big.js 7.0.1 (only what Decimal uses).
// See VENDOR.md.

export type BigSource = string | number | Big;

/** Rounding modes: 0 down, 1 half-up, 2 half-even, 3 up. */
export type RoundingMode = 0 | 1 | 2 | 3;

export interface Big {
  plus(value: BigSource): Big;
  minus(value: BigSource): Big;
  times(value: BigSource): Big;
  div(value: BigSource): Big;
  cmp(value: BigSource): -1 | 0 | 1;
  eq(value: BigSource): boolean;
  lt(value: BigSource): boolean;
  lte(value: BigSource): boolean;
  gt(value: BigSource): boolean;
  gte(value: BigSource): boolean;
  abs(): Big;
  neg(): Big;
  round(dp?: number, rm?: RoundingMode): Big;
  /** Normal (non-exponential) notation; all digits when `dp` is omitted. */
  toFixed(dp?: number, rm?: RoundingMode): string;
  toString(): string;
}

export interface BigConstructor {
  new (value: BigSource): Big;
  (value: BigSource): Big;
  /** Decimal places of division results. */
  DP: number;
  /** Rounding mode used by division and `round`. */
  RM: RoundingMode;
  readonly roundDown: 0;
  readonly roundHalfUp: 1;
  readonly roundHalfEven: 2;
  readonly roundUp: 3;
}

export const Big: BigConstructor;
declare const BigDefault: BigConstructor;
export default BigDefault;
