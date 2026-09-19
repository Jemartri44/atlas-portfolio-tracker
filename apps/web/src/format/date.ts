// Dates as a Spanish reader expects them (dd/mm/aaaa), from the civil date
// string. The native date inputs keep using YYYY-MM-DD, which is what the
// ledger stores, so nothing has to be parsed back.

import type { CivilDate } from "@atlas/domain";

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

/** An age in days, said the way a person says it. */
export const formatAge = (days: number): string => {
  if (days <= 0) {
    return "hoy";
  }
  if (days === 1) {
    return "ayer";
  }
  if (days < 30) {
    return `hace ${days} días`;
  }
  if (days < 365) {
    const months = Math.round(days / 30);
    return months === 1 ? "hace un mes" : `hace ${months} meses`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? "hace más de un año" : `hace más de ${years} años`;
};

/** Whole days between two civil dates, never negative. */
export const daysSince = (from: CivilDate, to: CivilDate): number => {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
};

/** `2026-09-18T20:15:00.000Z` → `18/09/2026`, for an export timestamp. */
export const formatInstantDate = (instant: string): string => {
  const date = instant.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatDate(date) : instant;
};
