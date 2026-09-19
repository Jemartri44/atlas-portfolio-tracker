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
//
// The **prose** of a warning or an error is the other door, and it is in
// `format/privacy.ts`: this one may not be imported from there, so the two
// share the mask and nothing else.

import type { Money, Quantity } from "@atlas/domain";

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

import { formatDecimalString, formatQuantityString, NBSP } from "./number.js";
import { MASK } from "./privacy.js";

/** The mask, re-exported: this is the module every figure of a screen goes through. */
export { MASK };

/**
 * How a currency is written after its figure: the euro with its sign, as
 * Spanish typography does ("1.234,56 €"), every other one with its ISO code
 * ("123,49 USD"), which is less ambiguous than a sign shared by several
 * countries (brief §8).
 */
export const currencyUnit = (currency: string): string => (currency === "EUR" ? "€" : currency);

/** An amount, already rounded to the requested decimals, in Spanish notation, without its unit. */
export const formatMoneyNumber = (value: Money, format: AmountFormat = {}): string =>
  formatDecimalString(value.amount.toString(), {
    decimals: format.decimals ?? 2,
    ...(format.signed === undefined ? {} : { signed: format.signed }),
  });

/** An amount with its unit, the two joined by a non-breaking space. */
export const formatMoney = (value: Money, format: AmountFormat = {}): string => {
  const body = formatMoneyNumber(value, format);
  return format.currency === false ? body : `${body}${NBSP}${currencyUnit(value.currency)}`;
};

/** A quantity of units: up to eight decimals, trailing zeros trimmed (fractions are real). */
export const formatQuantity = (value: Quantity, decimals = 8): string =>
  formatQuantityString(value.toString(), decimals);

/** A unit price: four decimals, which is what a NAV needs. */
export const formatUnitValue = (value: Money, decimals = 4): string =>
  formatMoney(value, { decimals });

/** Which of the three things the gate paints. */
export type AmountState = "nodata" | "masked" | "value";

export interface AmountDisplay {
  state: AmountState;
  /** The figure, the mask, or "sin dato": exactly what is written first. */
  text: string;
  /**
   * The unit written after it — "€", "USD", "part." — or empty. It survives
   * the mask: it says what kind of figure is hidden, never how big (D2).
   */
  unit: string;
  /** Classes of the `<span>`, the semantic one first. */
  class: string;
  /** Accessible label; empty when the figure speaks for itself. */
  label: string;
}

export interface AmountInput {
  /**
   * The formatted figure, without its unit, or `undefined` when there is
   * none: `undefined` is "sin dato" and **never** a zero (constitution V).
   */
  formatted: string | undefined;
  /** The unit of the figure: a currency already written ("€", "USD"), or a measure. */
  unit?: string | undefined;
  /** Privacy mode, on by default (FR-021). */
  privacy: boolean;
  /** What is being shown, for the accessible label. */
  kind: "importe" | "cantidad";
  /** Sign class, when the caller asked for colour by sign. */
  sign?: string | undefined;
  /** Extra classes of the caller, for its own layout. */
  extra?: string | undefined;
  /** Why the figure is missing, when it is. */
  missingReason?: string | undefined;
}

const classes = (...names: readonly (string | undefined)[]): string =>
  names.filter((name) => name !== undefined && name !== "").join(" ");

/**
 * **The three rules of the gate**, out of the JSX so that a test can reach
 * them. They used to live in `components/Amount.tsx`, where three mutations
 * passed the whole suite: removing the mask altogether, painting a zero where
 * the datum was missing, and losing the privacy default. A rule that survives
 * only because nobody has broken it yet is not a rule.
 *
 * The order is itself a rule: a missing figure reads "sin dato" even in privacy
 * mode (there is nothing to hide), and a known figure is masked whenever
 * privacy is on, whatever else the caller asked for. The mask is always the
 * same four dots, so it measures the same whatever it hides.
 */
export const amountDisplay = (input: AmountInput): AmountDisplay => {
  if (input.formatted === undefined) {
    const reason = input.missingReason === undefined ? "" : `: ${input.missingReason}`;
    return {
      state: "nodata",
      text: NO_DATA,
      unit: "",
      class: classes("num", "nodata", input.extra),
      label: `${input.kind} sin dato${reason}`,
    };
  }
  if (input.privacy) {
    return {
      state: "masked",
      text: MASK,
      unit: input.unit ?? "",
      class: classes("num", "mask", input.extra),
      label: input.kind === "cantidad" ? "cantidad oculta" : "importe oculto",
    };
  }
  return {
    state: "value",
    text: input.formatted,
    unit: input.unit ?? "",
    class: classes("num", input.sign, input.extra),
    label: "",
  };
};
