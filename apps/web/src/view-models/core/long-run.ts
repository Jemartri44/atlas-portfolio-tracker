// What the two long-run what-ifs of the Cartera (the projection and the total cost) share: the
// assumptions are typed on the screen and kept there (nothing is persisted: they are questions, not
// data), each read the way a Spanish keyboard writes it; a missing piece is said, never filled in.

import { Decimal } from "@atlas/domain";
import { parseDecimalInput } from "../../format/input.js";

export const DEFAULT_YEARS = "20";

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

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

export const missingSentence = (missing: readonly string[]): string | undefined =>
  missing.length === 0
    ? undefined
    : `Falta ${missing.map((key) => SETTINGS[key] ?? key).join(" y ")}${
        missing.some((key) => key === "monthly_contribution" || key === "bucket_pct")
          ? " en Configuración"
          : ""
      }.`;
