// Where the core could be in N years under scenarios the owner writes (specification §6.1): the
// pot of today plus the monthly contribution of the settings, grown at the return of each scenario.
//
// - **Core only**: the bucket's share of the contribution is left out and the bucket never takes
//   part (constitution III).
// - The return of a scenario is **per class** of the core, blended with the **target weights** of
//   the settings (the contributions follow them). There is no default: a scenario without the
//   return of a class that has weight has no figure, and says which class is missing.
// - It reads current prices for the starting pot, so with a held asset unpriced there is no
//   figure at all, and with absent settings it says which (`missing`) instead of assuming.
// - The pot of today grows at the return blended with the **target** weights, not with the actual
//   ones: a drifted core is projected as if it were already at target.
// - Informative: nothing fiscal reads it, and it is not a forecast.

import { ValidationError } from "../errors.js";
import { Decimal, HUNDRED } from "../money/decimal.js";
import { EUR, Money } from "../money/money.js";
import type { AssetClass } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { coreMonthlyOf } from "./core-monthly.js";
import { grow, monthsToReach } from "./growth.js";
import type { CoreWeights } from "./weights.js";

export interface Scenario {
  name: string;
  /** Nominal annual percent per class of the core. */
  returnsPct: Partial<Record<AssetClass, Decimal>>;
}

export interface ProjectionAssumptions {
  /** Whole years, 0 or more. */
  years: number;
  scenarios: readonly Scenario[];
  /** A target for the core; the scenario says in which month it is reached, if it is. */
  goalEur?: Decimal;
}

export interface ProjectionPoint {
  year: number;
  value_eur: Money;
  contributed_eur: Money;
}

export interface ScenarioResult {
  name: string;
  /** Classes with target weight and no return in this scenario: no figure without them. */
  missing_returns: AssetClass[];
  blended_return_pct?: Decimal;
  points?: ProjectionPoint[];
  /** Month at which the goal is reached (0 = already); absent if never within the horizon. */
  goal_month?: number;
}

export type ProjectionGap =
  /** A core asset held has no price: the starting pot would be understated. */
  | "partial"
  /** No target weights (or all zero): there is nothing to blend the returns with. */
  | "no_targets"
  /** The target weights of the core do not add up to 100: blending them would renormalise silently. */
  | "targets_not_100"
  /** The contribution or the bucket's share is not in the settings: the pot would be wrong. */
  | "missing_settings";

export interface Projection {
  years: number;
  gap?: ProjectionGap;
  missing: ("monthly_contribution" | "bucket_pct")[];
  monthly_core_eur: Money;
  /** Absent when the core has an unpriced asset. */
  start_eur?: Money;
  /** Sum of the target weights of the core, as found. */
  target_total_pct: Decimal;
  scenarios: ScenarioResult[];
}

const eur = (value: Decimal): Money => Money.of(value, EUR);

export const projection = (
  weights: CoreWeights,
  settings: Settings,
  assumptions: ProjectionAssumptions,
): Projection => {
  if (!Number.isInteger(assumptions.years) || assumptions.years < 0) {
    throw new ValidationError("invalid_horizon", "the horizon is a whole number of years", {
      years: assumptions.years,
    });
  }
  const { monthly, missing } = coreMonthlyOf(settings);
  const base = {
    years: assumptions.years,
    missing,
    monthly_core_eur: eur(monthly),
  };
  const targets = weights.by_class.filter((share) => share.target_pct.isPositive());
  const targetTotal = targets.reduce((sum, share) => sum.add(share.target_pct), Decimal.ZERO);
  const found = { ...base, target_total_pct: targetTotal };
  if (weights.partial) {
    return { ...found, gap: "partial", scenarios: [] };
  }
  const withStart = { ...found, start_eur: weights.total_eur };
  if (!targetTotal.isPositive()) {
    return { ...withStart, gap: "no_targets", scenarios: [] };
  }
  if (!targetTotal.eq(HUNDRED)) {
    return { ...withStart, gap: "targets_not_100", scenarios: [] };
  }
  if (missing.length > 0) {
    return { ...withStart, gap: "missing_settings", scenarios: [] };
  }

  const scenarios = assumptions.scenarios.map((scenario): ScenarioResult => {
    const absent = targets
      .map((share) => share.asset_class)
      .filter((assetClass) => scenario.returnsPct[assetClass] === undefined);
    if (absent.length > 0) {
      return { name: scenario.name, missing_returns: absent };
    }
    const blended = targets
      .reduce(
        (sum, share) =>
          sum.add(share.target_pct.mul(scenario.returnsPct[share.asset_class] as Decimal)),
        Decimal.ZERO,
      )
      .div(HUNDRED);
    const input = {
      start: weights.total_eur.amount,
      monthly,
      annualReturnPct: blended,
      years: assumptions.years,
    };
    const goalMonth =
      assumptions.goalEur === undefined ? undefined : monthsToReach(input, assumptions.goalEur);
    return {
      name: scenario.name,
      missing_returns: [],
      blended_return_pct: blended,
      points: grow(input).map((point) => ({
        year: point.year,
        value_eur: eur(point.value),
        contributed_eur: eur(point.contributed),
      })),
      ...(goalMonth === undefined ? {} : { goal_month: goalMonth }),
    };
  });
  return { ...withStart, scenarios };
};
