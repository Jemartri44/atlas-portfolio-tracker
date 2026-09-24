// The TARGET calendar, **only as a cross-check** (ADR-0029, point 6, with the
// amendment of prompt 012 (m)).
//
// The closing days of TARGET: weekends, 1 January, Good Friday, Easter Monday,
// 1 May, 25 and 26 December (`ecb.europa.eu/paym/target/t2`). It is a
// documented reference datum, not a fiscal criterion, and **never the source
// of truth**: that is the absence of a day in the history. A disagreement is a
// warning, never a block — either the file is incomplete or the calendar
// changed and this function has to follow — and it is checked **only in the
// years the ledger uses**, from its first `fx_rate_date`, and with an empty
// ledger in the current year and the one before. No historical calendar is
// invented: against the real history (1999-2026) this calendar disagrees in
// 1999 and 2001 only, four days in all, none since
// (`specs/012-ecb-reference-rates/questions.md` §5).

import { addDays, type CivilDate, isWeekend } from "../dates/civil-date.js";
import { type EcbHistory, isPublication, latestPublication } from "./history.js";

const pad = (value: number): string => String(value).padStart(2, "0");

/** Easter Sunday of `year`, by the anonymous Gregorian algorithm. */
export const easterSunday = (year: number): CivilDate => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
};

/** The closing days of `year` that are not weekends. */
export const targetHolidays = (year: number): CivilDate[] => {
  const easter = easterSunday(year);
  return [
    `${year}-01-01`,
    addDays(easter, -2),
    addDays(easter, 1),
    `${year}-05-01`,
    `${year}-12-25`,
    `${year}-12-26`,
  ];
};

export const isTargetClosingDay = (date: CivilDate): boolean =>
  isWeekend(date) || targetHolidays(Number(date.slice(0, 4))).includes(date);

export interface CalendarDisagreement {
  date: CivilDate;
  /** A working day of the calendar with no publication, or a closing day with one. */
  kind: "working_day_without_publication" | "closing_day_with_publication";
}

/**
 * The years to compare: from the year of the first `fx_rate_date` of the
 * ledger to the current one; with none, the current year and the one before.
 */
export const calendarYears = (firstRateDate: CivilDate | undefined, today: CivilDate): number[] => {
  const current = Number(today.slice(0, 4));
  const first = firstRateDate === undefined ? current - 1 : Number(firstRateDate.slice(0, 4));
  const years: number[] = [];
  for (let year = Math.min(first, current); year <= current; year += 1) {
    years.push(year);
  }
  return years;
};

/**
 * Every day of `years`, up to the last publication of the history, on which
 * the calendar and the history disagree.
 */
export const crossCheckCalendar = (
  history: EcbHistory,
  years: readonly number[],
): CalendarDisagreement[] => {
  const latest = latestPublication(history);
  const first = history.publications[0] as CivilDate;
  const found: CalendarDisagreement[] = [];
  for (const year of years) {
    for (
      let date = `${year}-01-01`;
      date <= `${year}-12-31` && date <= latest;
      date = addDays(date, 1)
    ) {
      if (date < first) {
        continue;
      }
      const closing = isTargetClosingDay(date);
      const published = isPublication(history, date);
      if (!closing && !published) {
        found.push({ date, kind: "working_day_without_publication" });
      } else if (closing && published) {
        found.push({ date, kind: "closing_day_with_publication" });
      }
    }
  }
  return found;
};
