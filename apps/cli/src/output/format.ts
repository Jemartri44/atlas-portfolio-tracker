// Cells of the phase-2 tables: percentages, percentage points and euros. One
// definition, so two views never round the same figure differently.

import type { Decimal, Money } from "@atlas/domain";

/** Shown where a figure exists but is unknown, never a zero (constitution V). */
export const DASH = "—";

/** Percentage to two decimals; a dash when it is not known, like `eur`. */
export const pct = (value: Decimal | undefined): string =>
  value === undefined ? DASH : `${value.round(2).toString()} %`;

/** Percentage points to two decimals, empty when there are none to show. */
export const pp = (value: Decimal | undefined): string =>
  value === undefined ? "" : value.round(2).toString();

/**
 * Euros **to the cent**, always two decimals; a dash when the amount is not
 * known.
 *
 * Two decimals and not "as many as it has" because a column of amounts that
 * reads `600`, `174.35`, `3.1` is three ways of writing the same kind of
 * figure, and because a tax figure is typed into Renta WEB exactly as it is
 * read here. It used to be copied, with that padding, into four command files
 * under the name `cents` while this one printed the same amount unpadded: the
 * console answered the same question in two shapes on screens the user opens
 * one after the other.
 */
export const eur = (value: Money | undefined): string =>
  value === undefined ? DASH : value.centsText();
