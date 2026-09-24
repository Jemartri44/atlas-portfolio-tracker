// The official history of the ECB reference rates, read (ADR-0029, point 1).
//
// **The file is kept byte for byte; what is interpreted here is a reading of
// it, never a copy.** Nothing normalises what is stored: a rate is the string
// of the history, without trailing zeros (point 4: the canonical form), and
// every comparison is numeric (`sameRate`).
//
// Two formats, with their provenance kept apart (decision (l) of prompt 012):
//
// - **The ZIP's CSV** (`eurofxref-hist.csv`), the preferred source: one row per
//   day of publication, newest first, a column per currency, `N/A` where a
//   currency had no value that day, and a trailing comma on every row
//   (verified on the real file of 2026-09-24,
//   `specs/012-ecb-reference-rates/questions.md` §4).
// - **The API's CSV** (`format=csvdata`), the fallback: one row per series and
//   day, oldest first. On a closing day of 1999-2012 it returns a row **with
//   no value** (`OBS_STATUS` `H`), which is **not** a publication and is read
//   as its absence.
//
// A day without publication simply does not appear; that absence is the
// source of truth (point 5), the TARGET calendar only a cross-check.

import { type CivilDate, compareCivilDates, isCivilDate } from "../dates/civil-date.js";
import { ValidationError } from "../errors.js";
import { Decimal, type DecimalString, isDecimalString } from "../money/decimal.js";

/** Where a history came from: said, never disguised (decision (l)). */
export type EcbSource = "zip" | "api";

export interface CurrencySeries {
  /** Days with a value, ascending. */
  readonly dates: readonly CivilDate[];
  /** The rate of each day, as the history writes it. */
  readonly rates: readonly DecimalString[];
}

export interface EcbHistory {
  readonly source: EcbSource;
  /** Every day with a publication (for any currency), ascending. */
  readonly publications: readonly CivilDate[];
  /** By ISO code; a currency the ECB never published is absent. */
  readonly series: ReadonlyMap<string, CurrencySeries>;
}

const unreadable = (message: string, line: number): ValidationError =>
  new ValidationError("ecb_history_unreadable", `line ${line}: ${message}`, { line });

/** One CSV record: commas, with double quotes around a field that holds them. */
export const splitCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] as string;
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
};

const linesOf = (text: string): string[] => text.split(/\r?\n/).filter((line) => line !== "");

const currencyOf = (value: string): boolean => /^[A-Z]{3}$/.test(value);

/** Builds the reading from (date, currency, rate) triples, in any order. */
const historyOf = (
  source: EcbSource,
  rows: readonly { date: CivilDate; currency: string; rate: DecimalString }[],
  publications: Iterable<CivilDate>,
): EcbHistory => {
  const byCurrency = new Map<string, { date: CivilDate; rate: DecimalString }[]>();
  for (const row of rows) {
    const list = byCurrency.get(row.currency) ?? [];
    list.push({ date: row.date, rate: row.rate });
    byCurrency.set(row.currency, list);
  }
  const series = new Map<string, CurrencySeries>();
  for (const [currency, list] of byCurrency) {
    list.sort((left, right) => compareCivilDates(left.date, right.date));
    series.set(currency, {
      dates: list.map((entry) => entry.date),
      rates: list.map((entry) => entry.rate),
    });
  }
  const days = [...new Set(publications)].sort(compareCivilDates);
  if (days.length === 0) {
    throw new ValidationError("ecb_history_empty", "the ECB history has no publication");
  }
  return { source, publications: days, series };
};

/** Reads the CSV of the ZIP (`eurofxref-hist.csv`). */
export const readEcbZipCsv = (text: string): EcbHistory => {
  const [header, ...rows] = linesOf(text);
  const columns = header === undefined ? [] : splitCsvLine(header);
  if (columns[0] !== "Date") {
    throw unreadable("the first column of the header is not Date", 1);
  }
  const currencies = columns.slice(1);
  const triples: { date: CivilDate; currency: string; rate: DecimalString }[] = [];
  const publications: CivilDate[] = [];
  rows.forEach((row, index) => {
    const line = index + 2;
    const cells = splitCsvLine(row);
    const date = cells[0];
    if (!isCivilDate(date)) {
      throw unreadable(`${String(date)} is not a date`, line);
    }
    if (cells.length !== columns.length) {
      throw unreadable(`${cells.length} fields where the header has ${columns.length}`, line);
    }
    publications.push(date);
    currencies.forEach((currency, column) => {
      const value = cells[column + 1] as string;
      if (currency === "" && value === "") {
        return; // the trailing comma of every row
      }
      if (!currencyOf(currency)) {
        throw unreadable(`${currency} is not a currency`, 1);
      }
      if (value === "N/A") {
        return;
      }
      if (!isDecimalString(value) || !Decimal.parse(value).isPositive()) {
        throw unreadable(`${value} is not a rate`, line);
      }
      triples.push({ date, currency, rate: value });
    });
  });
  return historyOf("zip", triples, publications);
};

/**
 * Reads the CSV of the API (`format=csvdata`, with or without
 * `detail=dataonly`). A row with no value is a closing day, not a
 * publication: it is skipped.
 */
export const readEcbApiCsv = (text: string): EcbHistory => {
  const [header, ...rows] = linesOf(text);
  const columns = header === undefined ? [] : splitCsvLine(header);
  const currencyAt = columns.indexOf("CURRENCY");
  const dateAt = columns.indexOf("TIME_PERIOD");
  const valueAt = columns.indexOf("OBS_VALUE");
  if (currencyAt < 0 || dateAt < 0 || valueAt < 0) {
    throw unreadable("the header lacks CURRENCY, TIME_PERIOD or OBS_VALUE", 1);
  }
  const triples: { date: CivilDate; currency: string; rate: DecimalString }[] = [];
  rows.forEach((row, index) => {
    const line = index + 2;
    const cells = splitCsvLine(row);
    const currency = cells[currencyAt] ?? "";
    const date = cells[dateAt];
    const value = cells[valueAt] ?? "";
    if (!isCivilDate(date) || !currencyOf(currency)) {
      throw unreadable("a row without a date or a currency", line);
    }
    if (value === "") {
      return;
    }
    if (!isDecimalString(value) || !Decimal.parse(value).isPositive()) {
      throw unreadable(`${value} is not a rate`, line);
    }
    triples.push({ date, currency, rate: value });
  });
  return historyOf(
    "api",
    triples,
    triples.map((triple) => triple.date),
  );
};

/**
 * The text of a downloaded history. Both sources are plain ASCII (verified on
 * the real files); a byte outside it means the bytes are not the history, and
 * reading them anyway would be guessing.
 */
export const asciiText = (bytes: Uint8Array): string => {
  const parts: string[] = [];
  const CHUNK = 8192;
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const slice = bytes.subarray(start, start + CHUNK);
    const offender = slice.findIndex((byte) => byte > 0x7f);
    if (offender >= 0) {
      throw new ValidationError(
        "ecb_history_unreadable",
        `byte ${start + offender} is not ASCII: these bytes are not the ECB history`,
        { byte: start + offender },
      );
    }
    parts.push(String.fromCharCode(...slice));
  }
  return parts.join("");
};

/** Reads a stored history in the format its provenance says. */
export const readEcbHistory = (text: string, source: EcbSource): EcbHistory =>
  source === "zip" ? readEcbZipCsv(text) : readEcbApiCsv(text);

/** Two rates are the same rate when they are the same **number**: `0.85950` is `0.8595` (point 4). */
export const sameRate = (left: DecimalString, right: DecimalString): boolean =>
  Decimal.parse(left).eq(Decimal.parse(right));

/** The last day with a publication, for any currency. */
export const latestPublication = (history: EcbHistory): CivilDate =>
  history.publications[history.publications.length - 1] as CivilDate;

/** Index of the last element ≤ `date` in an ascending list, or −1. */
export const lastIndexOnOrBefore = (dates: readonly CivilDate[], date: CivilDate): number => {
  let low = 0;
  let high = dates.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((dates[middle] as CivilDate) <= date) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
};

/** Whether the ECB published anything on `date`. */
export const isPublication = (history: EcbHistory, date: CivilDate): boolean => {
  const index = lastIndexOnOrBefore(history.publications, date);
  return index >= 0 && history.publications[index] === date;
};

/** The rate of `currency` published exactly on `date`, if any. */
export const rateOn = (
  history: EcbHistory,
  currency: string,
  date: CivilDate,
): DecimalString | undefined => {
  const series = history.series.get(currency);
  if (series === undefined) {
    return undefined;
  }
  const index = lastIndexOnOrBefore(series.dates, date);
  return index >= 0 && series.dates[index] === date ? series.rates[index] : undefined;
};
