// Realized gains per sell, lot by lot (data-schema.md §8.1). Exact per lot,
// summed per operation and rounded to cents once (ADR-0005). The wash-sale rule
// is left to the tax engine.

import { yearOf } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import type { FxRate } from "../money/fx-rate.js";
import { EUR, Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type { AccountId, AssetId } from "../schema/events.js";
import { type FxGainMethod, fxGainMethodOf } from "../settings/settings.js";
import type { LotSlice } from "./lots.js";
import type { GainByLot, LedgerState, RealizedGain } from "./state.js";

/** Splits `total` across the slices in proportion to quantity; the last slice takes the exact remainder. */
const shares = (slices: readonly LotSlice[], total: Money, quantity: Quantity): Money[] => {
  let assigned = Money.zero(total.currency);
  return slices.map((slice, index) => {
    const share =
      index === slices.length - 1
        ? total.sub(assigned)
        : total.mul(slice.quantity.value).div(quantity.value);
    assigned = assigned.add(share);
    return share;
  });
};

/** What a transmission received, in its currency and at its rate. */
export interface Proceeds {
  /** Net of the fee, in the currency of the operation. */
  amount: Money;
  fx: FxRate;
}

/**
 * Whether a lot's gain is computed first in the currency of the transmission
 * (criterion #4): the method says so, the transmission is not in euros, and
 * the lot was acquired in that same currency.
 */
const inCurrency = (method: FxGainMethod, proceeds: Proceeds, slice: LotSlice): boolean =>
  method === "currency_first" &&
  proceeds.amount.currency !== EUR &&
  slice.cost.currency === proceeds.amount.currency;

/**
 * The gain of each consumed slice. In currency first, the cost in that currency
 * is subtracted from the share of the proceeds and the difference converted at
 * the rate of the transmission; the acquisition value in euros is then what
 * makes proceeds minus cost equal that gain, so both legs are at the rate of
 * the transmission. Otherwise each leg keeps the rate of its own day.
 */
export const allocateProceeds = (
  slices: readonly LotSlice[],
  proceedsEur: Money,
  quantity: Quantity,
  proceeds: Proceeds,
  method: FxGainMethod,
): GainByLot[] => {
  const euros = shares(slices, proceedsEur, quantity);
  const currency = shares(slices, proceeds.amount, quantity);
  return slices.map((slice, index) => {
    const share = euros[index] as Money;
    const gain = inCurrency(method, proceeds, slice)
      ? proceeds.fx.toEur((currency[index] as Money).sub(slice.cost))
      : share.sub(slice.cost_eur);
    return {
      lot_id: slice.lot_id,
      quantity: slice.quantity,
      proceeds_eur: share,
      cost_eur: share.sub(gain),
      gain_eur: gain,
    };
  });
};

/** How criterion #4 reached the gain of a transmission that involves a foreign currency. */
const methodOf = (
  method: FxGainMethod,
  proceeds: Proceeds,
  slices: readonly LotSlice[],
): RealizedGain["fx_method"] => {
  const currency = proceeds.amount.currency;
  const foreign = currency !== EUR || slices.some((slice) => slice.cost.currency !== EUR);
  if (!foreign) {
    return undefined;
  }
  if (slices.some((slice) => slice.cost.currency !== currency)) {
    return "mixed";
  }
  return method;
};

export interface GainInput {
  event_id: Ulid;
  asset_id: AssetId;
  account_id: AccountId;
  fiscal_date: string;
  quantity: Quantity;
  proceeds_eur: Money;
  /** The proceeds in their currency and at their rate. */
  proceeds: Proceeds;
  slices: readonly LotSlice[];
}

export const recordGain = (state: LedgerState, input: GainInput): RealizedGain => {
  const method = fxGainMethodOf(state.fiscalSettings);
  const byLot = allocateProceeds(
    input.slices,
    input.proceeds_eur,
    input.quantity,
    input.proceeds,
    method,
  );
  const costEur = byLot.reduce((total, lot) => total.add(lot.cost_eur), Money.zero("EUR"));
  const gainEur = input.proceeds_eur.sub(costEur);
  const fxMethod = methodOf(method, input.proceeds, input.slices);
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
    ...(fxMethod === undefined ? {} : { fx_method: fxMethod }),
  };
  state.gains.push(gain);
  state.lotJournal.push({ kind: "gain", gain_index: state.gains.length - 1 });
  return gain;
};

/** What the currency spent on the consumed slices cost in euros (`FiscalLot.funding_eur`). */
export const fundingOf = (slices: readonly LotSlice[]): Money =>
  slices.reduce((total, slice) => total.add(slice.funding_eur), Money.zero(EUR));

export const realizedGains = (state: LedgerState, year: number): RealizedGain[] =>
  state.gains.filter((gain) => gain.year === year);
