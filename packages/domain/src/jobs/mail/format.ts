// How the mail writes what it may write (feature 016; `contracts/mail.md`):
// Spanish figures, a comma for the decimals and a point for the thousands.
// Only percentages, counts and dates go out with the switch off; euros only
// through `euros`, which only the redaction calls when the switch is on.

import type { Decimal } from "../../money/decimal.js";
import type { Money } from "../../money/money.js";
import type { AssetClass } from "../../schema/events.js";

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

/** `2026-10` → `octubre de 2026`. */
export const monthName = (period: string): string =>
  `${MONTHS[Number(period.slice(5, 7)) - 1]} de ${period.slice(0, 4)}`;

const grouped = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** A decimal with exactly `decimals` digits after the comma, Spanish style, with its sign. */
const spanish = (value: Decimal, decimals: number): string => {
  const rounded = value.round(decimals);
  const [whole, fraction = ""] = rounded.abs().toString().split(".");
  const sign = rounded.isNegative() ? "-" : "";
  return `${sign}${grouped(whole as string)},${fraction.padEnd(decimals, "0")}`;
};

/** `62.5` → `62,5 %`. */
export const percent = (value: Decimal): string => `${spanish(value, 1)} %`;

/** `1000` → `1.000,00 €`. Only with the switch on. */
export const euros = (value: Money): string => `${spanish(value.amount, 2)} €`;

/** A count with its thousands point. */
export const count = (value: number): string => grouped(String(value));

export const CLASS_NAMES: Readonly<Record<AssetClass, string>> = {
  equity: "Renta variable",
  fixed_income: "Renta fija",
  gold: "Oro",
  crypto: "Cripto",
};
