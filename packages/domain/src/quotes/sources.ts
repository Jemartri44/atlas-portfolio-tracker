import type { QuoteSource } from "../projections/prices.js";

/** Every source of daily closes (ADR-0031: EODHD alone). */
export const QUOTE_SOURCES: readonly QuoteSource[] = ["eodhd"];

export const isQuoteSource = (value: unknown): value is QuoteSource =>
  typeof value === "string" && (QUOTE_SOURCES as readonly string[]).includes(value);
