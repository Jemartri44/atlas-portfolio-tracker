// The two long-run what-ifs of the Cartera, as the screens show them: the projection of the core
// under scenarios the owner writes, and what it costs over the years. The assumptions are typed on
// the screen and kept there (nothing is persisted: they are questions, not data); each is read the
// way a Spanish keyboard writes it. The figures are the domain's (`projection`, `totalCost`); a
// missing piece is said, never filled in.

import { Decimal, type Money } from "@atlas/domain";
import type {
  ProjectionAssumptions,
  Projection as ProjectionResult,
  TotalCost,
  TotalCostAssumptions,
} from "@atlas/domain/portfolio";
import { parseDecimalInput, parseIntegerInput } from "../../format/input.js";
import { valueLabel } from "../../format/labels.js";

export const DEFAULT_YEARS = "20";
export const MAX_SCENARIOS = 3;

export interface ScenarioInput {
  name: string;
  /** Percent per class, as typed; empty means the owner has not said. */
  returns: Record<string, string>;
}

export interface ProjectionInputs {
  years: string;
  goal: string;
  scenarios: ScenarioInput[];
}

export const emptyProjectionInputs = (): ProjectionInputs => ({
  years: DEFAULT_YEARS,
  goal: "",
  scenarios: [{ name: "Mi escenario", returns: {} }],
});

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const decimalOf = (raw: string): Parsed<Decimal> => {
  const parsed = parseDecimalInput(raw);
  return parsed.ok ? { ok: true, value: Decimal.parse(parsed.value) } : parsed;
};

export interface ReadProjection {
  assumptions?: ProjectionAssumptions;
  years?: string;
  goal?: string;
  /** Error of the return typed for `[scenario index, class]`. */
  returns: Record<string, string>;
}

/** What the owner typed, as assumptions, or the sentence of each field that does not read. */
export const readProjection = (inputs: ProjectionInputs): ReadProjection => {
  const errors: ReadProjection = { returns: {} };
  const years = parseIntegerInput(inputs.years);
  if (!years.ok) {
    errors.years = years.message;
  }
  let goal: Decimal | undefined;
  if (inputs.goal.trim() !== "") {
    const read = decimalOf(inputs.goal);
    if (!read.ok) {
      errors.goal = read.message;
    } else if (!read.value.isPositive()) {
      errors.goal = "El objetivo tiene que ser mayor que cero.";
    } else {
      goal = read.value;
    }
  }
  const scenarios = inputs.scenarios.map((scenario, index) => {
    const returnsPct: Record<string, Decimal> = {};
    for (const [assetClass, raw] of Object.entries(scenario.returns)) {
      if (raw.trim() === "") {
        continue;
      }
      const read = decimalOf(raw);
      if (read.ok) {
        returnsPct[assetClass] = read.value;
      } else {
        errors.returns[`${index}:${assetClass}`] = read.message;
      }
    }
    return {
      name: scenario.name.trim() === "" ? `Escenario ${index + 1}` : scenario.name,
      returnsPct,
    };
  });
  const bad =
    errors.years !== undefined ||
    errors.goal !== undefined ||
    Object.keys(errors.returns).length > 0;
  return bad || !years.ok
    ? errors
    : {
        ...errors,
        assumptions: {
          years: Number(years.value),
          scenarios,
          ...(goal === undefined ? {} : { goalEur: goal }),
        },
      };
};

const SETTINGS: Record<string, string> = {
  monthly_contribution: "la aportación mensual",
  bucket_pct: "el porcentaje del cubo",
  commission: "la comisión por aportación",
  exit_tax: "el tipo de salida",
};

const GAPS: Record<string, string> = {
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

// ---- Projection ----------------------------------------------------------------------------------

export interface ScenarioView {
  name: string;
  /** Classes whose return the owner has not written: no figure without them. */
  missingReturns: string[];
  blendedPct?: string;
  end?: Money;
  contributed?: Money;
  /** `ya` / the month it is reached / `never` within the horizon / absent without a goal. */
  goal?: "now" | "never" | number;
}

export interface ProjectionView {
  gap?: string;
  missing?: string;
  start?: Money;
  monthly?: Money;
  years: number;
  scenarios: ScenarioView[];
}

export const projectionView = (result: ProjectionResult, hasGoal: boolean): ProjectionView => ({
  years: result.years,
  ...(result.gap === undefined ? {} : { gap: GAPS[result.gap] ?? result.gap }),
  ...(missingSentence(result.missing) === undefined
    ? {}
    : { missing: missingSentence(result.missing) as string }),
  ...(result.start_eur === undefined ? {} : { start: result.start_eur }),
  monthly: result.monthly_core_eur,
  scenarios: result.scenarios.map((scenario) => {
    const last = scenario.points?.at(-1);
    return {
      name: scenario.name,
      missingReturns: scenario.missing_returns.map((assetClass) => valueLabel(assetClass)),
      ...(scenario.blended_return_pct === undefined
        ? {}
        : { blendedPct: scenario.blended_return_pct.toString() }),
      ...(last === undefined
        ? {}
        : {
            end: last.value_eur,
            contributed: last.contributed_eur,
          }),
      ...(hasGoal && scenario.points !== undefined
        ? {
            goal:
              scenario.goal_month === undefined
                ? ("never" as const)
                : scenario.goal_month === 0
                  ? ("now" as const)
                  : scenario.goal_month,
          }
        : {}),
    };
  }),
});

// ---- Total cost -----------------------------------------------------------------------------------

export interface CostInputs {
  years: string;
  grossReturn: string;
  commission: string;
  exitTax: string;
}

export const emptyCostInputs = (): CostInputs => ({
  years: DEFAULT_YEARS,
  grossReturn: "",
  commission: "",
  exitTax: "",
});

export interface ReadCost {
  assumptions?: TotalCostAssumptions;
  errors: Partial<Record<keyof CostInputs, string>>;
}

export const readCost = (inputs: CostInputs): ReadCost => {
  const errors: ReadCost["errors"] = {};
  const years = parseIntegerInput(inputs.years);
  if (!years.ok) {
    errors.years = years.message;
  }
  const optional = (key: "commission" | "exitTax"): Decimal | undefined => {
    if (inputs[key].trim() === "") {
      return undefined;
    }
    const read = decimalOf(inputs[key]);
    if (!read.ok) {
      errors[key] = read.message;
      return undefined;
    }
    if (read.value.isNegative()) {
      errors[key] = "No puede ser negativo.";
      return undefined;
    }
    return read.value;
  };
  const commission = optional("commission");
  const exitTax = optional("exitTax");
  let gross: Decimal | undefined;
  if (inputs.grossReturn.trim() !== "") {
    const read = decimalOf(inputs.grossReturn);
    if (read.ok) {
      gross = read.value;
    } else {
      errors.grossReturn = read.message;
    }
  }
  if (!years.ok || gross === undefined || Object.keys(errors).length > 0) {
    return { errors };
  }
  return {
    errors,
    assumptions: {
      years: Number(years.value),
      grossReturnPct: gross,
      ...(commission === undefined ? {} : { commissionPct: commission }),
      ...(exitTax === undefined ? {} : { exitTaxPct: exitTax }),
    },
  };
};

export interface TotalCostView {
  gap?: string;
  missing?: string;
  /** Part of the priced value has no TER: it is left out, and how much. */
  terMissing?: Money;
  years: number;
  withoutCosts?: Money;
  net?: Money;
  ter?: Money;
  commission?: Money;
  exitTax?: Money;
  total?: Money;
}

export const totalCostView = (result: TotalCost): TotalCostView => ({
  years: result.years,
  ...(result.gap === undefined ? {} : { gap: GAPS[result.gap] ?? result.gap }),
  ...(missingSentence(result.missing) === undefined
    ? {}
    : { missing: missingSentence(result.missing) as string }),
  ...(result.ter_partial ? { terMissing: result.ter_missing_eur } : {}),
  ...(result.end_without_costs_eur === undefined
    ? {}
    : { withoutCosts: result.end_without_costs_eur }),
  ...(result.end_net_eur === undefined ? {} : { net: result.end_net_eur }),
  ...(result.ter_cost_eur === undefined ? {} : { ter: result.ter_cost_eur }),
  ...(result.commission_cost_eur === undefined ? {} : { commission: result.commission_cost_eur }),
  ...(result.exit_tax_eur === undefined ? {} : { exitTax: result.exit_tax_eur }),
  ...(result.total_eur === undefined ? {} : { total: result.total_eur }),
});
