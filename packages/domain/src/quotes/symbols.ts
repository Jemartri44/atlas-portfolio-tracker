// `prices/symbols.json` (ADR-0031, amendment; decisions D-Q2 and D-Q6 of the
// direction): which symbol each asset has in each source, and **the currency
// of its quote, declared** — never assumed. Outside the ledger: it is
// configuration of the download of prices, which are informative, and a full
// snapshot `asset_updated` written by an old client would erase it (ADR-0018,
// amended).
//
// The user declares it; the application **confirms** it with the source's own
// metadata when it is declared (D-Q6: no proposal from a translation of
// exchange codes nobody documents). If the metadata contradict the declared
// currency — the case of London, pence against pounds — the disagreement is
// shown and the user confirms the declared one **once and explicitly**; what
// was confirmed is kept (`currency_confirmed_over`). A source whose metadata
// contradict the declaration without that confirmation is not downloaded
// (`currency_mismatch`).

import { ValidationError } from "../errors.js";
import type { QuoteSource } from "../projections/prices.js";
import type { AssetId } from "../schema/events.js";
import { isQuoteSource, QUOTE_SOURCES } from "./sources.js";

export const SYMBOLS_FORMAT = 1;

export interface CurrencyCheck {
  /** What the source's metadata said; absent when they do not say. */
  readonly found?: string;
  /** ISO 8601 UTC. */
  readonly at: string;
}

export interface SymbolEntry {
  /** The currency of the quote (it may be a subunit such as GBX), declared by the user. */
  readonly currency: string;
  readonly eodhd?: string;
  readonly alpha_vantage?: string;
  /** ISO 8601 UTC of the declaration. */
  readonly confirmed_at: string;
  readonly currency_check?: Partial<Record<QuoteSource, CurrencyCheck>>;
  /** The currency of the source the user accepted to contradict, explicitly (D-Q2). */
  readonly currency_confirmed_over?: Partial<Record<QuoteSource, string>>;
}

export interface SymbolsFile {
  readonly symbols_format: number;
  readonly assets: Readonly<Record<AssetId, SymbolEntry>>;
}

export const EMPTY_SYMBOLS: SymbolsFile = { symbols_format: SYMBOLS_FORMAT, assets: {} };

const CURRENCY = /^[A-Z]{3}$/;
const ENTRY_KEYS = [
  "currency",
  "eodhd",
  "alpha_vantage",
  "confirmed_at",
  "currency_check",
  "currency_confirmed_over",
];

const wrong = (field: string): ValidationError =>
  new ValidationError("invalid_symbols_file", `prices/symbols.json: ${field} is not valid`, {
    field,
  });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const bySource = <T>(
  value: unknown,
  field: string,
  valid: (item: unknown) => item is T,
): Partial<Record<QuoteSource, T>> => {
  if (!isObject(value)) {
    throw wrong(field);
  }
  for (const [source, item] of Object.entries(value)) {
    if (!isQuoteSource(source) || !valid(item)) {
      throw wrong(`${field}.${source}`);
    }
  }
  return value as Partial<Record<QuoteSource, T>>;
};

const isCheck = (item: unknown): item is CurrencyCheck =>
  isObject(item) &&
  typeof item.at === "string" &&
  (item.found === undefined || typeof item.found === "string") &&
  Object.keys(item).every((key) => key === "at" || key === "found");

const isCurrency = (item: unknown): item is string =>
  typeof item === "string" && CURRENCY.test(item);

const entryOf = (assetId: string, value: unknown): SymbolEntry => {
  if (!isObject(value)) {
    throw wrong(assetId);
  }
  for (const key of Object.keys(value)) {
    if (!ENTRY_KEYS.includes(key)) {
      throw wrong(`${assetId}.${key}`);
    }
  }
  if (!isCurrency(value.currency)) {
    throw wrong(`${assetId}.currency`);
  }
  if (typeof value.confirmed_at !== "string") {
    throw wrong(`${assetId}.confirmed_at`);
  }
  for (const source of QUOTE_SOURCES) {
    const symbol = value[source];
    if (symbol !== undefined && (typeof symbol !== "string" || symbol.trim() === "")) {
      throw wrong(`${assetId}.${source}`);
    }
  }
  if (value.currency_check !== undefined) {
    bySource(value.currency_check, `${assetId}.currency_check`, isCheck);
  }
  if (value.currency_confirmed_over !== undefined) {
    bySource(value.currency_confirmed_over, `${assetId}.currency_confirmed_over`, isCurrency);
  }
  return value as unknown as SymbolEntry;
};

/** Parses `prices/symbols.json`; `undefined` (no file) is an empty correspondence. */
export const parseSymbols = (text: string | undefined): SymbolsFile => {
  if (text === undefined) {
    return EMPTY_SYMBOLS;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw wrong("json");
  }
  if (!isObject(raw) || raw.symbols_format !== SYMBOLS_FORMAT || !isObject(raw.assets)) {
    throw wrong("symbols_format");
  }
  const assets: Record<AssetId, SymbolEntry> = {};
  for (const [assetId, value] of Object.entries(raw.assets)) {
    assets[assetId] = entryOf(assetId, value);
  }
  return { symbols_format: SYMBOLS_FORMAT, assets };
};

export const serializeSymbols = (file: SymbolsFile): string => `${JSON.stringify(file, null, 2)}\n`;

/**
 * Whether `source` may be downloaded for this entry: it has a symbol there,
 * and the source's metadata did not contradict the declared currency — or the
 * user confirmed the declared one over exactly what the source said.
 */
export const currencyAgrees = (entry: SymbolEntry, source: QuoteSource): boolean => {
  const found = entry.currency_check?.[source]?.found;
  return (
    found === undefined ||
    found === entry.currency ||
    entry.currency_confirmed_over?.[source] === found
  );
};

/** What the user declares for one asset. */
export interface SymbolDeclaration {
  readonly currency: string;
  readonly eodhd?: string;
  readonly alpha_vantage?: string;
}

/** A source whose metadata say another currency than the declared one. */
export interface CurrencyDisagreement {
  readonly source: QuoteSource;
  readonly declared: string;
  readonly found: string;
}

/**
 * The entry a declaration makes, given what each source's metadata said
 * (`checks`), and the disagreements the user has to confirm. Only the sources
 * listed in `accepted` are confirmed over their disagreement; any other
 * disagreement is returned and nothing may be written until it is confirmed.
 */
export const declareSymbols = (
  declaration: SymbolDeclaration,
  checks: Partial<Record<QuoteSource, string | undefined>>,
  at: string,
  accepted: readonly QuoteSource[],
): { entry: SymbolEntry; pending: CurrencyDisagreement[] } => {
  if (!isCurrency(declaration.currency)) {
    throw wrong("currency");
  }
  const check: Partial<Record<QuoteSource, CurrencyCheck>> = {};
  const over: Partial<Record<QuoteSource, string>> = {};
  const pending: CurrencyDisagreement[] = [];
  for (const source of QUOTE_SOURCES) {
    if (declaration[source] === undefined || !(source in checks)) {
      continue;
    }
    const found = checks[source];
    check[source] = found === undefined ? { at } : { found, at };
    if (found !== undefined && found !== declaration.currency) {
      if (accepted.includes(source)) {
        over[source] = found;
      } else {
        pending.push({ source, declared: declaration.currency, found });
      }
    }
  }
  const entry: SymbolEntry = {
    currency: declaration.currency,
    ...(declaration.eodhd === undefined ? {} : { eodhd: declaration.eodhd }),
    ...(declaration.alpha_vantage === undefined
      ? {}
      : { alpha_vantage: declaration.alpha_vantage }),
    confirmed_at: at,
    ...(Object.keys(check).length === 0 ? {} : { currency_check: check }),
    ...(Object.keys(over).length === 0 ? {} : { currency_confirmed_over: over }),
  };
  return { entry, pending };
};
