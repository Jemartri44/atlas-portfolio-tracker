// **The privacy gate.** Every amount and every quantity of the application is
// formatted here, and the architecture test (`tests/architecture.test.ts`)
// fails if any file other than `components/Amount.tsx` imports this module. It
// is the same mechanism that guards the price gate of the domain, and the
// reason the rule will still be alive in two years: it does not depend on
// anybody remembering it (decision (d), prompt §3.4).
//
// Q6: the mask covers **amounts and quantities**, as `docs/specification.md`
// §9.6 demands — twelve units of a fund with a public price give the amount
// away just as well as the amount. Percentages, weights, deviations, dates and
// text stay visible and live in `format/number.ts`, which is not gated.

import type { Money, Quantity } from "@atlas/domain";

/** Neutral, fixed-width mask. Not the amount's length: that would leak its size. */
export const MASK = "••••";

/** Shown where a figure exists but is not known. Never a zero (constitution V). */
export const NO_DATA = "sin dato";

export interface AmountFormat {
  /** Decimals; euros default to two, the cent (ADR-0005 rounds once, at the output). */
  decimals?: number;
  /** Always show the sign: a gain reads as a gain without relying on colour. */
  signed?: boolean;
  /** Add the currency after the figure. */
  currency?: boolean;
}

import { formatDecimalString } from "./number.js";

/** An amount, already rounded to the requested decimals, in Spanish notation. */
export const formatMoney = (value: Money, format: AmountFormat = {}): string => {
  const decimals = format.decimals ?? 2;
  const body = formatDecimalString(value.amount.toString(), {
    decimals,
    ...(format.signed === undefined ? {} : { signed: format.signed }),
  });
  return format.currency === false ? body : `${body} ${value.currency}`;
};

/** A quantity of units: up to eight decimals, trailing zeros trimmed (fractions are real). */
export const formatQuantity = (value: Quantity, decimals = 8): string => {
  const text = formatDecimalString(value.toString(), { decimals });
  return text.includes(",") ? text.replace(/,?0+$/, "") : text;
};

/** A unit price: four decimals, which is what a NAV needs. */
export const formatUnitValue = (value: Money, decimals = 4): string =>
  formatMoney(value, { decimals });
