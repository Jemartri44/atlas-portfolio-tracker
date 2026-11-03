// Reading what the user **types**, the way a Spanish keyboard writes it.
//
// The decimal separator is the comma, and the dot is never accepted, thousands
// included. A dot is read two ways (`1.234` is one thousand two hundred and
// thirty-four or one and a bit) and the wrong reading is recorded without
// complaint: with quantities of three decimals it is an error of a factor of a
// thousand (`0.500` units became `500`). So a dot is refused, with a sentence
// that says how to write it:
//
//   - `1234`, `1234,5`, `0,500`, `12345678,9` are numbers.
//   - `1.234`, `0.500`, `1.200,50` are refused.
//
// Pure functions, no DOM: the forms, the configuration screen, the corporate
// actions and the transfer simulator all read numbers through here.

type ParsedNumber = { ok: true; value: string } | { ok: false; message: string };

/** How a number is written, said once so every message says it the same way. */
export const HOW_TO_WRITE = "Escríbelo con coma decimal y sin puntos de miles: 1200,50.";

const DIGITS = /^\d+$/;

/** Spaces of any kind go: a pasted "1 200,50" is still a number. */
const compact = (raw: string): string => raw.replace(/[\s\u00a0\u202f]/g, "");

/** `007` is `7`: the domain's decimal pattern is strict and a zero pad is noise. */
const unpadded = (digits: string): string => digits.replace(/^0+(?=\d)/, "");

const notANumber = (body: string): string =>
  body.includes(".")
    ? `No es un número: el punto no se admite, el decimal es la coma. ${HOW_TO_WRITE}`
    : `No es un número. ${HOW_TO_WRITE}`;

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
  if (fraction !== undefined) {
    return DIGITS.test(whole) && DIGITS.test(fraction)
      ? { ok: true, value: `${sign}${unpadded(whole)}.${fraction}` }
      : refused(notANumber(body));
  }
  if (DIGITS.test(whole)) {
    return { ok: true, value: `${sign}${unpadded(whole)}` };
  }
  if (/^\d+\.\d+$/.test(body)) {
    return refused(
      `Con un punto no se sabe si son decimales o miles, y aquí no se admite: el decimal es la coma. Si son decimales, escribe ${body.replace(".", ",")}; si son miles, escribe ${body.replace(".", "")}, sin punto.`,
    );
  }
  return refused(notANumber(body));
};

/** A whole number (days of a horizon): digits, nothing else. */
export const parseIntegerInput = (raw: string): ParsedNumber => {
  const text = compact(raw);
  if (DIGITS.test(text)) {
    return { ok: true, value: unpadded(text) };
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
