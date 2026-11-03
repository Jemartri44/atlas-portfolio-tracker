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
 * the form takes in boxes of their own and is rounded on its own. On a loss
 * the two roundings could leave a cent of gain (a loss of 0,0099 is 0,00 by
 * its legs and its whole deferral is −0,01): a loss never computes above zero.
 */
export const computableRounded = (
  gain: { gain_eur: Money; gain_eur_rounded: Money },
  computable: Money,
): Money => {
  const rounded = gain.gain_eur_rounded.add(computable.sub(gain.gain_eur).roundToCents());
  return gain.gain_eur.isNegative() && rounded.amount.isPositive() ? zero() : rounded;
};

/**
 * What a loss of the year leaves imputable on the form: its own result by its
 * legs less what is **still** deferred of it at 31/12, each rounded on its own,
 * as the row of the loss and the engine both compute it (criterion #6). Never
 * above zero: a deferral cannot turn a loss into a gain.
 */
export const imputableRounded = (legs: Money, stillDeferred: Money): Money => {
  const rounded = legs.sub(stillDeferred.roundToCents());
  return rounded.isNegative() ? rounded : zero();
};
