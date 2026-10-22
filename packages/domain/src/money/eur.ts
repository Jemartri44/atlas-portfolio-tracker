import { EUR, Money } from "./money.js";

/** A fresh zero in euros. */
export const zero = (): Money => Money.zero(EUR);

export const sum = (values: readonly Money[]): Money =>
  values.reduce((total, value) => total.add(value), zero());

/** The amount, or zero when it is negative. */
export const positive = (money: Money): Money => (money.isNegative() ? zero() : money);
