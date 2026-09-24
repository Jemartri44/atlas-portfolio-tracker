// Which ECB rate applies to a currency on a date (ADR-0029, point 5).
//
// The rate of a currency for a date F is the one of the **last day on or
// before F with a value for that currency** in the history. The absence of F
// is definitive once the history holds a publication on or after F, and
// weekends are known in advance; **a working day not yet in the history is not
// resolved**: that is the operation recorded before the publication, and
// resolving it with the day before would be exactly the option C that the ADR
// discards. The outcomes are a closed union, each with its own name.
//
// The date is any date — a fiscal date when recording, a quotation date for
// the prices of feature 013 — so nothing here knows about fiscal rules.
//
// `staleDays` is the configurable threshold of point 5 (`atlas.config.json`,
// `ecb_stale_currency_days`): after it, a currency has **no official rate to
// propose**. It only decides the proposal and whether a currency is taken for
// not published; **no fiscal figure moves with it**, because the engine always
// computes with the `fx_rate` of the ledger.

import { addDays, type CivilDate, daysBetween, isWeekend } from "../dates/civil-date.js";
import type { DecimalString } from "../money/decimal.js";
import { type EcbHistory, lastIndexOnOrBefore, latestPublication } from "./history.js";

export type RateResolution =
  /** The euro never waits: its rate is 1, dated on the last working day on or before F. */
  | { kind: "euro"; rate: "1"; date: CivilDate }
  | { kind: "resolved"; currency: string; rate: DecimalString; date: CivilDate }
  /** A working day on or before F that the history does not reach yet. */
  | { kind: "not_yet_published"; currency: string; latest: CivilDate }
  /** The ECB does not publish this currency — never, or not yet on F. */
  | { kind: "currency_not_published"; currency: string }
  /** Its last value is more than `staleDays` before F: no official rate to propose. */
  | { kind: "currency_stale"; currency: string; last: CivilDate };

/** The last working day on or before `date` (weekends only: holidays come from the history). */
const workingDayOnOrBefore = (date: CivilDate): CivilDate =>
  isWeekend(date) ? workingDayOnOrBefore(addDays(date, -1)) : date;

/**
 * Whether the history already says everything about the days up to `date`:
 * every day after its last publication, up to `date`, is a weekend.
 */
export const isDecided = (history: EcbHistory, date: CivilDate): boolean => {
  const latest = latestPublication(history);
  return workingDayOnOrBefore(date) <= latest;
};

export const resolveRate = (
  history: EcbHistory,
  currency: string,
  date: CivilDate,
  staleDays: number,
): RateResolution => {
  if (currency === "EUR") {
    return { kind: "euro", rate: "1", date: workingDayOnOrBefore(date) };
  }
  const series = history.series.get(currency);
  if (series === undefined) {
    return { kind: "currency_not_published", currency };
  }
  const last = series.dates[series.dates.length - 1] as CivilDate;
  // Stopped for good: its last value is stale for F and the ECB kept
  // publishing without it, so there is nothing to wait for.
  if (
    daysBetween(last, date) > staleDays &&
    daysBetween(last, latestPublication(history)) > staleDays
  ) {
    return { kind: "currency_stale", currency, last };
  }
  if (!isDecided(history, date)) {
    return { kind: "not_yet_published", currency, latest: latestPublication(history) };
  }
  const index = lastIndexOnOrBefore(series.dates, date);
  if (index < 0) {
    return { kind: "currency_not_published", currency };
  }
  const found = series.dates[index] as CivilDate;
  if (daysBetween(found, date) > staleDays) {
    return { kind: "currency_stale", currency, last: found };
  }
  return { kind: "resolved", currency, rate: series.rates[index] as DecimalString, date: found };
};
