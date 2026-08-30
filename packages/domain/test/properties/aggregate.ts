import { Decimal } from "../../src/money/decimal.js";
import { Quantity } from "../../src/money/quantity.js";
import type { LedgerState } from "../../src/projections/state.js";

/** Id-free summary of a projected state, for comparing ledgers whose event ids differ. */
export const aggregate = (state: LedgerState): Record<string, unknown> => ({
  positions: [...state.positions].map(([k, q]) => [k, q.toString()]).sort(),
  cash: [...state.cash].map(([k, m]) => [k, m.amount.toString()]).sort(),
  gains: state.gains
    .map((g) => [
      g.fiscal_date,
      g.proceeds_eur.amount.toString(),
      g.cost_eur.amount.toString(),
      g.gain_eur_rounded.amount.toString(),
    ])
    .sort(),
  lots: [...state.lots].map(([asset, lots]) => [
    asset,
    lots.open.reduce((total, lot) => total.add(lot.quantity), Quantity.ZERO).toString(),
    lots.open.reduce((total, lot) => total.add(lot.cost_eur.amount), Decimal.ZERO).toString(),
  ]),
});
