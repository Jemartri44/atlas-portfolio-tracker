import { EUR, Money } from "./money.js";

/** A fresh zero in euros. */
export const zero = (): Money => Money.zero(EUR);

export const sum = (values: readonly Money[]): Money =>
  values.reduce((total, value) => total.add(value), zero());

/** The amount, or zero when it is negative. */
export const positive = (money: Money): Money => (money.isNegative() ? zero() : money);

/**
 * The result of one operation as the form computes it (criterion #6): the
 * transmission and the acquisition are typed rounded to cents, and Renta WEB
 * subtracts them. Rounding the difference instead can give a cent more or
 * less per row, and the sum and box 0460 would not be the form's.
 */
export const legsRounded = (proceeds: Money, cost: Money): Money =>
  proceeds.roundToCents().sub(cost.roundToCents());

/**
 * What an operation computes, rounded: its own result as the form computes it
 * plus what the wash-sale rule adds or holds back (`computable − own`), which
 * the form takes in boxes of their own and is rounded on its own.
 */
export const computableRounded = (
  gain: { gain_eur: Money; gain_eur_rounded: Money },
  computable: Money,
): Money => gain.gain_eur_rounded.add(computable.sub(gain.gain_eur).roundToCents());
