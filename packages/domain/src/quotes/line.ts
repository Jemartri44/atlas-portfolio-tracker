// A line of `prices/<asset_id>.jsonl` (ADR-0031, «Almacén»; feature 013,
// `plan.md` §4): the close of one date from one source, as the source gave it.
//
// **Only appended.** Whether a close is already there is decided by identity
// — the asset, the date and the source — and by the value **as a number**
// (`101.50` and `101.5` are the same close), never by a hash of the line, which
// carries `fetched_at` and would make every run a new line (§2 ter of prompt
// 013, the lesson of §11.1 of feature 012).
//
// **One close in force per asset and date** (decision D-Q10 of the direction):
// the console resolves which source wins when it writes, so a reader never
// needs the configured order. The file only grows, so the close in force of a
// date is **the last line of that date**, and the ones before it are what it
// replaced — shown, never silently dropped.
//
// The value in euros is never stored: the gate converts when it reads, with
// the ECB rate of the quote's date (ADR-0031).

import { type CivilDate, isCivilDate } from "../dates/civil-date.js";
import { ValidationError } from "../errors.js";
import { Decimal, type DecimalString, isDecimalString } from "../money/decimal.js";
import type { QuoteSource } from "../projections/prices.js";
import type { AssetId } from "../schema/events.js";
import { isQuoteSource } from "./sources.js";

/** The version of a line this code reads and writes. */
export const PRICE_LINE_VERSION = 1;

export interface CloseLine {
  readonly schema_version: number;
  readonly date: CivilDate;
  /** The close as traded, as the decimal text the source gave (ADR-0005). */
  readonly close: DecimalString;
  /** As the source gave it or, when it does not say, as declared in `prices/symbols.json`. */
  readonly currency: string;
  readonly source: QuoteSource;
  /** ISO 8601 UTC. */
  readonly fetched_at: string;
}

/** The close in force of one date, and the one it replaced when there was one. */
export interface EffectiveClose extends CloseLine {
  readonly replaced?: { readonly close: DecimalString; readonly source: QuoteSource };
}

const FIELDS = ["schema_version", "date", "close", "currency", "source", "fetched_at"];
const CURRENCY = /^[A-Z]{3}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/** The line as written: its fields always in the same order, one JSON object. */
export const encodeCloseLine = (line: CloseLine): string =>
  JSON.stringify({
    schema_version: line.schema_version,
    date: line.date,
    close: line.close,
    currency: line.currency,
    source: line.source,
    fetched_at: line.fetched_at,
  });

const invalid = (assetId: AssetId, line: number, field: string): ValidationError =>
  new ValidationError(
    "price_line_invalid",
    `prices/${assetId}.jsonl, line ${line}: ${field} is not valid`,
    { asset_id: assetId, line, field },
  );

const lineOf = (assetId: AssetId, text: string, number: number): CloseLine => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw invalid(assetId, number, "json");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw invalid(assetId, number, "json");
  }
  const record = raw as Record<string, unknown>;
  const version = record.schema_version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw invalid(assetId, number, "schema_version");
  }
  // A reader refuses what it does not know (trap 10): the whole file of the
  // asset, not the line, because a newer line may be the correction of an
  // older one of the same date and source (questions.md §2.5, accepted).
  if (version > PRICE_LINE_VERSION) {
    throw new ValidationError(
      "price_file_newer_version",
      `prices/${assetId}.jsonl, line ${number}: version ${version} is newer than ${PRICE_LINE_VERSION}`,
      { asset_id: assetId, line: number, version },
    );
  }
  for (const key of Object.keys(record)) {
    if (!FIELDS.includes(key)) {
      throw invalid(assetId, number, key);
    }
  }
  const { date, close, currency, source, fetched_at } = record;
  if (!isCivilDate(date)) {
    throw invalid(assetId, number, "date");
  }
  if (!isDecimalString(close) || !Decimal.parse(close).isPositive()) {
    throw invalid(assetId, number, "close");
  }
  if (typeof currency !== "string" || !CURRENCY.test(currency)) {
    throw invalid(assetId, number, "currency");
  }
  if (!isQuoteSource(source)) {
    throw invalid(assetId, number, "source");
  }
  if (typeof fetched_at !== "string" || !INSTANT.test(fetched_at)) {
    throw invalid(assetId, number, "fetched_at");
  }
  return { schema_version: version, date, close, currency, source, fetched_at };
};

/**
 * Every line of a file, in file order. A line that does not read is an error
 * said with its number, never a price by halves; blank lines are skipped (the
 * file ends with a newline).
 */
export const readCloseFile = (assetId: AssetId, text: string): CloseLine[] =>
  text
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim() !== "")
    .map(({ line, number }) => lineOf(assetId, line, number));

const sameClose = (left: CloseLine, right: { close: DecimalString; currency: string }) =>
  left.currency === right.currency && Decimal.parse(left.close).eq(Decimal.parse(right.close));

/** The close in force of every date (the last line of it), ascending by date. */
export const effectiveCloses = (lines: readonly CloseLine[]): EffectiveClose[] => {
  const byDate = new Map<CivilDate, EffectiveClose>();
  for (const line of lines) {
    const before = byDate.get(line.date);
    byDate.set(
      line.date,
      before === undefined || (sameClose(before, line) && before.source === line.source)
        ? line
        : { ...line, replaced: { close: before.close, source: before.source } },
    );
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
};

/**
 * The last close **on or before** `date`: never a later one, and never one
 * made up between two that exist (constitution V).
 */
export const closeOnOrBefore = (
  closes: readonly EffectiveClose[],
  date: CivilDate,
): EffectiveClose | undefined => {
  let found: EffectiveClose | undefined;
  for (const close of closes) {
    if (close.date > date) {
      break;
    }
    found = close;
  }
  return found;
};

/** The close of exactly `date`, or nothing: the nearest one is never taken instead. */
export const closeOn = (
  closes: readonly EffectiveClose[],
  date: CivilDate,
): EffectiveClose | undefined => closes.find((close) => close.date === date);

/**
 * The lines to append for what `source` returned, decided against what the
 * file holds **now** (the caller reads it inside the lock). For each date:
 *
 * - nothing there yet: append;
 * - the close in force is of the **same** source: append only when the value
 *   differs as a number (a correction of the source), never for the same value;
 * - it is of **another** source: append only when `source` comes **before**
 *   it in the configured order — the primary replaces the fallback, never the
 *   other way round (D-Q10). Nothing is ever averaged (P7).
 */
export const linesToAppend = (
  existing: readonly CloseLine[],
  returned: readonly { date: CivilDate; close: DecimalString; currency: string }[],
  source: QuoteSource,
  order: readonly QuoteSource[],
  fetchedAt: string,
): CloseLine[] => {
  const rank = (name: QuoteSource): number => {
    const index = order.indexOf(name);
    return index < 0 ? order.length : index;
  };
  const inForce = new Map<CivilDate, CloseLine>();
  for (const line of existing) {
    inForce.set(line.date, line);
  }
  const added: CloseLine[] = [];
  for (const close of returned) {
    const current = inForce.get(close.date);
    const append =
      current === undefined ||
      (current.source === source
        ? !sameClose(current, close)
        : rank(source) < rank(current.source));
    if (append) {
      const line: CloseLine = {
        schema_version: PRICE_LINE_VERSION,
        date: close.date,
        close: close.close,
        currency: close.currency,
        source,
        fetched_at: fetchedAt,
      };
      added.push(line);
      inForce.set(close.date, line);
    }
  }
  return added;
};

/** A file of closes that could not be read, with the code of why. */
export interface UnreadableCloses {
  readonly asset_id: AssetId;
  readonly code: string;
  readonly line?: number;
}

/**
 * The closes in force of every file given, by asset. A file that does not
 * read leaves **its** asset without automatic price — never with the part of
 * it that did read — and is returned with its reason, to be said.
 */
export const readCloses = (
  files: ReadonlyMap<AssetId, string>,
): { closes: Map<AssetId, EffectiveClose[]>; unreadable: UnreadableCloses[] } => {
  const closes = new Map<AssetId, EffectiveClose[]>();
  const unreadable: UnreadableCloses[] = [];
  for (const [assetId, text] of files) {
    try {
      closes.set(assetId, effectiveCloses(readCloseFile(assetId, text)));
    } catch (error) {
      const { code, details } = error as ValidationError;
      unreadable.push({ asset_id: assetId, code, line: details.line as number });
    }
  }
  return { closes, unreadable };
};
