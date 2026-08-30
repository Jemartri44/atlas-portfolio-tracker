// Valuation snapshots at a date (data-schema.md §7, Modelo 720): the last
// `valuation` per (account, asset) with `date <=` the one asked, valued in EUR.
// Informative only; no tax calculation reads it.

import type { CivilDate } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { Decimal } from "../money/decimal.js";
import { FxRate } from "../money/fx-rate.js";
import type { Currency, Money } from "../money/money.js";
import { Price } from "../money/price.js";
import { Quantity } from "../money/quantity.js";
import type { AccountId, AssetId, ValuationEvent } from "../schema/events.js";
import { type LedgerState, positionKey } from "./state.js";

export interface ValuationAt {
  event_id: Ulid;
  account_id: AccountId;
  asset_id: AssetId;
  date: CivilDate;
  quantity: Quantity;
  unit_value: Decimal;
  currency: Currency;
  fx_rate: Decimal;
  /** `quantity × unit_value / fx_rate`, 10 decimals. */
  value_eur: Money;
}

const toValuationAt = (event: ValuationEvent): ValuationAt => {
  const quantity = Quantity.parse(event.quantity);
  const unitValue = Decimal.parse(event.unit_value);
  const fx = FxRate.of(Decimal.parse(event.fx_rate), event.currency, event.date);
  return {
    event_id: event.id,
    account_id: event.account_id,
    asset_id: event.asset_id,
    date: event.date,
    quantity,
    unit_value: unitValue,
    currency: event.currency,
    fx_rate: fx.rate,
    value_eur: fx.toEur(Price.of(unitValue, event.currency).times(quantity)),
  };
};

/** Latest snapshot per pair on or before `date`; `state.valuations` is already in (date, file position) order. */
export const valuations = (state: LedgerState, date: CivilDate): ValuationAt[] => {
  const latest = new Map<string, ValuationEvent>();
  for (const event of state.valuations) {
    if (event.date <= date) {
      latest.set(positionKey(event.account_id, event.asset_id), event);
    }
  }
  return [...latest.values()].map(toValuationAt);
};
