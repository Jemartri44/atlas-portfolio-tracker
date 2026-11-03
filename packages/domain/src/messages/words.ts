// Small phrases several entries share. Pure functions of their arguments and the voice; none
// formats a figure by itself.

import type { Voice } from "./voice.js";

/** A tax year is a name, not a quantity: «2027», never «2.027». */
export const year = (v: Voice, value: unknown): string =>
  /^\d{4}$/.test(String(value)) ? String(value) : v.num(value);

/**
 * The wash-sale window by its real name. Calling a one-year window «the two-month rule» is not a
 * wording slip: it states something fiscally false next to a date that contradicts it.
 */
export const windowText = (v: Voice, window: unknown): string => {
  const value = v.text(window);
  if (value === "2m") {
    return "ventana de dos meses";
  }
  if (value === "1y") {
    return "ventana de un año";
  }
  return `ventana de ${value.slice(0, -1)} días`;
};

/** Why a quote has no value in euros; what to do about it is the remedy of each surface. */
export const fxMissingReason = (reason: unknown): string | undefined => {
  switch (reason) {
    case "not_yet_published":
      return "el BCE aún no ha publicado el tipo de esa fecha";
    case "currency_not_published":
      return "el BCE no publica esa divisa; una subunidad como GBX no es su divisa";
    case "currency_stale":
      return "el BCE dejó de publicar esa divisa";
    default:
      return undefined;
  }
};

/** A phrase that opens a sentence starts with a capital letter. */
export const capital = (phrase: string): string => phrase.charAt(0).toUpperCase() + phrase.slice(1);
