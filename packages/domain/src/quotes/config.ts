// `prices/config.json` (decision P1 as corrected by §6.4 (d) of prompt 013):
// the order of the sources, the daily budget of calls of each one, the
// threshold of consecutive failures and, by asset type, the days its market
// trades and the recent days asked again (live test of 2026-09-27). None of it is secret and none of it moves
// a figure of the ledger, so it lives **outside** the ledger and outside
// `atlas.config.json`, in a file of its own next to `prices/`. The web never
// reads it: it does not download, and the console resolves the order when it
// writes (D-Q10).
//
// Written by the user, never by the application. A missing file is the
// defaults; a file that does not read, or that says something this code does
// not understand, is an error, never a silent default (constitution V).

import { ValidationError } from "../errors.js";
import type { QuoteSource } from "../projections/prices.js";
import { ASSET_TYPES, type AssetType } from "../schema/events.js";
import { repeatedKey } from "../schema/json-keys.js";
import { repeatedKeyError } from "./repeated-key.js";
import { isQuoteSource, QUOTE_SOURCES } from "./sources.js";

export const PRICE_CONFIG_FILE = "config.json";

export interface PriceConfig {
  /** Which source is asked first, and which next. */
  readonly source_order: readonly QuoteSource[];
  /** Calls a day of each source; `0` switches it off. */
  readonly daily_calls: Readonly<Record<QuoteSource, number>>;
  /** Consecutive failures of a source after which the console says so, with its own exit code. */
  readonly failure_threshold: number;
  /** The days the market of each asset type trades: a close up to the last of them is up to date. */
  readonly market_days: Readonly<Record<AssetType, MarketDays>>;
  /**
   * By asset type, the N calendar days ending on the last close stored that
   * are asked again at each download (not the last N closes stored: a weekend
   * or a gap counts as days): a source may give a provisional close and
   * correct it later. It costs no call: the same call starts earlier. At most
   * `MAX_REFETCH_RECENT_DAYS`.
   */
  readonly refetch_recent_days: Readonly<Record<AssetType, number>>;
}

export const MARKET_DAYS = ["mon_fri", "every_day"] as const;
export type MarketDays = (typeof MARKET_DAYS)[number];

/**
 * The documented defaults: EODHD first, 20 calls a day on its free plan, and
 * Alpha Vantage second, 25 (`questions.md` §1.1 and §1.4, verified on
 * 2026-09-24). Crypto trades every day, and its last two closes are asked
 * again, because EODHD gave the close of a Saturday equal to Friday's (live
 * test of 2026-09-27); every other type, Monday to Friday and none.
 */
export const DEFAULT_PRICE_CONFIG: PriceConfig = {
  source_order: QUOTE_SOURCES,
  daily_calls: { eodhd: 20, alpha_vantage: 25 },
  failure_threshold: 3,
  market_days: {
    fund: "mon_fri",
    etf: "mon_fri",
    etc: "mon_fri",
    etp: "mon_fri",
    stock: "mon_fri",
    crypto: "every_day",
    money_market: "mon_fri",
  },
  refetch_recent_days: {
    fund: 0,
    etf: 0,
    etc: 0,
    etp: 0,
    stock: 0,
    crypto: 2,
    money_market: 0,
  },
};

const wrong = (field: string, message: string): ValidationError =>
  new ValidationError("invalid_price_config", `prices/config.json: ${message}`, { field });

const wholeNumber = (value: unknown, least: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= least;

const orderOf = (value: unknown): QuoteSource[] => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(isQuoteSource) ||
    new Set(value).size !== value.length
  ) {
    throw wrong("source_order", "source_order must list known sources, each once");
  }
  return value;
};

const callsOf = (
  value: unknown,
  base: Readonly<Record<QuoteSource, number>>,
): Record<QuoteSource, number> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw wrong("daily_calls", "daily_calls must be an object");
  }
  const calls = { ...base };
  for (const [source, count] of Object.entries(value)) {
    if (!isQuoteSource(source)) {
      throw wrong(`daily_calls.${source}`, `unknown source ${source}`);
    }
    if (!wholeNumber(count, 0)) {
      throw wrong(`daily_calls.${source}`, `daily_calls.${source} must be a whole number`);
    }
    calls[source] = count;
  }
  return calls;
};

const isAssetType = (value: string): value is AssetType =>
  (ASSET_TYPES as readonly string[]).includes(value);

/** An object by asset type, over the defaults, each value checked by `valid`. */
const byTypeOf = <T>(
  key: "market_days" | "refetch_recent_days",
  value: unknown,
  valid: (item: unknown) => item is T,
  expected: string,
): Record<AssetType, T> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw wrong(key, `${key} must be an object by asset type`);
  }
  const result = { ...(DEFAULT_PRICE_CONFIG[key] as Record<AssetType, T>) };
  for (const [type, item] of Object.entries(value)) {
    if (!isAssetType(type)) {
      throw wrong(`${key}.${type}`, `unknown asset type ${type}`);
    }
    if (!valid(item)) {
      throw wrong(`${key}.${type}`, `${key}.${type} must be ${expected}`);
    }
    result[type] = item;
  }
  return result;
};

const isMarketDays = (value: unknown): value is MarketDays =>
  (MARKET_DAYS as readonly unknown[]).includes(value);

/** At most a month (round 1 of PR #102): a huge count broke the dates in the middle of a run. */
export const MAX_REFETCH_RECENT_DAYS = 31;

const isDayCount = (value: unknown): value is number =>
  wholeNumber(value, 0) && value <= MAX_REFETCH_RECENT_DAYS;

/**
 * The calls a day a console **shares with the cloud** by default (N2 of §15 of
 * feature 016): the leftover of the free plans (20 and 25) after the 18 and
 * 23 of the cloud. A console of a synced folder spends these unless its
 * `config.json` says otherwise; two stores that never see each other can
 * only keep inside the plan by splitting it.
 */
export const SHARED_WITH_CLOUD_DAILY_CALLS: Readonly<Record<QuoteSource, number>> = {
  eodhd: 2,
  alpha_vantage: 2,
};

/** Parses the text of `prices/config.json`; `undefined` (no file) is the defaults. */
export const parsePriceConfig = (
  text: string | undefined,
  options: { readonly sharedWithCloud?: boolean } = {},
): PriceConfig => {
  const base =
    options.sharedWithCloud === true
      ? { ...DEFAULT_PRICE_CONFIG, daily_calls: SHARED_WITH_CLOUD_DAILY_CALLS }
      : DEFAULT_PRICE_CONFIG;
  if (text === undefined) {
    return base;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw wrong("json", "not valid JSON");
  }
  const repeated = repeatedKey(text);
  if (repeated !== undefined) {
    throw repeatedKeyError("prices/config.json", repeated);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw wrong("json", "must be an object");
  }
  let config: PriceConfig = base;
  for (const [key, value] of Object.entries(raw)) {
    if (key === "source_order") {
      config = { ...config, source_order: orderOf(value) };
    } else if (key === "daily_calls") {
      config = { ...config, daily_calls: callsOf(value, base.daily_calls) };
    } else if (key === "failure_threshold") {
      if (!wholeNumber(value, 1)) {
        throw wrong(key, "failure_threshold must be a positive whole number");
      }
      config = { ...config, failure_threshold: value };
    } else if (key === "market_days") {
      config = {
        ...config,
        market_days: byTypeOf(key, value, isMarketDays, MARKET_DAYS.join(" or ")),
      };
    } else if (key === "refetch_recent_days") {
      config = {
        ...config,
        refetch_recent_days: byTypeOf(
          key,
          value,
          isDayCount,
          `a whole number from 0 to ${MAX_REFETCH_RECENT_DAYS}`,
        ),
      };
    } else {
      throw wrong(key, `unknown key ${key}`);
    }
  }
  return config;
};
