// The projection as the screen shows it: the assumptions as typed, read into what the owner changed
// of them, and the result of `projectionCases` as plain data. A value equal to the starting one is
// not an edit, so the yearly update of those figures reaches it.

import { addYears, Decimal, type Money, type ValidationError } from "@atlas/domain";
import {
  type ClassEdit,
  DEFAULT_PROJECTION_YEARS,
  MAX_HORIZON_YEARS,
  PROJECTION_START,
  type ProjectionCases,
  type ProjectionDiscounts,
  type ProjectionEdits,
  projectionAssumptions,
  validateProjection,
} from "@atlas/domain/portfolio";
import { parseDecimalInput, parseIntegerInput } from "../../format/input.js";
import { formatDecimalString } from "../../format/number.js";
import { numberOrNull, secondsOf, stringOrUndefined } from "../series.js";

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

const GAPS: Record<string, string> = {
  partial: "falta un precio de la cartera principal",
  no_targets: "no hay pesos objetivo en Configuración",
  targets_not_100: "los pesos objetivo no suman 100",
  missing_settings: "falta la aportación mensual en Configuración",
};

/** What the card draws: the band, the normal case and what was contributed. */
export interface ProjectionPlot {
  /** Seconds since the epoch of each year of the horizon, counted from the date asked about. */
  x: number[];
  low: (number | null)[];
  normal: (number | null)[];
  high: (number | null)[];
  contributed: (number | null)[];
  /** Rows of the equivalent table: pessimistic, normal, optimistic and contributed. */
  rows: { date: string; values: (string | undefined)[] }[];
}

export interface ProjectionCaseView {
  label: string;
  value: Money;
  fees: Money;
  tax: Money;
}

export interface ProjectionView {
  /** Why there is no figure, when there is none. */
  gap?: string;
  years: number;
  start?: Money;
  cases: ProjectionCaseView[];
  /** The sentence of what the figures have discounted. */
  discounted: string;
  /** Part of the core declares no TER: the TER does not reach it. */
  terMissing?: Money;
  plot?: ProjectionPlot;
}

const listed = (parts: readonly string[]): string =>
  parts.length < 2
    ? (parts[0] as string)
    : `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;

const discountedSentence = (result: ProjectionCases, discounts: ProjectionDiscounts): string => {
  const ter =
    result.ter_pct === undefined
      ? undefined
      : `TER ${formatDecimalString(result.ter_pct.toString(), { decimals: 2 })} %`;
  const commission = result.missing.includes("commission") ? undefined : "comisión de aportación";
  const fees = [ter, commission].filter((part) => part !== undefined);
  const parts = [
    ...(discounts.inflation ? ["inflación"] : []),
    ...(discounts.taxes ? ["impuestos al vender (escala del ahorro)"] : []),
    ...(discounts.fees && fees.length > 0 ? [fees.join(" más ")] : []),
  ];
  return parts.length === 0
    ? "Sin descontar nada."
    : `Descontado: ${listed(parts)}. Es una estimación informativa.`;
};

const plotOf = (result: ProjectionCases, asOf: string): ProjectionPlot => {
  const dates = result.points.map((point) => addYears(asOf, point.year));
  return {
    x: dates.map((date) => secondsOf(date)),
    low: result.points.map((point) => numberOrNull(point.low_eur)),
    normal: result.points.map((point) => numberOrNull(point.normal_eur)),
    high: result.points.map((point) => numberOrNull(point.high_eur)),
    contributed: result.points.map((point) => numberOrNull(point.contributed_eur)),
    rows: result.points.map((point, at) => ({
      date: dates[at] as string,
      values: [point.low_eur, point.normal_eur, point.high_eur, point.contributed_eur].map(
        stringOrUndefined,
      ),
    })),
  };
};

export const projectionView = (
  result: ProjectionCases,
  asOf: string,
  discounts: ProjectionDiscounts,
): ProjectionView => {
  const base = {
    years: result.years,
    cases: [],
    discounted: "",
    ...(result.start_eur === undefined ? {} : { start: result.start_eur }),
  };
  if (result.gap !== undefined || result.ends === undefined) {
    return { ...base, gap: GAPS[result.gap as string] ?? "faltan datos" };
  }
  const { low, normal, high } = result.ends;
  const caseOf = (label: string, end: typeof low): ProjectionCaseView => ({
    label,
    value: end.value_eur,
    fees: end.fees_eur,
    tax: end.tax_eur,
  });
  return {
    ...base,
    cases: [caseOf("Pesimista", low), caseOf("Normal", normal), caseOf("Optimista", high)],
    discounted: discountedSentence(result, discounts),
    ...(result.ter_partial ? { terMissing: result.ter_missing_eur } : {}),
    plot: plotOf(result, asOf),
  };
};
