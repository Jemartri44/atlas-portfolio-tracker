// The projection of the core as the screen shows it: the scenarios the owner writes, read into
// assumptions for `projection`, and its result as plain data.

import { addYears, type Decimal, EUR, Money } from "@atlas/domain";
import type {
  ProjectionAssumptions,
  Projection as ProjectionResult,
} from "@atlas/domain/portfolio";
import { valueLabel } from "../../format/labels.js";
import { formatDecimalString } from "../../format/number.js";
import { numberOrNull, secondsOf, stringOrUndefined } from "../series.js";
import { DEFAULT_YEARS, decimalOf, GAPS, missingPhrase, yearsOf } from "./long-run.js";

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
  const years = yearsOf(inputs.years);
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
          years: years.value,
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

/** What the card draws: a line per scenario that has a figure, and what was contributed. */
export interface ProjectionPlot {
  /** Seconds since the epoch of each year of the horizon, counted from the date asked about. */
  x: number[];
  /** The scenarios that have a figure, then what was contributed. */
  labels: string[];
  values: (number | null)[][];
  /** Rows of the equivalent table, in the same order as `values`. */
  rows: { date: string; values: (string | undefined)[] }[];
}

export interface ProjectionView {
  /** Why there is no projection at all, when there is none: everything that is missing. */
  gap?: string;
  start?: Money;
  monthly?: Money;
  years: number;
  scenarios: ScenarioView[];
  /** The goal, an amount: shown with the privacy mask like any other. */
  goalAmount?: Money;
  plot?: ProjectionPlot;
}

/** The reasons the domain gives for not projecting, with what each one lacks. */
const gapOf = (result: ProjectionResult): string | undefined => {
  const reasons = [
    ...(result.gap === undefined || result.gap === "missing_settings"
      ? []
      : [
          result.gap === "targets_not_100"
            ? `los pesos objetivo suman ${formatDecimalString(result.target_total_pct.toString())} y tienen que sumar 100`
            : (GAPS[result.gap] ?? result.gap),
        ]),
    ...(missingPhrase(result.missing) === undefined
      ? []
      : [missingPhrase(result.missing) as string]),
  ];
  return reasons.length === 0 ? undefined : reasons.join("; ");
};

/** In what time a goal is reached, in words: «en 5 meses», «en 1 año», «en 3 años y 2 meses». */
export const goalText = (goal: ScenarioView["goal"]): string => {
  if (goal === "now") {
    return "ya lo tienes";
  }
  if (goal === "never" || goal === undefined) {
    return "no se alcanza en el horizonte";
  }
  const years = Math.floor(goal / 12);
  const months = goal % 12;
  const parts = [
    ...(years === 0 ? [] : [years === 1 ? "1 año" : `${years} años`]),
    ...(months === 0 ? [] : [months === 1 ? "1 mes" : `${months} meses`]),
  ];
  return `en ${parts.join(" y ")}`;
};

const plotOf = (result: ProjectionResult, asOf: string): ProjectionPlot | undefined => {
  const drawn = result.scenarios.filter((scenario) => scenario.points !== undefined);
  const first = drawn[0]?.points;
  if (first === undefined) {
    return undefined;
  }
  const dates = first.map((point) => addYears(asOf, point.year));
  return {
    x: dates.map((date) => secondsOf(date)),
    labels: [...drawn.map((scenario) => scenario.name), "Aportado"],
    values: [
      ...drawn.map((scenario) =>
        (scenario.points ?? []).map((point) => numberOrNull(point.value_eur)),
      ),
      // What goes in does not depend on what it earns: the same line for every scenario.
      first.map((point) => numberOrNull(point.contributed_eur)),
    ],
    rows: first.map((point, at) => ({
      date: dates[at] as string,
      values: [
        ...drawn.map((scenario) => stringOrUndefined(scenario.points?.[at]?.value_eur)),
        stringOrUndefined(point.contributed_eur),
      ],
    })),
  };
};

export const projectionView = (
  result: ProjectionResult,
  asOf: string,
  goal?: Decimal,
): ProjectionView => {
  const gap = gapOf(result);
  const plot = plotOf(result, asOf);
  return {
    years: result.years,
    ...(gap === undefined ? {} : { gap }),
    ...(result.start_eur === undefined ? {} : { start: result.start_eur }),
    monthly: result.monthly_core_eur,
    ...(goal === undefined ? {} : { goalAmount: Money.of(goal, EUR) }),
    ...(plot === undefined ? {} : { plot }),
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
        ...(goal !== undefined && scenario.points !== undefined
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
  };
};
