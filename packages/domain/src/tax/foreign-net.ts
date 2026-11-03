// The foreign income of a dividend as it enters the savings base: its gross
// less the share of the deductible fees (box 0037 in 2025) that falls on it.
//
// Renta WEB asks, in the double-taxation window, for the "rendimientos netos
// reducidos del capital mobiliario obtenidos en el extranjero" (data
// dictionary of the Modelo 100 of 2025). The law does not say how a fee shared
// by every income is split; Atlas splits it in proportion to the gross of
// dividends and interest, the only income the custody fees relate to. That is
// Atlas's reading (criterion #16), and never below zero. The treaty limit is
// another figure and stays on the gross (`doubleTaxation` in `notes.ts`).

import { positive, sum } from "../money/eur.js";
import type { Money } from "../money/money.js";
import type { TaxYearReport } from "./report.js";

/** A function from the gross of one foreign dividend to its net. */
export const foreignNetOf = (report: TaxYearReport): ((gross: Money) => Money) => {
  const movable = report.movable_capital;
  const income = sum([
    ...movable.dividends.map((line) => line.gross_eur_rounded),
    ...movable.interest.map((line) => line.gross_eur_rounded),
  ]);
  // Negative: the fees reduce the income.
  const fees = sum(movable.expenses.map((line) => line.amount_eur_rounded));
  if (income.isNegative() || income.isZero() || fees.isZero()) {
    return (gross) => gross;
  }
  return (gross) => positive(gross.add(fees.mul(gross.amount.div(income.amount)).roundToCents()));
};
