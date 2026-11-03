// The projection of the core as the screen shows it: the scenarios the owner writes, read into
// assumptions for `projection`, and its result as plain data.

import type { Decimal, Money } from "@atlas/domain";
import type {
  ProjectionAssumptions,
  Projection as ProjectionResult,
} from "@atlas/domain/portfolio";
import { parseIntegerInput } from "../../format/input.js";
import { valueLabel } from "../../format/labels.js";
import { DEFAULT_YEARS, decimalOf, GAPS, missingSentence } from "./long-run.js";

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
