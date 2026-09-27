// The entries of a list of movements (feature 020, E2, M8): the rows with the
// current valuations of a day gathered, under one heading per month, and the
// first few of them for the summary. Only grouping: the rows themselves are
// made in `movements.ts`.

import { hasState, type MovementRow } from "./movements.js";

/**
 * The valuations of one day, gathered into one row that unfolds (feature 020,
 * E2, M8): «7 valoraciones · 31/12/2028» said once instead of seven rows that
 * say one thing. Only valuations, only of the same day, and never one that is
 * not current: an annulled or invalid valuation keeps its own row, with its
 * state, because gathered it would read as one more of the day.
 */
export interface ValuationGroup {
  kind: "valuations";
  date: string;
  rows: MovementRow[];
}

export type ListEntry = { kind: "row"; row: MovementRow } | ValuationGroup;

const gathers = (row: MovementRow): boolean => row.type === "valuation" && !hasState(row);

/**
 * The rows of a list with the current valuations of each day gathered, where
 * the first of them was. The rows come ordered by date, so the rows of a day
 * are together; a day with a single valuation keeps it as a row.
 */
export const groupValuations = (rows: readonly MovementRow[]): ListEntry[] => {
  const entries: ListEntry[] = [];
  let start = 0;
  while (start < rows.length) {
    const date = (rows[start] as MovementRow).date;
    let end = start;
    while (end < rows.length && (rows[end] as MovementRow).date === date) {
      end += 1;
    }
    const day = rows.slice(start, end);
    const valuations = day.filter(gathers);
    let placed = false;
    for (const row of day) {
      if (valuations.length > 1 && gathers(row)) {
        if (!placed) {
          entries.push({ kind: "valuations", date, rows: valuations });
          placed = true;
        }
        continue;
      }
      entries.push({ kind: "row", row });
    }
    start = end;
  }
  return entries;
};

export interface MonthOfEntries {
  /** `YYYY-MM` of the civil dates of its rows: the month in Europe/Madrid. */
  month: string;
  entries: ListEntry[];
}

/**
 * The list of a phone under one heading per month (feature 020, M8), with the
 * date in each row: a heading per day cost a row per movement. The dates are
 * civil dates of the ledger, already the days of Madrid, so the month is read
 * off them and never off an instant.
 */
export const byMonth = (entries: readonly ListEntry[]): MonthOfEntries[] => {
  const months: MonthOfEntries[] = [];
  for (const entry of entries) {
    const month = (entry.kind === "row" ? entry.row.date : entry.date).slice(0, 7);
    const last = months[months.length - 1];
    if (last?.month === month) {
      last.entries.push(entry);
    } else {
      months.push({ month, entries: [entry] });
    }
  }
  return months;
};

/**
 * The first `limit` entries of a list, a gathered day counting as one (the
 * recent movements of the summary). The rows are made a chunk at a time: a
 * twenty-year ledger is not turned into rows to show five of them. A day at
 * the edge of a chunk is completed before it is counted.
 */
export const firstEntries = (
  count: number,
  rowsOf: (from: number, to: number) => MovementRow[],
  limit: number,
): ListEntry[] => {
  let taken = 0;
  let rows: MovementRow[] = [];
  let chunk = Math.max(limit * 4, 1);
  while (taken < count) {
    const next = Math.min(count, taken + chunk);
    rows = [...rows, ...rowsOf(taken, next)];
    taken = next;
    chunk *= 2;
    const entries = groupValuations(rows);
    // Enough, and the day of the last one shown is whole: rows of a later day
    // were taken already, so no valuation of that day is left for the next chunk.
    const edge = entries[limit - 1];
    const lastDate = rows[rows.length - 1]?.date;
    if (
      entries.length > limit &&
      edge !== undefined &&
      (edge.kind === "row" ? edge.row.date : edge.date) !== lastDate
    ) {
      return entries.slice(0, limit);
    }
  }
  return groupValuations(rows).slice(0, limit);
};
