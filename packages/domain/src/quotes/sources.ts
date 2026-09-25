import type { QuoteSource } from "../projections/prices.js";

/** Every source of daily closes, in the default order (ADR-0031: EODHD, then Alpha Vantage). */
export const QUOTE_SOURCES: readonly QuoteSource[] = ["eodhd", "alpha_vantage"];

export const isQuoteSource = (value: unknown): value is QuoteSource =>
  typeof value === "string" && (QUOTE_SOURCES as readonly string[]).includes(value);
