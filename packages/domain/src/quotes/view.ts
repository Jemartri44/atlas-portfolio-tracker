// What the interfaces show of the automatic prices, decided here and not in
// them (ADR-0024: the interfaces choose words and place, never **whether**
// something is said).

import { type CivilDate, daysBetween } from "../dates/civil-date.js";
import type { PriceLookup, QuoteSource } from "../projections/prices.js";
import type { Warning } from "../projections/state.js";
import type { AssetId } from "../schema/events.js";
import type { PriceConfig } from "./config.js";
import type { EffectiveClose } from "./line.js";
import { QUOTE_SOURCES } from "./sources.js";
import { type AssetFailure, type PriceStatus, type SourceStatus, spentAt } from "./status.js";

export interface SourceStatusView {
  readonly source: QuoteSource;
  readonly spent_today: number;
  readonly daily_calls: number;
  readonly remaining: number;
  readonly consecutive_failures: number;
  readonly failing: boolean;
  readonly last_success?: string;
  readonly last_failure?: SourceStatus["last_failure"];
}

export interface AssetStatusView {
  readonly asset_id: AssetId;
  readonly last_date?: CivilDate;
  readonly source?: QuoteSource;
  readonly age_days?: number;
  readonly last_failure?: AssetFailure;
}

/** `atlas prices status`: each source, and the age of the last close of each asset. */
export const priceStatusView = (
  status: PriceStatus,
  config: PriceConfig,
  closes: ReadonlyMap<AssetId, readonly EffectiveClose[]>,
  assets: readonly AssetId[],
  today: CivilDate,
  now: Date,
): { sources: SourceStatusView[]; assets: AssetStatusView[] } => ({
  sources: QUOTE_SOURCES.map((source) => {
    const current = status.sources[source];
    const spent = spentAt(status, source, now);
    const consecutive = current?.consecutive_failures ?? 0;
    return {
      source,
      spent_today: spent,
      daily_calls: config.daily_calls[source],
      remaining: Math.max(0, config.daily_calls[source] - spent),
      consecutive_failures: consecutive,
      failing: consecutive >= config.failure_threshold,
      ...(current?.last_success === undefined ? {} : { last_success: current.last_success }),
      ...(current?.last_failure === undefined ? {} : { last_failure: current.last_failure }),
    };
  }),
  assets: assets.map((assetId) => {
    const last = closes.get(assetId)?.at(-1);
    const failure = status.assets[assetId]?.last_failure;
    return {
      asset_id: assetId,
      ...(last === undefined
        ? {}
        : { last_date: last.date, source: last.source, age_days: daysBetween(last.date, today) }),
      ...(failure === undefined ? {} : { last_failure: failure }),
    };
  }),
});

/**
 * The warning a view of weights or of the contribution carries when any
 * weight it uses rests on an approximation through the reference ETF (P3):
 * a split of the contribution that depends on an estimate has to say so
 * (constitution V). `undefined` when none does.
 */
export const approximationWarning = (
  prices: Iterable<PriceLookup | undefined>,
): Warning | undefined => {
  const assets = [...prices]
    .filter((price): price is PriceLookup => price?.approximate === true)
    .map((price) => price.asset_id);
  return assets.length === 0
    ? undefined
    : {
        code: "weights_use_approximation",
        event_id: "",
        message: `the weights of ${assets.join(", ")} rest on an approximation through the reference ETF`,
        details: { assets },
      };
};
