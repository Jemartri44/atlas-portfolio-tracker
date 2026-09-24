// The price of a row as the screens show it (feature 013): the figure in its
// currency, its date and age, **where it came from** — manual, or the source
// of an automatic close —, whether it is an approximation through the
// reference ETF, and why a quote has no value in euros when it has none. The
// domain decides every one of these; the screens only choose the words.

import { Money, type PriceLookup } from "@atlas/domain";
import { fxMissingText } from "../format/messages/warnings.js";

export interface PriceFields {
  unitValue?: Money;
  priceDate?: string;
  ageDays?: number;
  stale: boolean;
  /** «manual», «EODHD», «Alpha Vantage». */
  priceOrigin?: string;
  /** An approximation through the reference ETF (P3): always marked. */
  approximate?: boolean;
  /** Why the quote has no value in euros, in words; absent when it has one. */
  eurMissing?: string;
}

const SOURCES: Record<string, string> = { eodhd: "EODHD", alpha_vantage: "Alpha Vantage" };

export const priceFieldsOf = (price: PriceLookup | undefined): PriceFields =>
  price === undefined
    ? { stale: false }
    : {
        unitValue: Money.of(price.unit_value, price.currency),
        priceDate: price.date,
        ageDays: price.age_days,
        stale: price.stale,
        priceOrigin:
          price.origin === "manual" ? "manual" : (SOURCES[price.source ?? ""] ?? "automático"),
        ...(price.approximate === true ? { approximate: true } : {}),
        ...(price.fx_missing === undefined ? {} : { eurMissing: fxMissingText(price.fx_missing) }),
      };
