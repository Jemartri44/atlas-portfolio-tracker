// The price of an asset at a date (data-schema.md §7, feature 004; single gate
// since feature 005).
//
// **This module is the only door to a price.** No other projection reads
// `state.valuations` to find out what something is worth: when phase 4 brings
// automatic prices (`PriceSource`, `prices/<asset_id>.jsonl` outside the
// ledger), this is the one file that changes, instead of six projections with
// 100 % coverage each (prompt §3.0 ter).
//
// Informative by definition: no tax calculation reads this (constitution II),
// and a missing price is never interpolated or replaced by zero (constitution
// V) — the asset simply has no price.

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

/** Where a price came from. The manual one always wins (decision (j) of prompt 005). */
export type PriceOrigin = "manual" | "external";

/**
 * A quote from outside the ledger, already parsed and in memory. Phase 4 will
 * fill it from an adapter; the domain never does I/O, so this is data, not the
 * `PriceSource` port of ADR-0007.
 */
export interface ExternalQuote {
  date: CivilDate;
  unit_value: Decimal;
  currency: Currency;
  /** ECB rate as published (ADR-0013); `1` for euros. */
  fx_rate: Decimal;
  /** Date of that rate. Absent means the day of the quote itself. */
  fx_rate_date?: CivilDate;
}

/** The optional external source of the gate. Pure and synchronous, by the same rule. */
export interface ExternalPrices {
  at(assetId: AssetId, date: CivilDate): ExternalQuote | undefined;
}

export interface PriceLookup {
  asset_id: AssetId;
  origin: PriceOrigin;
  /** The `valuation` it comes from; absent for an external quote. */
  event_id?: Ulid;
  date: CivilDate;
  unit_value: Decimal;
  currency: Currency;
  /** ECB rate as published (ADR-0013). */
  fx_rate: Decimal;
  /**
   * The day of that rate, which is **not** the day of the price: a valuation
   * carries its own `fx_rate_date`, and they differ whenever the market and
   * the ECB disagree about what day it is — a 31 December that falls on a
   * Sunday being the ordinary case.
   *
   * It used to be dropped here, and the price was dated with the day of the
   * valuation for both. Nothing noticed until the Modelo 720 had to say
   * whether the rate applied is the one the law asks for (feature 010, block
   * 3), which is a question about **this** date and not about the other.
   */
  fx_rate_date: CivilDate;
  /** `unit_value / fx_rate`, 10 decimals. */
  unit_value_eur: Money;
  /** Days from the price to the date asked; never negative. */
  age_days: number;
  /** Older than `stale_price_days`; always false when the parameter is not set. */
  stale: boolean;
}

/** Value in euros of a position at its price; nothing without a price. */
export const positionValueOf = (
  price: PriceLookup | undefined,
  quantity: Quantity,
): Money | undefined =>
  price === undefined
    ? undefined
    : Money.of(price.unit_value_eur.amount.mul(quantity.value), "EUR");

const lookupOf = (
  assetId: AssetId,
  origin: PriceOrigin,
  quote: {
    date: CivilDate;
    unit_value: Decimal;
    currency: Currency;
    fx_rate: Decimal;
    fx_rate_date?: CivilDate;
  },
  date: CivilDate,
  staleAfter: number | undefined,
  eventId?: Ulid,
): PriceLookup => {
  const rateDate = quote.fx_rate_date ?? quote.date;
  const fx = FxRate.of(quote.fx_rate, quote.currency, rateDate);
  const ageDays = daysBetween(quote.date, date);
  return {
    asset_id: assetId,
    origin,
    ...(eventId === undefined ? {} : { event_id: eventId }),
    date: quote.date,
    unit_value: quote.unit_value,
    currency: quote.currency,
    fx_rate: quote.fx_rate,
    fx_rate_date: rateDate,
    unit_value_eur: fx.toEur(Money.of(quote.unit_value, quote.currency)),
    age_days: ageDays,
    stale: staleAfter !== undefined && ageDays > staleAfter,
  };
};

const fromValuation = (
  event: ValuationEvent,
): {
  date: CivilDate;
  unit_value: Decimal;
  currency: Currency;
  fx_rate: Decimal;
  fx_rate_date: CivilDate;
} => ({
  date: event.date,
  unit_value: Decimal.parse(event.unit_value),
  currency: event.currency,
  fx_rate: Decimal.parse(event.fx_rate),
  fx_rate_date: event.fx_rate_date,
});

/**
 * The dates on which the ledger knows **any** price at all, sorted and without
 * repeats.
 *
 * It lives here, and not in whoever asks, for the reason this module exists:
 * "on which days does a price exist" is a question about prices, and
 * `state.valuations` is read behind this one door (the architecture test
 * enforces it). When phase 4 adds automatic quotes, the dates of the external
 * source are added **here** and every caller gains them for free.
 *
 * The time series uses it: between two valuations the ledger knows nothing new,
 * so these are the only dates worth projecting at.
 */
export const priceDates = (state: LedgerState): CivilDate[] =>
  [...new Set(state.valuations.map((event) => event.date))].sort();

/**
 * Last manual price per asset on or before `date`. `state.valuations` is
 * already in (date, file position) order, so the last one seen wins and a tie
 * is broken by file position (decision (b) of prompt 004).
 */
const latestValuations = (state: LedgerState, date: CivilDate): Map<AssetId, ValuationEvent> => {
  const latest = new Map<AssetId, ValuationEvent>();
  for (const event of state.valuations) {
    if (event.date <= date) {
      latest.set(event.asset_id, event);
    }
  }
  return latest;
};

/**
 * **The gate.** The price of one asset at one date, with its origin.
 *
 * Precedence, and it is not negotiable: the **manual** price (`valuation`)
 * always beats the automatic one. The manual price is a decision of the user
 * and the automatic one a convenience (constitution I, decision (j) of prompt
 * 005). `external` is the door phase 4 will use; today nobody passes it.
 */
export const priceAt = (
  state: LedgerState,
  assetId: AssetId,
  date: CivilDate,
  settings: Settings,
  external?: ExternalPrices,
): PriceLookup | undefined => {
  const manual = latestValuations(state, date).get(assetId);
  if (manual !== undefined) {
    return lookupOf(
      assetId,
      "manual",
      fromValuation(manual),
      date,
      settings.stale_price_days,
      manual.id,
    );
  }
  const quote = external?.at(assetId, date);
  return quote === undefined
    ? undefined
    : lookupOf(assetId, "external", quote, date, settings.stale_price_days);
};

/**
 * The same gate for the views that walk every asset (weights, costs, net
 * worth…): one pass over the valuations plus, when a source is given, whatever
 * it knows about the assets that have no manual price. An asset with no price
 * at all is simply absent: the absence is the datum.
 */
export const manualPrices = (
  state: LedgerState,
  date: CivilDate,
  settings: Settings,
  external?: ExternalPrices,
): Map<AssetId, PriceLookup> => {
  const prices = new Map<AssetId, PriceLookup>();
  for (const [assetId, event] of latestValuations(state, date)) {
    prices.set(
      assetId,
      lookupOf(assetId, "manual", fromValuation(event), date, settings.stale_price_days, event.id),
    );
  }
  if (external === undefined) {
    return prices;
  }
  for (const assetId of state.assets.keys()) {
    if (!prices.has(assetId)) {
      const quote = external.at(assetId, date);
      if (quote !== undefined) {
        prices.set(assetId, lookupOf(assetId, "external", quote, date, settings.stale_price_days));
      }
    }
  }
  return prices;
};
