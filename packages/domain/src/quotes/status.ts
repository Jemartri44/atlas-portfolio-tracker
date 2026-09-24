// `prices/_status.json` (ADR-0031, «Política de fallo» and «Presupuesto»;
// decision §6.3 (d) of prompt 013): per source, its consecutive failures, its
// last success, the kind of its last failure and **the calls it spent** — which
// is also what is reserved **under the lock of the folder before calling**, so
// that two consoles at once never spend more than the configured budget.
//
// Never an address, never a message of the source: only kinds (§6.4 (e)).

import { addDays, type CivilDate, isWeekend } from "../dates/civil-date.js";
import { ValidationError } from "../errors.js";
import type { SourceFailureKind } from "../ports/price-source.js";
import type { QuoteSource } from "../projections/prices.js";
import type { AssetId } from "../schema/events.js";
import { isQuoteSource } from "./sources.js";

export const STATUS_FORMAT = 1;

/**
 * Why an asset could not be downloaded: one of the six failures of a source,
 * or `currency_mismatch` — the currency the source gave (or its metadata)
 * disagrees with the declared one. It is not a failure of the source and it
 * does not count as a consecutive one (questions.md §2.3, accepted).
 */
export type QuoteFailureKind = SourceFailureKind | "currency_mismatch";

export interface SourceStatus {
  readonly consecutive_failures: number;
  readonly last_success?: string;
  readonly last_failure?: { readonly kind: SourceFailureKind; readonly at: string };
  /** When each call of the recent window was made (or reserved), ISO 8601 UTC. */
  readonly calls_at: readonly string[];
}

export interface AssetFailure {
  readonly kind: QuoteFailureKind;
  readonly source: QuoteSource;
  readonly at: string;
  readonly declared?: string;
  readonly found?: string;
}

export interface PriceStatus {
  readonly status_format: number;
  readonly sources: Readonly<Partial<Record<QuoteSource, SourceStatus>>>;
  readonly assets: Readonly<Record<AssetId, { readonly last_failure: AssetFailure }>>;
}

export const EMPTY_STATUS: PriceStatus = { status_format: STATUS_FORMAT, sources: {}, assets: {} };

const EMPTY_SOURCE: SourceStatus = { consecutive_failures: 0, calls_at: [] };

const wrong = (field: string): ValidationError =>
  new ValidationError("invalid_price_status", `prices/_status.json: ${field} is not valid`, {
    field,
  });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Parses `prices/_status.json`; `undefined` (no file) is an empty status. A
 * status that does not read is an error, never an empty one: an empty one
 * would give back the calls already spent today.
 */
export const parseStatus = (text: string | undefined): PriceStatus => {
  if (text === undefined) {
    return EMPTY_STATUS;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw wrong("json");
  }
  if (!isObject(raw) || raw.status_format !== STATUS_FORMAT) {
    throw wrong("status_format");
  }
  if (!isObject(raw.sources) || !isObject(raw.assets)) {
    throw wrong("sources");
  }
  for (const [source, value] of Object.entries(raw.sources)) {
    if (
      !isQuoteSource(source) ||
      !isObject(value) ||
      typeof value.consecutive_failures !== "number" ||
      !Array.isArray(value.calls_at) ||
      !value.calls_at.every((stamp) => typeof stamp === "string")
    ) {
      throw wrong(`sources.${source}`);
    }
  }
  return raw as unknown as PriceStatus;
};

export const serializeStatus = (status: PriceStatus): string =>
  `${JSON.stringify(status, null, 2)}\n`;

/**
 * How each source counts its day (questions.md §1.1 and §1.4, decision D-Q3):
 * EODHD resets at midnight GMT, which it documents; Alpha Vantage documents
 * no reset at all, so a rolling window of 24 hours is used, which never goes
 * over the quota whatever the hour of its reset. Facts of the providers, not
 * configuration.
 */
export const BUDGET_WINDOW: Readonly<Record<QuoteSource, "gmt_day" | "rolling_24h">> = {
  eodhd: "gmt_day",
  alpha_vantage: "rolling_24h",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The calls of `source` that count against today's budget at `now`. */
export const spentAt = (status: PriceStatus, source: QuoteSource, now: Date): number => {
  const calls = status.sources[source]?.calls_at ?? [];
  if (BUDGET_WINDOW[source] === "gmt_day") {
    const day = now.toISOString().slice(0, 10);
    return calls.filter((stamp) => stamp.slice(0, 10) === day).length;
  }
  return calls.filter((stamp) => now.getTime() - Date.parse(stamp) < DAY_MS).length;
};

const sourceOf = (status: PriceStatus, source: QuoteSource): SourceStatus =>
  status.sources[source] ?? EMPTY_SOURCE;

const withSource = (status: PriceStatus, source: QuoteSource, next: SourceStatus): PriceStatus => ({
  ...status,
  sources: { ...status.sources, [source]: next },
});

/**
 * Reserves one call of `source` at `now`, if the budget still has room.
 * Called **under the lock**, with the status read under it; the call itself is
 * made after the lock is released. Calls older than two days are dropped: no
 * window looks that far back.
 */
export const reserveCall = (
  status: PriceStatus,
  source: QuoteSource,
  limit: number,
  now: Date,
): PriceStatus | undefined => {
  if (spentAt(status, source, now) >= limit) {
    return undefined;
  }
  const current = sourceOf(status, source);
  const recent = current.calls_at.filter((stamp) => now.getTime() - Date.parse(stamp) < 2 * DAY_MS);
  return withSource(status, source, { ...current, calls_at: [...recent, now.toISOString()] });
};

/**
 * Whether a failure says something about the **source** (it is down, it
 * refuses the key, it limits us, it answers nonsense) or only about one
 * symbol or about our own budget. Only the first kind counts as a consecutive
 * failure, which is what warns that a source changed its conditions.
 */
export const countsAsSourceFailure = (kind: SourceFailureKind): boolean =>
  kind !== "not_found" && kind !== "budget_exhausted";

/** What happened with one call, in the order it happened. */
export type CallOutcome =
  | { readonly source: QuoteSource; readonly at: string; readonly ok: true }
  | {
      readonly source: QuoteSource;
      readonly at: string;
      readonly ok: false;
      readonly kind: SourceFailureKind;
    };

/**
 * Applies the outcomes of a run to the status **read again under the lock**,
 * so that another console that wrote in between is not overwritten: a success
 * puts the consecutive failures back to zero; a failure of the source adds one.
 */
export const applyOutcomes = (
  status: PriceStatus,
  outcomes: readonly CallOutcome[],
): PriceStatus => {
  let next = status;
  for (const outcome of outcomes) {
    const current = sourceOf(next, outcome.source);
    if (outcome.ok) {
      next = withSource(next, outcome.source, {
        ...current,
        consecutive_failures: 0,
        last_success: outcome.at,
      });
    } else {
      next = withSource(next, outcome.source, {
        ...current,
        consecutive_failures:
          current.consecutive_failures + (countsAsSourceFailure(outcome.kind) ? 1 : 0),
        last_failure: { kind: outcome.kind, at: outcome.at },
      });
    }
  }
  return next;
};

/** Records (or, with `undefined`, clears) the last failure of each asset. */
export const withAssetFailures = (
  status: PriceStatus,
  failures: ReadonlyMap<AssetId, AssetFailure | undefined>,
): PriceStatus => {
  const assets: Record<AssetId, { last_failure: AssetFailure }> = { ...status.assets };
  for (const [assetId, failure] of failures) {
    if (failure === undefined) {
      delete assets[assetId];
    } else {
      assets[assetId] = { last_failure: failure };
    }
  }
  return { ...status, assets };
};

/** The sources over the threshold of consecutive failures. */
export const failingSources = (status: PriceStatus, threshold: number): QuoteSource[] =>
  (Object.keys(status.sources) as QuoteSource[]).filter(
    (source) => sourceOf(status, source).consecutive_failures >= threshold,
  );

/**
 * The last Monday-to-Friday day **before** `today`: a close up to it means
 * the asset is up to date and costs no call. Holidays are not known here, so
 * a holiday costs one call that returns nothing.
 */
export const lastMarketDayBefore = (today: CivilDate): CivilDate => {
  let day = addDays(today, -1);
  while (isWeekend(day)) {
    day = addDays(day, -1);
  }
  return day;
};
