// Business dates (`trade_date`, `value_date`, `acquisition_date`…) are calendar
// dates without time zone, serialised as YYYY-MM-DD (data-schema.md §2).

import { ValidationError } from "../errors.js";

export type CivilDate = string;

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export const daysInMonth = (year: number, month: number): number =>
  month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] as number);

export const isCivilDate = (value: unknown): value is CivilDate => {
  if (typeof value !== "string") {
    return false;
  }
  const match = PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
};

export const assertCivilDate = (value: unknown, field: string): CivilDate => {
  if (!isCivilDate(value)) {
    throw new ValidationError("invalid_date", `${field} must be a valid YYYY-MM-DD date`, {
      field,
      value,
    });
  }
  return value;
};

/** Lexicographic order is chronological order for YYYY-MM-DD. */
export const compareCivilDates = (left: CivilDate, right: CivilDate): number => {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
};

export const yearOf = (date: CivilDate): number => Number(date.slice(0, 4));

/** Days since the epoch for a civil date: UTC midnight, so no zone can shift the day. */
const epochDayOf = (date: CivilDate): number =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) /
  86_400_000;

/** `to − from`, in whole days; negative when `to` precedes `from`. */
export const daysBetween = (from: CivilDate, to: CivilDate): number =>
  epochDayOf(to) - epochDayOf(from);

export const addDays = (date: CivilDate, days: number): CivilDate =>
  new Date((epochDayOf(date) + days) * 86_400_000).toISOString().slice(0, 10);

/** Saturday or Sunday: the ECB publishes no reference rate (data-schema.md §4). */
export const isWeekend = (date: CivilDate): boolean => {
  const weekday = (((epochDayOf(date) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
  return weekday === 0 || weekday === 6;
};

/**
 * Last working day on or before `date`: on a day the ECB does not publish, the
 * last published rate applies (ADR-0013). TARGET holidays are not known until
 * `reference/ecb/` exists (round 6), so only weekends are rolled back.
 */
export const lastWorkingDay = (date: CivilDate): CivilDate =>
  isWeekend(date) ? lastWorkingDay(addDays(date, -1)) : date;
