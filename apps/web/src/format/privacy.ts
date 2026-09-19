// **The privacy mode, for text that is not a figure on its own.**
//
// `components/Amount.tsx` covers every figure a screen *paints*, and the
// architecture test keeps it the only door to `format/money.ts`. What it never
// covered is a figure a message *says*: the domain writes warnings and errors
// as prose, and the catalogues of `format/messages/` used to interpolate the
// amount straight into the sentence. With the mask on, the table said `••••`
// and the warning right under it said "el aporte bruto al cubo (5000 EUR)
// supera el tope de 6000 EUR" (N11 of the review of feature 007).
//
// So the same rule, one layer up: a template never prints a detail of the
// domain by hand, it asks this module for it, and this module decides. Which
// figures are covered is what `docs/specification.md` §9.6 says and what the
// rest of the application already does: **amounts and quantities**, nothing
// else. Percentages, deviations, weights, dates, names, day counts and the
// wash-sale window stay visible, because they are what makes a warning useful
// in public and none of them says how much money there is.
//
// MASK lives here, and not in `format/money.ts`, because the gate may not be
// imported from anywhere else: one mask, two doors that apply it.

import type { NameIndex } from "./names.js";
import { formatDecimalString, formatQuantityString } from "./number.js";

/** Neutral, fixed-width mask. Not the amount's length: that would leak its size. */
export const MASK = "••••";

/** How a message is rendered: with which catalogue of names, and under which mode. */
export interface Prose {
  /** The catalogue, so a message names the asset instead of its identifier. */
  names?: NameIndex | undefined;
  /**
   * Privacy mode. **Required on purpose**: with a default, a screen written in
   * two years by someone who never read this file would silently pick the
   * insecure side of it. Now it does not compile until it has decided.
   */
  privacy: boolean;
}

/** How a message template puts a sensitive figure in a sentence. */
export interface Figures {
  /** An amount in euros: "1.234,56 EUR", or the mask. */
  money: (value: unknown) => string;
  /** A quantity of units: up to eight decimals, trailing zeros trimmed, or the mask. */
  quantity: (value: unknown) => string;
  /** A message of the domain quoted inside ours: see `maskFigures`. */
  evidence: (value: unknown) => string;
}

/** A decimal as the domain writes it in the details of an error or a warning. */
const DECIMAL = /^[+-]?\d+(?:\.\d+)?$/;

const asText = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

/**
 * A message written by the **domain**, in English and with no structure: the
 * fallback of a code no catalogue translates, and the raw evidence of an
 * integrity finding. There is no way to tell which of its numbers is an amount,
 * so with the mask on **every** number goes — fail safe (constitution): losing
 * a line number in a technical detail costs nothing, showing a position in
 * public costs the whole mode.
 *
 * Dates and identifiers survive: a run of digits glued to a letter or a hyphen
 * (`2027-01-31`, `01MBP2GT78JNMNGSE96ZZMH1R7`) is not a figure.
 */
export const maskFigures = (message: string, privacy: boolean): string =>
  privacy ? message.replace(/(?<![\w.-])[+-]?\d+(?:\.\d+)?(?![\w-])/g, MASK) : message;

/**
 * Anything that is not a decimal is **not** an amount and comes through
 * untouched: `invalid_settings` carries whatever the user typed, and masking a
 * misspelt word would hide the very thing the message exists to point at.
 */
export const figuresOf = (privacy: boolean): Figures => ({
  money: (value) => {
    const raw = asText(value);
    if (!DECIMAL.test(raw)) {
      return raw;
    }
    return privacy ? MASK : `${formatDecimalString(raw, { decimals: 2 })} EUR`;
  },
  quantity: (value) => {
    const raw = asText(value);
    if (!DECIMAL.test(raw)) {
      return raw;
    }
    return privacy ? MASK : formatQuantityString(raw);
  },
  evidence: (value) => maskFigures(asText(value), privacy),
});
