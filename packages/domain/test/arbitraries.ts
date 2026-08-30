// fast-check generators shared by the domain tests.

import fc from "fast-check";
import { Decimal } from "../src/money/decimal.js";

/** Decimal strings with up to 24 integer digits and up to 18 decimals, canonical form. */
export const decimalString = (options: { min?: bigint; max?: bigint; scale?: number } = {}) =>
  fc
    .tuple(
      fc.bigInt({ min: options.min ?? -(10n ** 24n), max: options.max ?? 10n ** 24n }),
      fc.nat({ max: options.scale ?? 18 }),
    )
    .map(([unscaled, scale]) => {
      const negative = unscaled < 0n;
      const digits = (negative ? -unscaled : unscaled).toString().padStart(scale + 1, "0");
      const integer = digits.slice(0, digits.length - scale);
      const fraction = digits.slice(digits.length - scale);
      const text = fraction.length === 0 ? integer : `${integer}.${fraction}`;
      return Decimal.parse(negative ? `-${text}` : text).toString();
    });

export const decimal = (options?: Parameters<typeof decimalString>[0]) =>
  decimalString(options).map((text) => Decimal.parse(text));

export const positiveDecimal = () =>
  decimal({ min: 1n, max: 10n ** 24n, scale: 10 }).filter((value) => value.isPositive());

export const currency = () => fc.constantFrom("EUR", "USD", "GBP", "CHF", "JPY");
