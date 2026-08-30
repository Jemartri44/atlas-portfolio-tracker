// Calendar arithmetic of the synthetic scenario: months counted from a fixed
// start, dates as YYYY-MM-DD, everything in UTC so no zone can shift a day.

import type { CivilDate } from "../dates/civil-date.js";

const pad = (value: number): string => String(value).padStart(2, "0");

export const dateOf = (year: number, month: number, day: number): CivilDate =>
  `${year}-${pad(month)}-${pad(day)}`;

/** `index` months after the scenario start (2026-09 is index 0). */
export const monthAt = (index: number, startYear = 2026, startMonth = 9) => {
  const total = startYear * 12 + (startMonth - 1) + index;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
};

export const addDays = (date: CivilDate, days: number): CivilDate =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
