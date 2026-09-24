// `prices/config.json` (decision P1 as corrected by §6.4 (d) of prompt 013):
// the order of the sources, the daily budget of calls of each one and the
// threshold of consecutive failures. None of it is secret and none of it moves
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
import { isQuoteSource, QUOTE_SOURCES } from "./sources.js";

export const PRICE_CONFIG_FILE = "config.json";

export interface PriceConfig {
  /** Which source is asked first, and which next. */
  readonly source_order: readonly QuoteSource[];
  /** Calls a day of each source; `0` switches it off. */
  readonly daily_calls: Readonly<Record<QuoteSource, number>>;
  /** Consecutive failures of a source after which the console says so, with its own exit code. */
  readonly failure_threshold: number;
}

/**
 * The documented defaults: EODHD first, 20 calls a day on its free plan, and
 * Alpha Vantage second, 25 (`questions.md` §1.1 and §1.4, verified on
 * 2026-09-24).
 */
export const DEFAULT_PRICE_CONFIG: PriceConfig = {
  source_order: QUOTE_SOURCES,
  daily_calls: { eodhd: 20, alpha_vantage: 25 },
  failure_threshold: 3,
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

const callsOf = (value: unknown): Record<QuoteSource, number> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw wrong("daily_calls", "daily_calls must be an object");
  }
  const calls = { ...DEFAULT_PRICE_CONFIG.daily_calls };
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

/** Parses the text of `prices/config.json`; `undefined` (no file) is the defaults. */
export const parsePriceConfig = (text: string | undefined): PriceConfig => {
  if (text === undefined) {
    return DEFAULT_PRICE_CONFIG;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw wrong("json", "not valid JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw wrong("json", "must be an object");
  }
  let config: PriceConfig = DEFAULT_PRICE_CONFIG;
  for (const [key, value] of Object.entries(raw)) {
    if (key === "source_order") {
      config = { ...config, source_order: orderOf(value) };
    } else if (key === "daily_calls") {
      config = { ...config, daily_calls: callsOf(value) };
    } else if (key === "failure_threshold") {
      if (!wholeNumber(value, 1)) {
        throw wrong(key, "failure_threshold must be a positive whole number");
      }
      config = { ...config, failure_threshold: value };
    } else {
      throw wrong(key, `unknown key ${key}`);
    }
  }
  return config;
};
