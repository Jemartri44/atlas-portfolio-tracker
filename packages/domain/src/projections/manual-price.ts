// The manual price of an asset at a date: the last `valuation` the ledger
// holds on or before it, and **nothing else** (feature 013, decision §6.5 (a)
// of its prompt; ADR-0031, second amendment).
//
// **This is the one price the Modelo 720 reads, and any change here changes
// the 720.** It is a leaf on purpose: it imports nothing of the price gate
// (`prices.ts`) nor of the automatic quotes (`quotes/`), so an informative
// return that reaches this file reaches no automatic quote, at any depth. The
// architecture test reads the import graph and holds it: this leaf is the only
// thing related to prices that `informative/` may reach, and `tax/` may not
// reach even this.
//
// The gate of presentation (`prices.ts`) imports this file instead of reading
// the valuations on its own (decision D-Q8 of the direction), so the
// valuations are read in one place. The price paid for that is written here so
// nobody pays it without knowing: a change made in this leaf for the sake of a
// view is also a change of the Modelo 720. That is why the 720 carries the
// test of an identical fiscal output with automatic quotes that would win in a
// view, and the mutants of the 720 (prompt 013, §5, mutants 2 and 3).

import type { CivilDate } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { Decimal } from "../money/decimal.js";
import { FxRate } from "../money/fx-rate.js";
import type { Currency } from "../money/money.js";
import { Money } from "../money/money.js";
import type { AssetId, ValuationEvent } from "../schema/events.js";
import type { LedgerState } from "./state.js";

/**
 * A registered valuation, read as a price. Its value in euros is **always**
 * there: a `valuation` always carries its ECB rate (ADR-0013).
 */
export interface ManualPrice {
  asset_id: AssetId;
  event_id: Ulid;
  date: CivilDate;
  unit_value: Decimal;
  currency: Currency;
  /** ECB rate as published (ADR-0013). */
  fx_rate: Decimal;
  /** The day of that rate, which is not the day of the price. */
  fx_rate_date: CivilDate;
  /** `unit_value / fx_rate`, 10 decimals. */
  unit_value_eur: Money;
}

/**
 * Last valuation per asset on or before `date`. `state.valuations` is already
 * in (date, file position) order, so the last one seen wins and a tie is
 * broken by file position (decision (b) of prompt 004).
 */
export const latestValuations = (
  state: LedgerState,
  date: CivilDate,
): Map<AssetId, ValuationEvent> => {
  const latest = new Map<AssetId, ValuationEvent>();
  for (const event of state.valuations) {
    if (event.date <= date) {
      latest.set(event.asset_id, event);
    }
  }
  return latest;
};

/** A valuation as a manual price. */
export const manualPriceOf = (event: ValuationEvent): ManualPrice => {
  const unitValue = Decimal.parse(event.unit_value);
  const fxRate = Decimal.parse(event.fx_rate);
  return {
    asset_id: event.asset_id,
    event_id: event.id,
    date: event.date,
    unit_value: unitValue,
    currency: event.currency,
    fx_rate: fxRate,
    fx_rate_date: event.fx_rate_date,
    unit_value_eur: FxRate.of(fxRate, event.currency, event.fx_rate_date).toEur(
      Money.of(unitValue, event.currency),
    ),
  };
};

/** The manual price of one asset at one date; nothing when the ledger has none. */
export const manualPriceAt = (
  state: LedgerState,
  assetId: AssetId,
  date: CivilDate,
): ManualPrice | undefined => {
  const event = latestValuations(state, date).get(assetId);
  return event === undefined ? undefined : manualPriceOf(event);
};
