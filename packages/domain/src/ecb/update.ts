// An update never overwrites the past in silence (ADR-0029, point 2).
//
// A new history replaces the previous one **only** if it holds, with the same
// numeric value, every rate of the previous one. If not, both are kept and the
// previous one **stays in force**: a file that
// contradicts what was already published cannot be the reference until
// somebody knows why — the ECB changed a published rate, or the download is
// wrong. Either way it has to be known.

import { type CivilDate, compareCivilDates } from "../dates/civil-date.js";
import { ValidationError } from "../errors.js";
import type { DecimalString } from "../money/decimal.js";
import { type EcbHistory, latestPublication, rateOn, sameRate } from "./history.js";

/** A rate of the previous history the new one lacks or changes. */
export interface HistoryConflict {
  currency: string;
  date: CivilDate;
  before: DecimalString;
  /** Absent when the new history does not have it at all. */
  after?: DecimalString;
}

export type HistoryUpdate =
  | {
      kind: "accepted";
      /** Days of publication the new history adds after the previous one. */
      newDays: number;
      latest: CivilDate;
      /**
       * Rates the new history holds on or before the last day the previous one knew, that the
       * previous one did not have (a past day with no publication that now has one, or a currency
       * with a history of its own). Accepted, and said: an integrity finding, not a rejection.
       */
      backfilled: number;
    }
  | {
      kind: "rejected";
      /** Up to twenty of them, by date; `total` says how many there are. */
      conflicts: HistoryConflict[];
      total: number;
    };

const SHOWN = 20;

/**
 * Compares a new history with the one in force. `previous` absent: the first download. A history
 * whose last publication is after `today` (in Madrid, where the ECB publishes) is not a history
 * of the past: it is refused, with nothing written, whatever else it holds.
 */
export const checkHistoryUpdate = (
  previous: EcbHistory | undefined,
  next: EcbHistory,
  today: CivilDate,
): HistoryUpdate => {
  const latest = latestPublication(next);
  if (compareCivilDates(latest, today) > 0) {
    throw new ValidationError("ecb_history_future", "the ECB history has a day after today", {
      latest,
    });
  }
  if (previous === undefined) {
    return { kind: "accepted", newDays: next.publications.length, latest, backfilled: 0 };
  }
  const conflicts: HistoryConflict[] = [];
  let total = 0;
  for (const [currency, series] of previous.series) {
    series.dates.forEach((date, index) => {
      const before = series.rates[index] as DecimalString;
      const after = rateOn(next, currency, date);
      if (after !== undefined && sameRate(before, after)) {
        return;
      }
      total += 1;
      if (conflicts.length < SHOWN) {
        conflicts.push(
          after === undefined ? { currency, date, before } : { currency, date, before, after },
        );
      }
    });
  }
  if (total > 0) {
    conflicts.sort((left, right) => compareCivilDates(left.date, right.date));
    return { kind: "rejected", conflicts, total };
  }
  const known = latestPublication(previous);
  let backfilled = 0;
  for (const [currency, series] of next.series) {
    for (const date of series.dates) {
      if (date <= known && rateOn(previous, currency, date) === undefined) {
        backfilled += 1;
      }
    }
  }
  return {
    kind: "accepted",
    newDays: next.publications.filter((day) => day > known).length,
    latest,
    backfilled,
  };
};
