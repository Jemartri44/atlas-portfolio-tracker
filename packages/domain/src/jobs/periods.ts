// The period of a job (feature 016, §8.1 P15): **the taxpayer's**, of
// `Europe/Madrid`. The day comes from the injected clock (`todayInMadrid`),
// never from the machine nor from UTC: at 23:30 of the 31st of December in
// Madrid (22:30 UTC) the month is December and the year the one that ends;
// at 00:30 of the 1st of January (23:30 UTC of the 31st), January and the new.
//
//   daily      YYYY-MM-DD
//   weekly     YYYY-Www   (ISO 8601: the week of its Thursday, from Monday)
//   monthly    YYYY-MM
//   quarterly  YYYY-Qn
//   yearly     YYYY       (and only in January: the income tax of the past
//                          year and the thresholds of 720 and 721)

import { addDays, type CivilDate, yearOf } from "../dates/civil-date.js";
import type { JobFrequency } from "../settings/job-frequencies.js";

const DAY_MS = 86_400_000;

const msOf = (date: CivilDate): number =>
  Date.UTC(yearOf(date), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));

/** ISO day of the week: 1 Monday … 7 Sunday. */
export const isoWeekday = (date: CivilDate): number => {
  const day = new Date(msOf(date)).getUTCDay();
  return day === 0 ? 7 : day;
};

const pad = (value: number): string => String(value).padStart(2, "0");

const isoWeek = (date: CivilDate): string => {
  const thursday = addDays(date, 4 - isoWeekday(date));
  const year = yearOf(thursday);
  const week = Math.floor((msOf(thursday) - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${year}-W${pad(week)}`;
};

/** The first day of the period `date` belongs to. */
const startOf = (frequency: JobFrequency, date: CivilDate): CivilDate => {
  switch (frequency) {
    case "daily":
      return date;
    case "weekly":
      return addDays(date, 1 - isoWeekday(date));
    case "monthly":
      return `${date.slice(0, 7)}-01`;
    case "quarterly": {
      const month = Math.floor((Number(date.slice(5, 7)) - 1) / 3) * 3 + 1;
      return `${date.slice(0, 4)}-${pad(month)}-01`;
    }
    case "yearly":
      return `${date.slice(0, 4)}-01-01`;
  }
};

export const periodOf = (frequency: JobFrequency, date: CivilDate): string => {
  switch (frequency) {
    case "daily":
      return date;
    case "weekly":
      return isoWeek(date);
    case "monthly":
      return date.slice(0, 7);
    case "quarterly":
      return `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
    case "yearly":
      return date.slice(0, 4);
  }
};

/** The period before the one of `date`, of the same frequency. */
export const previousPeriod = (frequency: JobFrequency, date: CivilDate): string =>
  periodOf(frequency, addDays(startOf(frequency, date), -1));

/** Whether a job of this frequency may run on `date`: a yearly job only in January. */
export const inWindow = (frequency: JobFrequency, date: CivilDate): boolean =>
  frequency !== "yearly" || date.slice(5, 7) === "01";

/**
 * Whether `date` is the last day a job of this frequency may run in its
 * period: Sunday of the ISO week, the last day of the month or the quarter,
 * and the 31st of January for a yearly one (its window). A warning that could
 * not be checked until then says so on that day, and never later (review of
 * PR #109, avisos B2).
 */
export const lastDayOfWindow = (frequency: JobFrequency, date: CivilDate): boolean =>
  frequency === "yearly"
    ? date.slice(5) === "01-31"
    : periodOf(frequency, addDays(date, 1)) !== periodOf(frequency, date);

/** The shape of every period this module writes, to say one back only when it is one. */
export const PERIOD_SHAPE =
  /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?|-W(0[1-9]|[1-4]\d|5[0-3])|-Q[1-4])?$/;
