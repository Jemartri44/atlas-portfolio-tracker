// The small words the two catalogues put around a detail of the domain.
//
// A detail arrives as the domain writes it — `2027-01-31`, `-6.59`, `amount`,
// `buy` — and a message is read by a person: `31/01/2027`, `−6,59 pp`,
// «Importe», «compra». Each helper takes `unknown` because that is what a
// detail is, and anything it does not recognise comes back as its own text, so
// a new detail is never swallowed.
//
// None of them touches an amount or a quantity: those go through
// `format/privacy.ts`, which is what the privacy mode relies on.

import { isCivilDate } from "@atlas/domain";
import { formatDate } from "../date.js";
import { eventLabel, fieldLabel, settingLabel, valueLabel } from "../labels.js";
import { formatDecimalString, NBSP } from "../number.js";

export type Details = Record<string, unknown>;

/** A detail as text; a missing one says so instead of printing "undefined". */
export const text = (value: unknown): string =>
  typeof value === "string" ? value : value === undefined ? "sin dato" : JSON.stringify(value);

export const list = (value: unknown): string =>
  Array.isArray(value) ? value.map((entry) => text(entry)).join(", ") : text(value);

export const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

/** The verb agrees with what is missing: «falta Alpha Spin-off», «faltan A, B». */
export const missingOf = (names: readonly string[]): string =>
  `${names.length === 1 ? "falta" : "faltan"} ${names.join(", ")}`;

/** «Falta el precio de A», «Faltan los precios de A, B»: one price, or several. */
export const pricesOf = (names: readonly string[]): string =>
  `${names.length === 1 ? "Falta el precio" : "Faltan los precios"} de ${names.join(", ")}`;

/** A number the domain wrote with a point, as a Spanish reader writes it. */
const decimal = (value: unknown): string => {
  const raw = text(value);
  return /^[+-]?\d+(\.\d+)?$/.test(raw) ? formatDecimalString(raw) : raw;
};

/** `2027-01-31` → `31/01/2027`. */
export const day = (value: unknown): string => {
  const raw = text(value);
  return isCivilDate(raw) ? formatDate(raw) : raw;
};

/** A percentage the domain wrote as `30.2`: `30,2 %`. */
export const pct = (value: unknown): string => `${decimal(value)}${NBSP}%`;

/** Percentage points with their sign: `−6,59 pp`. */
export const pp = (value: unknown): string => {
  const raw = text(value);
  return /^[+-]?\d+(\.\d+)?$/.test(raw)
    ? `${formatDecimalString(raw, { decimals: 2, signed: true })}${NBSP}pp`
    : raw;
};

/** A plain number of the domain that is not money: a ratio, a threshold, a bound. */
export const num = (value: unknown): string => decimal(value);

/** «Importe»: a field of an event by its name on the form, never its key. */
export const field = (value: unknown): string => {
  const raw = text(value);
  // `effects[0].ratio` names the last segment; the path is the domain's business.
  const last = raw.replace(/^.*[.\]]/, "");
  return `«${fieldLabel(last)}»`;
};

/** «Participaciones» o «Importe en euros»: the alternatives of an either-or rule. */
export const fields = (value: unknown): string =>
  Array.isArray(value) ? value.map((entry) => field(entry)).join(" o ") : field(value);

/** The event types whose Spanish name is feminine, for the article in front of it. */
const FEMININE = new Set([
  "account_created",
  "asset_created",
  "buy",
  "sell",
  "swap",
  "order_placed",
  "cash_withdrawal",
  "standalone_fee",
  "valuation",
  "thesis_opened",
  "thesis_closed",
  "reversal",
]);

/** "una compra", "un dividendo": an event type as a noun inside a sentence. */
export const kind = (value: unknown): string =>
  `${FEMININE.has(text(value)) ? "una" : "un"} ${eventLabel(text(value)).toLowerCase()}`;

/** A value of an enumeration in Spanish: `reverse_split` → «contrasplit». */
export const enumValue = (raw: unknown): string => valueLabel(raw).toLowerCase();

/** A setting by the name the configuration screen gives it. */
export const setting = (key: unknown): string => `«${settingLabel(text(key))}»`;

/** "1 día", "12 días". */
export const days = (value: unknown): string => {
  const raw = text(value);
  return raw === "1" ? "1 día" : `${raw} días`;
};
