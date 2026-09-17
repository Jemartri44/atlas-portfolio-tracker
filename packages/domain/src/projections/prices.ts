// Manual prices (data-schema.md §7, feature 004): the last `valuation` per
// asset on or before a date, in its currency and in euros, with its age.
//
// Informative by definition: no tax calculation reads this (constitution II),
// and a missing price is never interpolated or replaced by zero (constitution
// V) — the asset simply does not appear in the map.

import { type CivilDate, daysBetween } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { Decimal } from "../money/decimal.js";
import { FxRate } from "../money/fx-rate.js";
import type { Currency } from "../money/money.js";
import { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type { AssetId, ValuationEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import type { LedgerState } from "./state.js";

export interface ManualPrice {
  asset_id: AssetId;
  /** The `valuation` it comes from. */
  event_id: Ulid;
  date: CivilDate;
  unit_value: Decimal;
  currency: Currency;
  /** ECB rate as published (ADR-0013). */
  fx_rate: Decimal;
  /** `unit_value / fx_rate`, 10 decimals. */
  unit_value_eur: Money;
  /** Days from the valuation to the date asked; never negative. */
  age_days: number;
  /** Older than `stale_price_days`; always false when the parameter is not set. */
  stale: boolean;
}

/** Value in euros of a position at its manual price; nothing without a price. */
export const positionValueOf = (
  price: ManualPrice | undefined,
  quantity: Quantity,
): Money | undefined =>
  price === undefined
    ? undefined
    : Money.of(price.unit_value_eur.amount.mul(quantity.value), "EUR");

const toManualPrice = (
  event: ValuationEvent,
  date: CivilDate,
  staleAfter: number | undefined,
): ManualPrice => {
  const unitValue = Decimal.parse(event.unit_value);
  const fx = FxRate.of(Decimal.parse(event.fx_rate), event.currency, event.date);
  const ageDays = daysBetween(event.date, date);
  return {
    asset_id: event.asset_id,
    event_id: event.id,
    date: event.date,
    unit_value: unitValue,
    currency: event.currency,
    fx_rate: fx.rate,
    unit_value_eur: fx.toEur(Money.of(unitValue, event.currency)),
    age_days: ageDays,
    stale: staleAfter !== undefined && ageDays > staleAfter,
  };
};

/**
 * Last known price per asset on or before `date`, from any account (decision
 * (b) of prompt 004). `state.valuations` is already in (date, file position)
 * order, so the last one seen wins and a tie is broken by file position.
 */
export const manualPrices = (
  state: LedgerState,
  date: CivilDate,
  settings: Settings,
): Map<AssetId, ManualPrice> => {
  const latest = new Map<AssetId, ValuationEvent>();
  for (const event of state.valuations) {
    if (event.date <= date) {
      latest.set(event.asset_id, event);
    }
  }
  const prices = new Map<AssetId, ManualPrice>();
  for (const [assetId, event] of latest) {
    prices.set(assetId, toManualPrice(event, date, settings.stale_price_days));
  }
  return prices;
};
