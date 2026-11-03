// What the two long-run what-ifs of the Cartera (the projection and the total cost) share: the
// assumptions are typed on the screen and kept there (nothing is persisted: they are questions, not
// data), each read the way a Spanish keyboard writes it; a missing piece is said, never filled in.

import { Decimal } from "@atlas/domain";
import { parseDecimalInput, parseIntegerInput } from "../../format/input.js";

export const DEFAULT_YEARS = "20";
/** Each year is twelve steps of a calculation that runs on every key: the horizon has a ceiling. */
export const MAX_YEARS = 100;

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export const yearsOf = (raw: string): Parsed<number> => {
  const parsed = parseIntegerInput(raw);
  if (!parsed.ok) {
    return parsed;
  }
  const years = Number(parsed.value);
  return years < 1 || years > MAX_YEARS
    ? { ok: false, message: `Entre 1 y ${MAX_YEARS} años.` }
    : { ok: true, value: years };
};

export const decimalOf = (raw: string): Parsed<Decimal> => {
  const parsed = parseDecimalInput(raw);
  return parsed.ok ? { ok: true, value: Decimal.parse(parsed.value) } : parsed;
};

const SETTINGS: Record<string, string> = {
  monthly_contribution: "la aportación mensual",
  bucket_pct: "el porcentaje del cubo",
  commission: "la comisión por aportación",
  exit_tax: "el tipo de salida",
};

export const GAPS: Record<string, string> = {
  partial: "falta un precio de la cartera principal",
  no_targets: "no hay pesos objetivo en Configuración",
  targets_not_100: "los pesos objetivo no suman 100",
  missing_settings: "faltan ajustes",
  no_ter: "ningún activo valorado declara su TER",
};

/** What the contribution of each month is made of: without it the figures count it as zero. */
export const CONTRIBUTION_KEYS: readonly string[] = ["monthly_contribution", "bucket_pct"];

export const missingPhrase = (missing: readonly string[]): string | undefined =>
  missing.length === 0
    ? undefined
    : `falta ${missing.map((key) => SETTINGS[key] ?? key).join(" y ")}${
        missing.some((key) => CONTRIBUTION_KEYS.includes(key)) ? " en Configuración" : ""
      }`;

export const missingSentence = (missing: readonly string[]): string | undefined => {
  const phrase = missingPhrase(missing);
  return phrase === undefined ? undefined : `${phrase[0]?.toUpperCase()}${phrase.slice(1)}.`;
};
