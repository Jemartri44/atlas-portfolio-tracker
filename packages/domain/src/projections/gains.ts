// Realized gains per sell, lot by lot (data-schema.md §8.1). Exact per lot,
// summed per operation and rounded to cents once (ADR-0005). The wash-sale rule
// is left to the tax engine (feature 005).

import { yearOf } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type { AccountId, AssetId } from "../schema/events.js";
import type { LotSlice } from "./lots.js";
import type { GainByLot, LedgerState, RealizedGain } from "./state.js";

/** Splits the proceeds across the consumed slices in proportion to quantity; the last slice takes the exact remainder. */
export const allocateProceeds = (
  slices: readonly LotSlice[],
  proceedsEur: Money,
  quantity: Quantity,
): GainByLot[] => {
  let assigned = Money.zero(proceedsEur.currency);
  return slices.map((slice, index) => {
    const share =
      index === slices.length - 1
        ? proceedsEur.sub(assigned)
        : proceedsEur.mul(slice.quantity.value).div(quantity.value);
    assigned = assigned.add(share);
    return {
      lot_id: slice.lot_id,
      quantity: slice.quantity,
      proceeds_eur: share,
      cost_eur: slice.cost_eur,
      gain_eur: share.sub(slice.cost_eur),
    };
  });
};

export interface GainInput {
  event_id: Ulid;
  asset_id: AssetId;
  account_id: AccountId;
  fiscal_date: string;
  quantity: Quantity;
  proceeds_eur: Money;
  slices: readonly LotSlice[];
}

export const recordGain = (state: LedgerState, input: GainInput): RealizedGain => {
  const byLot = allocateProceeds(input.slices, input.proceeds_eur, input.quantity);
  const costEur = byLot.reduce((total, lot) => total.add(lot.cost_eur), Money.zero("EUR"));
  const gainEur = input.proceeds_eur.sub(costEur);
  const gain: RealizedGain = {
    event_id: input.event_id,
    asset_id: input.asset_id,
    account_id: input.account_id,
    fiscal_date: input.fiscal_date,
    year: yearOf(input.fiscal_date),
    quantity: input.quantity,
    proceeds_eur: input.proceeds_eur,
    cost_eur: costEur,
    gain_eur: gainEur,
    gain_eur_rounded: gainEur.roundToCents(),
    by_lot: byLot,
  };
  state.gains.push(gain);
  return gain;
};

export const realizedGains = (state: LedgerState, year: number): RealizedGain[] =>
  state.gains.filter((gain) => gain.year === year);
