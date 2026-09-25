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

import { type CivilDate, isCivilDate } from "../dates/civil-date.js";
import { ValidationError } from "../errors.js";
import type { QuoteSource } from "../projections/prices.js";
import type { AssetId } from "../schema/events.js";
import { isQuoteSource, QUOTE_SOURCES } from "./sources.js";

/**
 * Format 2: the currency is declared **per source** (fix of feature 013): a
 * London share quotes in pounds at EODHD and in pence at Alpha Vantage, and
 * one currency for the asset made one of the two ask for a confirmation
 * forever, or stored the closes of the other a hundred times too high.
 * Format 1, written by feature 013 with one `currency` per asset, is still
 * read, as the currency of all its sources; it is written as format 2.
 */
export const SYMBOLS_FORMAT = 2;
const LEGACY_FORMAT = 1;

export interface CurrencyCheck {
  /** What the source's metadata said; absent when they do not say. */
  readonly found?: string;
  /** ISO 8601 UTC. */
  readonly at: string;
}

export interface SymbolEntry {
  readonly eodhd?: string;
  readonly alpha_vantage?: string;
  /**
   * The currency of the quote **of each source** (it may be a subunit such as
   * GBX), declared by the user: one per source that has a symbol.
   */
  readonly currencies: Partial<Record<QuoteSource, string>>;
  /** ISO 8601 UTC of the declaration. */
  readonly confirmed_at: string;
  readonly currency_check?: Partial<Record<QuoteSource, CurrencyCheck>>;
  /** The currency of the source the user accepted to contradict, explicitly (D-Q2). */
  readonly currency_confirmed_over?: Partial<Record<QuoteSource, string>>;
  /**
   * The currency in which feature 013 stored the closes of a source **that
   * said another one** (second pass of the review of PR #80): a file of
   * format 1 confirmed the currency of the asset over what the source said
   * (`currency_confirmed_over`), and every close of that source was stored
   * with the currency of the asset — pence as pounds. Those lines are left out
   * of every figure in euros until they are purged; never written by anything
   * but the reading of format 1, and kept when the file is written again.
   */
  readonly misstored?: Partial<Record<QuoteSource, string>>;
  /**
   * The days whose closes of a source a purge removed, to be asked for again
   * **once** (second and third passes of the review of PR #80): the next
   * download of the asset starts at the first of them, not after its last
   * close, and they are cleared once asked.
   */
  readonly refetch_days?: Partial<Record<QuoteSource, readonly CivilDate[]>>;
  /**
   * The days asked for again that no source served: left as a **hole**, and
   * said by `prices status` while no close fills them. Never chased again —
   * a source that does not have a day today will not have it tomorrow.
   */
  readonly unserved_days?: Partial<Record<QuoteSource, readonly CivilDate[]>>;
}

export interface SymbolsFile {
  readonly symbols_format: number;
  readonly assets: Readonly<Record<AssetId, SymbolEntry>>;
}

export const EMPTY_SYMBOLS: SymbolsFile = { symbols_format: SYMBOLS_FORMAT, assets: {} };

const CURRENCY = /^[A-Z]{3}$/;
const ENTRY_KEYS = [
  "currencies",
  "eodhd",
  "alpha_vantage",
  "confirmed_at",
  "currency_check",
  "currency_confirmed_over",
  "misstored",
  "refetch_days",
  "unserved_days",
];

const FORMAT_2_ONLY = ["misstored", "refetch_days", "unserved_days"];

const isDays = (item: unknown): item is CivilDate[] =>
  Array.isArray(item) && item.length > 0 && item.every(isCivilDate);

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
  (item.found === undefined || isSaid(item.found)) &&
  Object.keys(item).every((key) => key === "at" || key === "found");

const isCurrency = (item: unknown): item is string =>
  typeof item === "string" && CURRENCY.test(item);

/**
 * What a source said of the currency: kept as it came, also when it is not a
 * code (`GBp`), because that is a disagreement to confirm, never a silence.
 */
const isSaid = (item: unknown): item is string =>
  typeof item === "string" && item.length > 0 && item.length <= 16;

/**
 * The currencies of an entry: its own per source (format 2), or the one of
 * the asset for every source that has a symbol (format 1, feature 013).
 */
const currenciesOf = (
  assetId: string,
  value: Record<string, unknown>,
  legacy: boolean,
): Partial<Record<QuoteSource, string>> => {
  if (legacy) {
    if (!isCurrency(value.currency)) {
      throw wrong(`${assetId}.currency`);
    }
    return Object.fromEntries(
      QUOTE_SOURCES.filter((source) => value[source] !== undefined).map((source) => [
        source,
        value.currency as string,
      ]),
    );
  }
  if (!isObject(value.currencies)) {
    throw wrong(`${assetId}.currencies`);
  }
  for (const [source, currency] of Object.entries(value.currencies)) {
    if (!isQuoteSource(source) || !isCurrency(currency)) {
      throw wrong(`${assetId}.currencies.${source}`);
    }
  }
  for (const source of QUOTE_SOURCES) {
    if (value[source] !== undefined && value.currencies[source] === undefined) {
      throw wrong(`${assetId}.currencies.${source}`);
    }
  }
  return value.currencies as Partial<Record<QuoteSource, string>>;
};

/**
 * A confirmation of format 1 is **not inherited** (review of PR #80): it was
 * taken with one currency for every source — the model that was wrong — so
 * a user who declared GBP and confirmed it over the GBX of Alpha Vantage would
 * keep storing pence as pounds. Every source confirmed over another currency
 * is left **uncontrasted** instead, and is contrasted with the rule of format
 * 2 before its next download.
 */
const withoutLegacyConfirmations = (entry: SymbolEntry): SymbolEntry => {
  const over = entry.currency_confirmed_over;
  if (over === undefined) {
    return entry;
  }
  const check = { ...entry.currency_check };
  // What the source said is in `currency_confirmed_over`; the closes of that
  // source were stored with the currency of the asset, which is another one:
  // exactly the defect (second pass of the review of PR #80).
  const misstored: Partial<Record<QuoteSource, string>> = {};
  for (const source of Object.keys(over) as QuoteSource[]) {
    delete check[source];
    const stored = entry.currencies[source];
    if (stored !== undefined && stored !== over[source]) {
      misstored[source] = stored;
    }
  }
  const { currency_confirmed_over: _dropped, currency_check: _check, ...rest } = entry;
  return {
    ...rest,
    ...(Object.keys(check).length === 0 ? {} : { currency_check: check }),
    ...(Object.keys(misstored).length === 0 ? {} : { misstored }),
  };
};

const entryOf = (assetId: string, value: unknown, legacy: boolean): SymbolEntry => {
  if (!isObject(value)) {
    throw wrong(assetId);
  }
  // Format 1 has `currency` where format 2 has `currencies`, never both; and
  // what format 2 added after it (`misstored`, the days of a purge) it never had.
  const allowed = legacy
    ? ENTRY_KEYS.filter((key) => !FORMAT_2_ONLY.includes(key)).map((key) =>
        key === "currencies" ? "currency" : key,
      )
    : ENTRY_KEYS;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw wrong(`${assetId}.${key}`);
    }
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
    bySource(value.currency_confirmed_over, `${assetId}.currency_confirmed_over`, isSaid);
  }
  if (value.misstored !== undefined) {
    bySource(value.misstored, `${assetId}.misstored`, isCurrency);
  }
  for (const key of ["refetch_days", "unserved_days"]) {
    if (value[key] !== undefined) {
      bySource(value[key], `${assetId}.${key}`, isDays);
    }
  }
  // Every field was checked above; format 1's `currency` becomes `currencies`.
  const { currency: _legacy, ...rest } = value;
  const checked = rest as unknown as Omit<SymbolEntry, "currencies">;
  const entry = { ...checked, currencies: currenciesOf(assetId, value, legacy) };
  return legacy ? withoutLegacyConfirmations(entry) : entry;
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
  if (
    isObject(raw) &&
    typeof raw.symbols_format === "number" &&
    raw.symbols_format > SYMBOLS_FORMAT
  ) {
    // Written by a newer application: said as such, never read as it goes.
    throw new ValidationError(
      "symbols_file_newer_version",
      `prices/symbols.json has format ${raw.symbols_format}, newer than ${SYMBOLS_FORMAT}`,
      { format: raw.symbols_format },
    );
  }
  if (
    !isObject(raw) ||
    (raw.symbols_format !== SYMBOLS_FORMAT && raw.symbols_format !== LEGACY_FORMAT) ||
    !isObject(raw.assets)
  ) {
    throw wrong("symbols_format");
  }
  const legacy = raw.symbols_format === LEGACY_FORMAT;
  const assets: Record<AssetId, SymbolEntry> = {};
  for (const [assetId, value] of Object.entries(raw.assets)) {
    assets[assetId] = entryOf(assetId, value, legacy);
  }
  return { symbols_format: SYMBOLS_FORMAT, assets };
};

export const serializeSymbols = (file: SymbolsFile): string => `${JSON.stringify(file, null, 2)}\n`;

/**
 * Whether `source` may be downloaded for this entry: its metadata did not
 * contradict **the currency declared for that source** — or the user confirmed
 * the declared one over exactly what the source said.
 */
export const currencyAgrees = (entry: SymbolEntry, source: QuoteSource): boolean => {
  const found = entry.currency_check?.[source]?.found;
  return (
    found === undefined ||
    found === entry.currencies[source] ||
    entry.currency_confirmed_over?.[source] === found
  );
};

/** What the user declares for one asset: each symbol with the currency of its quote. */
export interface SymbolDeclaration {
  readonly eodhd?: string;
  readonly alpha_vantage?: string;
  readonly currencies: Partial<Record<QuoteSource, string>>;
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
  for (const source of QUOTE_SOURCES) {
    if (declaration[source] !== undefined && !isCurrency(declaration.currencies[source])) {
      throw wrong(`currencies.${source}`);
    }
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
    const declared = declaration.currencies[source] as string;
    if (found !== undefined && found !== declared) {
      if (accepted.includes(source)) {
        over[source] = found;
      } else {
        pending.push({ source, declared, found });
      }
    }
  }
  const entry: SymbolEntry = {
    ...(declaration.eodhd === undefined ? {} : { eodhd: declaration.eodhd }),
    ...(declaration.alpha_vantage === undefined
      ? {}
      : { alpha_vantage: declaration.alpha_vantage }),
    currencies: Object.fromEntries(
      QUOTE_SOURCES.filter((source) => declaration[source] !== undefined).map((source) => [
        source,
        declaration.currencies[source] as string,
      ]),
    ),
    confirmed_at: at,
    ...(Object.keys(check).length === 0 ? {} : { currency_check: check }),
    ...(Object.keys(over).length === 0 ? {} : { currency_confirmed_over: over }),
  };
  return { entry, pending };
};
