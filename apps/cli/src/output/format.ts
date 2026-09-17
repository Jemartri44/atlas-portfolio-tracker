// Cells of the phase-2 tables: percentages, percentage points and euros. One
// definition, so two views never round the same figure differently.

import type { Decimal, Money } from "@atlas/domain";

/** Shown where a figure exists but is unknown, never a zero (constitution V). */
export const DASH = "—";

/** Percentage to two decimals, empty when there is none to show. */
export const pct = (value: Decimal | undefined): string =>
  value === undefined ? "" : `${value.round(2).toString()} %`;

/** Percentage points to two decimals, empty when there are none to show. */
export const pp = (value: Decimal | undefined): string =>
  value === undefined ? "" : value.round(2).toString();

/** Euros to the cent; a dash when the amount is not known. */
export const eur = (value: Money | undefined): string =>
  value === undefined ? DASH : value.roundToCents().amount.toString();
