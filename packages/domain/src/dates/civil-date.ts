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

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * Whole calendar months, with the end of month clamped: 31-01 plus one month is
 * 28-02 (29-02 in a leap year), not 03-03. It is the arithmetic the wash-sale
 * window needs (ADR-0014: date to date, never a fixed number of days), and
 * `docs/fiscal-questions.md` #14 records it as the default to confirm with the
 * advisor. Negative counts walk backwards, which is the other half of the
 * window.
 */
export const addMonths = (date: CivilDate, months: number): CivilDate => {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (((total % 12) + 12) % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, "0")}-${pad(targetMonth)}-${pad(targetDay)}`;
};

/** Whole calendar years, with 29-02 clamped to 28-02 in a non-leap year. */
export const addYears = (date: CivilDate, years: number): CivilDate => addMonths(date, years * 12);

/** Saturday or Sunday: the ECB publishes no reference rate (data-schema.md §4). */
export const isWeekend = (date: CivilDate): boolean => {
  const weekday = (((epochDayOf(date) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
  return weekday === 0 || weekday === 6;
};

/**
 * Last working day on or before `date`, rolling back **weekends only**.
 *
 * It stays this way on purpose now that `reference/ecb/` exists (feature 012,
 * ADR-0029). The days the ECB did not publish come from the absence in the
 * official history (`ecb/resolve.ts`), with the TARGET calendar as a
 * cross-check only (`ecb/target.ts`); and the loader keeps rejecting a weekend
 * `fx_rate_date` and nothing more, because validating holidays on load would
 * be a hardening that ADR-0018 no longer admits inside version 1. The callers
 * that date an ECB rate use it for the euro, whose rate of 1 was never
 * published, and for the valuation at 31 December (`rateDayOf`), which the
 * ADR does not touch.
 */
export const lastWorkingDay = (date: CivilDate): CivilDate =>
  isWeekend(date) ? lastWorkingDay(addDays(date, -1)) : date;
