// Dates as a Spanish reader expects them (dd/mm/aaaa), from the civil date
// string. The native date inputs keep using YYYY-MM-DD, which is what the
// ledger stores, so nothing has to be parsed back.

import { type CivilDate, madridDateOf } from "@atlas/domain";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** `2027-01-12` → `12/01/2027`. */
export const formatDate = (date: CivilDate): string => {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
};

/** `2027-01-12` → `12 de enero de 2027`, for a heading or a single figure. */
export const formatLongDate = (date: CivilDate): string => {
  const [year, month, day] = date.split("-");
  const index = Number.parseInt(month ?? "1", 10) - 1;
  return `${Number.parseInt(day ?? "1", 10)} de ${MONTHS[index] ?? month} de ${year}`;
};

/** `2027-01-12` → `enero`: the month a contribution belongs to. */
export const formatMonth = (date: CivilDate): string => {
  const month = date.split("-")[1] ?? "01";
  return MONTHS[Number.parseInt(month, 10) - 1] ?? month;
};

/**
 * `2026-09-18T20:15:00.000Z` → `18/09/2026`, for an export timestamp. The day is the
 * one in Madrid, as everywhere else in the application: 22:30 UTC on the 22nd is the 23rd there.
 */
export const formatInstantDate = (instant: string): string => {
  try {
    return formatDate(madridDateOf(instant));
  } catch {
    return instant;
  }
};
