// Reading what the user **types**, the way a Spanish keyboard writes it.
//
// The ledger stores `1200.50`; the user writes `1.200,50`. Replacing the first
// comma by a point turned that into `1.200.50`, which the domain refused with
// "el campo amount de buy no es válido" — so the most natural way of writing an
// amount in Spanish was the one the application did not accept. The rule, all
// of it here and nowhere else:
//
//   1. With a comma, the comma is the decimal separator and the dots group
//      thousands: `1.200,50`, `12.345.678,9`, `0,5`.
//   2. Without a comma, dots in groups of three are thousands: `1.200`,
//      `12.345.678`.
//   3. Anything else with a dot (`1.5`, `1234.5`) is **ambiguous** and refused
//      with a sentence that says how to write it. Guessing would be worse: an
//      amount read a thousand times too big is recorded without complaint.
//
// Pure functions, no DOM: the forms, the configuration screen, the corporate
// actions and the transfer simulator all read numbers through here.

export type ParsedNumber = { ok: true; value: string } | { ok: false; message: string };

/** How a number is written, said once so every message says it the same way. */
export const HOW_TO_WRITE =
  "Escríbelo con coma decimal, y los miles con punto si quieres: 1.200,50.";

const DIGITS = /^\d+$/;
const THOUSANDS = /^\d{1,3}(?:\.\d{3})+$/;

/** Spaces of any kind go: a pasted "1 200,50" is still a number. */
const compact = (raw: string): string => raw.replace(/[\s\u00a0\u202f]/g, "");

/** `007` is `7`: the domain's decimal pattern is strict and a zero pad is noise. */
const unpadded = (digits: string): string => digits.replace(/^0+(?=\d)/, "");

const refused = (message: string): ParsedNumber => ({ ok: false, message });

/** A decimal number as typed, to the decimal string the ledger stores. */
export const parseDecimalInput = (raw: string): ParsedNumber => {
  const text = compact(raw);
  const negative = /^[-−]/.test(text);
  const body = text.replace(/^[-+−]/, "");
  const sign = negative ? "-" : "";
  const [whole = "", fraction, extra] = body.split(",");
  if (extra !== undefined) {
    return refused(`No es un número: tiene más de una coma. ${HOW_TO_WRITE}`);
  }
  const plainWhole = DIGITS.test(whole)
    ? whole
    : THOUSANDS.test(whole)
      ? whole.replaceAll(".", "")
      : undefined;
  if (fraction !== undefined) {
    return plainWhole !== undefined && DIGITS.test(fraction)
      ? { ok: true, value: `${sign}${unpadded(plainWhole)}.${fraction}` }
      : refused(`No es un número. ${HOW_TO_WRITE}`);
  }
  if (plainWhole !== undefined) {
    return { ok: true, value: `${sign}${unpadded(plainWhole)}` };
  }
  if (/^\d+\.\d+$/.test(body)) {
    return refused(
      `Con un punto no se sabe si son decimales o miles. Si son decimales, escribe ${body.replace(".", ",")}; si son miles, agrúpalos de tres en tres: 1.500.`,
    );
  }
  return refused(`No es un número. ${HOW_TO_WRITE}`);
};

/** A whole number (days of a horizon): digits, thousands allowed, nothing else. */
export const parseIntegerInput = (raw: string): ParsedNumber => {
  const text = compact(raw);
  if (DIGITS.test(text) || THOUSANDS.test(text)) {
    return { ok: true, value: unpadded(text.replaceAll(".", "")) };
  }
  return refused("Tiene que ser un número entero, sin decimales: por ejemplo, 90.");
};

/**
 * The value of the ledger written back the way the user would type it, for a
 * form that is filled with what an event already says: `1.0672` → `1,0672`.
 * Without it, correcting an event would show point decimals that the rule above
 * refuses as ambiguous.
 */
export const decimalForInput = (value: string): string => value.replace(".", ",");
