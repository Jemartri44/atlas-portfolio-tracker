// The price of an asset at a date (data-schema.md §7, feature 004; single gate
// since feature 005).
//
// **This module is the only door to a price for a view.** No other projection
// reads `state.valuations` to find out what something is worth: it reads them
// through the manual leaf (`manual-price.ts`), and the automatic daily closes
// of feature 013 (`prices/<asset_id>.jsonl`, outside the ledger) arrive here as
// an `ExternalPrices`, built by `@atlas/domain/quotes`.
//
// The Modelo 720 does **not** come through here: it reads the manual leaf
// alone, and an architecture test keeps every informative return from
// reaching this file (feature 013, §6.5 (a)).
//
// Informative by definition: no tax calculation reads this (constitution II),
// and a missing price is never interpolated or replaced by zero (constitution
// V) — the asset simply has no price.

import { type CivilDate, daysBetween } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import type { Decimal } from "../money/decimal.js";
import { FxRate } from "../money/fx-rate.js";
import type { Currency } from "../money/money.js";
import { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type { AssetId, ValuationEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { latestValuations, manualPriceOf } from "./manual-price.js";
import type { LedgerState, Warning } from "./state.js";

/** Where a price came from. */
export type PriceOrigin = "manual" | "external";

/**
 * The sources of automatic daily closes (ADR-0031; CoinGecko left the feature
 * by decision D-Q5 of the direction). Declared here, with every type of the
 * gate: the modules of `quotes/` import them from this file, never the other
 * way round (§6.4 (b) of prompt 013).
 */
export type QuoteSource = "eodhd" | "alpha_vantage";

/**
 * Why a quote has no value in euros: the ECB rate of its date could not be
 * resolved (ADR-0029's `resolveRate`), or there is no ECB history at all. It is
 * **never** converted with the rate of the day before, nor with the rate of a
 * currency that looks alike — `GBX` is not `GBP` (feature 013, §6.4 (i)).
 */
export type FxMissing =
  | "not_yet_published"
  | "currency_not_published"
  | "currency_stale"
  | "no_history";

/**
 * A quote from outside the ledger, already parsed and in memory: the domain
 * never does I/O, so this is data, not the `PriceSource` port of ADR-0007.
 */
export interface ExternalQuote {
  date: CivilDate;
  unit_value: Decimal;
  currency: Currency;
  source: QuoteSource;
  /** An approximation through the reference ETF (P3), never a close of its own. */
  approximate?: boolean;
  /** ECB rate as published (ADR-0013); `1` for euros. Absent when it could not be resolved. */
  fx_rate?: Decimal;
  /** Date of that rate. Absent means the day of the quote itself. */
  fx_rate_date?: CivilDate;
  /** Why `fx_rate` is absent. */
  fx_missing?: FxMissing;
  /**
   * A more recent quote of the same asset that has **no** value in euros,
   * shown as information next to this one, which has (feature 013, review of
   * PR #78): a figure in euros is never covered by a newer one that cannot be
   * added up.
   */
  newer?: ExternalQuote;
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
  /** The source of an external quote. */
  source?: QuoteSource;
  /** An approximation through the reference ETF (P3): always said as such. */
  approximate?: boolean;
  date: CivilDate;
  unit_value: Decimal;
  currency: Currency;
  /** ECB rate as published (ADR-0013); absent when it could not be resolved. */
  fx_rate?: Decimal;
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
  fx_rate_date?: CivilDate;
  /**
   * `unit_value / fx_rate`, 10 decimals. **Absent** when the rate of the
   * quote's date could not be resolved (`fx_missing` says why): the quote is
   * shown in its own currency and nothing adds it up in euros.
   */
  unit_value_eur?: Money;
  fx_missing?: FxMissing;
  /** A more recent quote without a value in euros, shown next to this price, never instead of it. */
  newer_quote?: ExternalQuote;
  /** Days from the price to the date asked; never negative. */
  age_days: number;
  /** Older than `stale_price_days`; always false when the parameter is not set. */
  stale: boolean;
}

/** Value in euros of a position at its price; nothing without a price or without its value in euros. */
export const positionValueOf = (
  price: PriceLookup | undefined,
  quantity: Quantity,
): Money | undefined =>
  price?.unit_value_eur === undefined
    ? undefined
    : Money.of(price.unit_value_eur.amount.mul(quantity.value), "EUR");

const lookupOf = (
  assetId: AssetId,
  origin: PriceOrigin,
  quote: Omit<ExternalQuote, "source"> & { source?: QuoteSource },
  date: CivilDate,
  staleAfter: number | undefined,
  eventId?: Ulid,
): PriceLookup => {
  const rateDate = quote.fx_rate_date ?? quote.date;
  const ageDays = daysBetween(quote.date, date);
  return {
    asset_id: assetId,
    origin,
    ...(eventId === undefined ? {} : { event_id: eventId }),
    ...(quote.source === undefined ? {} : { source: quote.source }),
    ...(quote.approximate === true ? { approximate: true } : {}),
    ...(quote.newer === undefined ? {} : { newer_quote: quote.newer }),
    date: quote.date,
    unit_value: quote.unit_value,
    currency: quote.currency,
    ...(quote.fx_rate === undefined
      ? { fx_missing: quote.fx_missing ?? "no_history" }
      : {
          fx_rate: quote.fx_rate,
          fx_rate_date: rateDate,
          unit_value_eur: FxRate.of(quote.fx_rate, quote.currency, rateDate).toEur(
            Money.of(quote.unit_value, quote.currency),
          ),
        }),
    age_days: ageDays,
    stale: staleAfter !== undefined && ageDays > staleAfter,
  };
};

/**
 * Says that a quote has no value in euros and why, so that the view that
 * leaves it out of a total in euros never does so in silence (§6.4 (i)).
 */
export const warnWithoutEur = (warnings: Warning[], price: PriceLookup): void => {
  warnings.push({
    code: "price_without_eur_value",
    event_id: "",
    message: `${price.asset_id}: no value in euros`,
    details: {
      asset_id: price.asset_id,
      currency: price.currency,
      date: price.date,
      reason: price.fx_missing,
    },
  });
};

/**
 * The dates on which the ledger knows **any** price at all, sorted and without
 * repeats.
 *
 * It lives here, and not in whoever asks, for the reason this module exists:
 * "on which days does a price exist" is a question about prices, and
 * `state.valuations` is read behind this one door (the architecture test
 * enforces it). **The dates of the automatic quotes are not added here**
 * (feature 013, §6.4 (h)): they reach the views of presentation as data of
 * their own (`quoteDates` of `@atlas/domain/quotes`), never through the state
 * of the ledger, which the fiscal path reads.
 *
 * The time series uses it: between two valuations the ledger knows nothing new,
 * so these are the only dates worth projecting at.
 */
export const priceDates = (state: LedgerState): CivilDate[] =>
  [...new Set(state.valuations.map((event) => event.date))].sort();

/**
 * Which price a view uses (decision P2 of the direction, ADR-0031 second
 * amendment; it replaces decision (j) of prompt 005 for views only): the more
 * recent date, and on the same date the manual one, because the user is the
 * authority — **among the prices that have a value in euros** (review of PR
 * #78). A newer quote without one never covers a figure that can be added up:
 * it is carried as `newer_quote`, to be shown, and the last usable figure is
 * used, with its age. The Modelo 720 is not affected: it reads the manual leaf
 * alone.
 */
const choose = (
  assetId: AssetId,
  manual: ValuationEvent | undefined,
  quote: ExternalQuote | undefined,
  date: CivilDate,
  staleAfter: number | undefined,
): PriceLookup | undefined => {
  const newer = quote !== undefined && (manual === undefined || quote.date > manual.date);
  if (newer && (manual === undefined || quote.fx_rate !== undefined)) {
    return lookupOf(assetId, "external", quote, date, staleAfter);
  }
  return manual === undefined
    ? undefined
    : {
        ...lookupOf(assetId, "manual", manualPriceOf(manual), date, staleAfter, manual.id),
        ...(newer ? { newer_quote: quote } : {}),
      };
};

/** **The gate.** The price of one asset at one date, with its origin (see `choose`). */
export const priceAt = (
  state: LedgerState,
  assetId: AssetId,
  date: CivilDate,
  settings: Settings,
  external?: ExternalPrices,
): PriceLookup | undefined =>
  choose(
    assetId,
    latestValuations(state, date).get(assetId),
    external?.at(assetId, date),
    date,
    settings.stale_price_days,
  );

/**
 * The same gate for the views that walk every asset (weights, costs, net
 * worth…): one pass over the valuations plus, when a source is given, its
 * quotes, chosen by the same rule. An asset with no price at all is simply
 * absent: the absence is the datum.
 */
export const manualPrices = (
  state: LedgerState,
  date: CivilDate,
  settings: Settings,
  external?: ExternalPrices,
): Map<AssetId, PriceLookup> => {
  const prices = new Map<AssetId, PriceLookup>();
  const latest = latestValuations(state, date);
  for (const assetId of external === undefined ? latest.keys() : state.assets.keys()) {
    const price = choose(
      assetId,
      latest.get(assetId),
      external?.at(assetId, date),
      date,
      settings.stale_price_days,
    );
    if (price !== undefined) {
      prices.set(assetId, price);
    }
  }
  return prices;
};
