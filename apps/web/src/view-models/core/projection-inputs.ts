// The assumptions of the projection as the screen holds them: typed in Spanish, read into what the
// owner changed. A value equal to the starting one is not an edit, so the yearly update of those
// figures reaches it.

import { Decimal, type ValidationError } from "@atlas/domain";
import {
  type ClassEdit,
  DEFAULT_PROJECTION_YEARS,
  MAX_HORIZON_YEARS,
  PROJECTION_START,
  type ProjectionEdits,
  projectionAssumptions,
  validateProjection,
} from "@atlas/domain/portfolio";
import { parseDecimalInput, parseIntegerInput } from "../../format/input.js";
import { formatDecimalString } from "../../format/number.js";

export const PROJECTION_CLASSES = ["equity", "fixed_income", "gold", "crypto"] as const;
type ProjectionClass = (typeof PROJECTION_CLASSES)[number];

const JPM = "J.P. Morgan 2027 · datos a 30/09/2026";
const IN_EUROS = `${JPM} · en euros`;
export const CLASS_SOURCES: Record<ProjectionClass, string> = {
  equity: IN_EUROS,
  fixed_income: IN_EUROS,
  gold: IN_EUROS,
  crypto: `${JPM} · bitcoin, en dólares · caso malo −11,2 %, bueno 16,6 %`,
};

/** By the field of the stored object: `years`, `monthly_eur`, `equity.return_pct`… as typed. */
export type ProjectionInputs = Record<string, string>;

const shown = (value: Decimal | undefined): string =>
  value === undefined ? "" : formatDecimalString(value.toString(), { grouped: false });

export const inputsOf = (edits: ProjectionEdits, monthly: Decimal): ProjectionInputs => {
  const assumptions = projectionAssumptions(edits);
  const inputs: ProjectionInputs = {
    years: String(assumptions.years),
    monthly_eur: shown(assumptions.monthlyEur ?? monthly),
    inflation_pct: shown(assumptions.inflationPct),
    commission_pct: shown(assumptions.commissionPct),
  };
  for (const name of PROJECTION_CLASSES) {
    inputs[`${name}.return_pct`] = shown(assumptions.classes[name].returnPct);
    inputs[`${name}.volatility_pct`] = shown(assumptions.classes[name].volatilityPct);
  }
  return inputs;
};

export interface ReadProjection {
  /** Absent while a field does not read. */
  edits?: ProjectionEdits;
  /** The sentence of each field that does not read, by field. */
  errors: Record<string, string>;
}

const OUT_OF_RANGE = "Fuera de rango.";

export const readProjection = (inputs: ProjectionInputs, monthly: Decimal): ReadProjection => {
  const errors: Record<string, string> = {};
  /** The canonical text of a decimal field, or nothing when it is empty or equal to `start`. */
  const edited = (field: string, start: Decimal | undefined): string | undefined => {
    const raw = inputs[field] ?? "";
    if (raw.trim() === "") {
      return undefined;
    }
    const read = parseDecimalInput(raw);
    if (!read.ok) {
      errors[field] = read.message;
      return undefined;
    }
    return start !== undefined && Decimal.parse(read.value).eq(start) ? undefined : read.value;
  };
  const edits: ProjectionEdits = {};
  const years = parseIntegerInput(inputs.years ?? "");
  if (!years.ok) {
    errors.years = years.message;
  } else if (Number(years.value) !== DEFAULT_PROJECTION_YEARS) {
    edits.years = Number(years.value);
  }
  const monthlyEur = edited("monthly_eur", monthly);
  if (monthlyEur !== undefined) {
    edits.monthly_eur = monthlyEur;
  }
  const inflation = edited("inflation_pct", PROJECTION_START.inflationPct);
  if (inflation !== undefined) {
    edits.inflation_pct = inflation;
  }
  const commission = edited("commission_pct", undefined);
  if (commission !== undefined) {
    edits.commission_pct = commission;
  }
  const classes: NonNullable<ProjectionEdits["classes"]> = {};
  for (const name of PROJECTION_CLASSES) {
    const start = PROJECTION_START.classes[name];
    const edit: ClassEdit = {};
    const returnPct = edited(`${name}.return_pct`, start.returnPct);
    const volatilityPct = edited(`${name}.volatility_pct`, start.volatilityPct);
    if (returnPct !== undefined) {
      edit.return_pct = returnPct;
    }
    if (volatilityPct !== undefined) {
      edit.volatility_pct = volatilityPct;
    }
    if (Object.keys(edit).length > 0) {
      classes[name] = edit;
    }
  }
  if (Object.keys(classes).length > 0) {
    edits.classes = classes;
  }
  if (Object.keys(errors).length > 0) {
    return { errors };
  }
  try {
    validateProjection({ projection_format: 1, ...edits });
  } catch (failure) {
    const { reason, field } = (failure as ValidationError).details as {
      reason: string;
      field?: string;
    };
    return {
      errors: {
        [field ?? "years"]:
          reason === "years" ? `Entre 1 y ${MAX_HORIZON_YEARS} años.` : OUT_OF_RANGE,
      },
    };
  }
  return { edits, errors };
};

/** What the owner has to know of a stored object that could not be used, if anything. */
export const notReadSentence = (state: {
  kind: string;
  unreadable?: boolean;
}): string | undefined => {
  if (state.kind === "failed") {
    return "No se han podido leer los supuestos guardados: ves los de partida y lo que cambies no se guarda.";
  }
  return state.unreadable === true
    ? "Los supuestos guardados no se pueden leer: ves los de partida, y lo que cambies los sustituye."
    : undefined;
};
