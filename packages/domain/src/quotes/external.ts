// The automatic closes as the `ExternalPrices` the gate takes (feature 013):
// the close in force on or before the date, converted when the gate reads it
// with the ECB rate **of the quote's date** — or not converted at all.
//
// Only `euro` and `resolved` convert (decision §6.1 (f) of prompt 013).
// `not_yet_published`, `currency_not_published` and `currency_stale` do not:
// the quote is never converted with the rate of the day before (the option C
// that ADR-0029 rules out, just as invented here) nor with the rate of a
// currency that looks alike (`GBX` is not `GBP`). The quote then reaches the
// view in its own currency, and the view says the value in euros is missing.
//
// And the approximation through the reference ETF (decision P3): for an asset
// with a `reference_etf_id`, **the last real net asset value known ×
// (close of the ETF on the day / close of the ETF on the day of that value)**.
// A real value is a registered `valuation` of the asset or a close of its own
// (an `EUFUND` close, for a fund) — never another approximation, and never the
// `unit_price` of an operation (questions.md §2.1, accepted). Without a close
// of the ETF **exactly** on the day of the anchor there is no approximation,
// and the nearest one is not looked for. It reaches the views and the weights,
// always marked; never anything fiscal.

import type { CivilDate } from "../dates/civil-date.js";
import type { EcbHistory } from "../ecb/history.js";
import { resolveRate } from "../ecb/resolve.js";
import { Decimal } from "../money/decimal.js";
import { manualPriceAt } from "../projections/manual-price.js";
import type { ExternalPrices, ExternalQuote, QuoteSource } from "../projections/prices.js";
import type { LedgerState } from "../projections/state.js";
import type { AssetId } from "../schema/events.js";
import { closeOn, closeOnOrBefore, type EffectiveClose } from "./line.js";

/** Why an asset with a reference ETF has no approximation on a date. */
export type ApproximationGap =
  | "no_reference_etf"
  | "no_anchor"
  | "no_newer_etf_close"
  | "no_etf_close_at_anchor"
  | "etf_currency_changed";

export interface Approximation {
  readonly date: CivilDate;
  readonly value: Decimal;
  readonly currency: string;
  /** The real value it is anchored on, and its date. */
  readonly anchor: {
    readonly date: CivilDate;
    readonly value: Decimal;
    readonly kind: "valuation" | "close";
  };
  readonly etf_id: AssetId;
  /** The source of the ETF close it moved with. */
  readonly source: QuoteSource;
}

/** The approximation of `assetId` on `date` (P3), or why there is none. */
export const approximationAt = (
  state: LedgerState,
  closes: ReadonlyMap<AssetId, readonly EffectiveClose[]>,
  assetId: AssetId,
  date: CivilDate,
): Approximation | ApproximationGap => {
  const etfId = state.assets.get(assetId)?.reference_etf_id;
  if (etfId === undefined) {
    return "no_reference_etf";
  }
  const manual = manualPriceAt(state, assetId, date);
  const own = closeOnOrBefore(closes.get(assetId) ?? [], date);
  // The more recent real value; on the same date the manual one, as in the gate.
  const anchor =
    own !== undefined && (manual === undefined || own.date > manual.date)
      ? {
          date: own.date,
          value: Decimal.parse(own.close),
          currency: own.currency,
          kind: "close" as const,
        }
      : manual === undefined
        ? undefined
        : {
            date: manual.date,
            value: manual.unit_value,
            currency: manual.currency,
            kind: "valuation" as const,
          };
  if (anchor === undefined) {
    return "no_anchor";
  }
  const etf = closes.get(etfId) ?? [];
  const now = closeOnOrBefore(etf, date);
  if (now === undefined || now.date <= anchor.date) {
    return "no_newer_etf_close";
  }
  const then = closeOn(etf, anchor.date);
  if (then === undefined) {
    return "no_etf_close_at_anchor";
  }
  if (then.currency !== now.currency) {
    return "etf_currency_changed";
  }
  return {
    date: now.date,
    value: anchor.value.mul(Decimal.parse(now.close)).div(Decimal.parse(then.close)),
    currency: anchor.currency,
    anchor: { date: anchor.date, value: anchor.value, kind: anchor.kind },
    etf_id: etfId,
    source: now.source,
  };
};

/** What the automatic closes need to become quotes. */
export interface QuoteBook {
  readonly closes: ReadonlyMap<AssetId, readonly EffectiveClose[]>;
  /** The ECB history; without it nothing but euros converts. */
  readonly history?: EcbHistory;
  /** `ecb_stale_currency_days` of `atlas.config.json`. */
  readonly staleDays: number;
}

const converted = (
  book: QuoteBook,
  quote: Omit<ExternalQuote, "fx_rate" | "fx_rate_date" | "fx_missing">,
): ExternalQuote => {
  if (quote.currency !== "EUR" && book.history === undefined) {
    return { ...quote, fx_missing: "no_history" };
  }
  const rate =
    quote.currency === "EUR"
      ? ({ kind: "euro", rate: "1", date: quote.date } as const)
      : resolveRate(book.history as EcbHistory, quote.currency, quote.date, book.staleDays);
  if (rate.kind === "euro" || rate.kind === "resolved") {
    return {
      ...quote,
      fx_rate: Decimal.parse(rate.rate),
      ...(rate.kind === "euro" ? {} : { fx_rate_date: rate.date }),
    };
  }
  return { ...quote, fx_missing: rate.kind };
};

/**
 * The quotes of the automatic closes for the gate: for each asset and date,
 * its own close in force on or before the date, or its approximation — never
 * both, never an average. An approximation, when there is one, is always the
 * more recent: it is dated on an ETF close **after** its anchor, and the anchor
 * is already the more recent of the own close and the valuation.
 */
export const externalPricesOf = (state: LedgerState, book: QuoteBook): ExternalPrices => ({
  at: (assetId, date) => {
    const approximation = approximationAt(state, book.closes, assetId, date);
    if (typeof approximation !== "string") {
      return converted(book, {
        date: approximation.date,
        unit_value: approximation.value,
        currency: approximation.currency,
        source: approximation.source,
        approximate: true,
      });
    }
    const own = closeOnOrBefore(book.closes.get(assetId) ?? [], date);
    return own === undefined
      ? undefined
      : converted(book, {
          date: own.date,
          unit_value: Decimal.parse(own.close),
          currency: own.currency,
          source: own.source,
        });
  },
});

/** Every date with an automatic close, for the time series of the views (§6.4 (h)). */
export const quoteDates = (closes: ReadonlyMap<AssetId, readonly EffectiveClose[]>): CivilDate[] =>
  [...new Set([...closes.values()].flatMap((list) => list.map((close) => close.date)))].sort();
