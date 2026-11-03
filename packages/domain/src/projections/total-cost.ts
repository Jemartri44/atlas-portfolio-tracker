// What the core costs over the long run (specification §6.1): the TER, the commissions and the tax
// friction of selling, projected as euros that never reach the pot.
//
// It is a what-if over **assumptions the owner edits** (return, horizon, commission, exit tax rate),
// built on the current `costSummary`. Core only: the bucket never takes part (constitution III).
// Nothing fiscal reads it, and nothing is estimated silently: without a priced core there is no
// figure, and an assumption that is missing leaves its part out and says so.
//
// Three runs of the same pot: no costs; with the weighted TER; with the TER and the commission on
// each contribution. The difference between consecutive runs is the cost of each.
//
// - **Only the value that declares a TER is projected**: a part with no TER would inherit the
//   average of the others, so it is left out and `ter_missing_eur` says how much (`ter_partial`).
// - The commission is an assumption of the owner. The observed fees cannot stand in for it (they
//   include sales, the invested base does not): without it the commission part has no figure.
// - The tax friction is a flat rate over the gain of the last run against what was put in
//   (`invested_eur` plus the contributions). That base is **historical cost and wrong in both
//   directions**: sales do not subtract their cost (base too high, friction too low) and a position
//   that arrived by transfer has no purchase (base too low, friction too high). It is a rough
//   order of magnitude, never a bound, and never the tax of the tax engine, which is progressive.

import { ValidationError } from "../errors.js";
import { Decimal, HUNDRED } from "../money/decimal.js";
import { EUR, Money } from "../money/money.js";
import type { Settings } from "../settings/settings.js";
import type { CostSummary } from "./costs.js";
import { grow } from "./growth.js";

export const DEFAULT_COST_YEARS = 20;

export interface TotalCostAssumptions {
  years: number;
  /** Nominal annual return before costs, percent. */
  grossReturnPct: Decimal;
  /** Percent taken from each contribution; absent → no commission figure. */
  commissionPct?: Decimal;
  /** Percent of the final gain taken on selling everything; absent → no friction figure. */
  exitTaxPct?: Decimal;
}

export type TotalCostGap =
  /** A core asset held has no price: the pot would be understated. */
  | "partial"
  /** No priced value with a TER to project. */
  | "no_ter";

export interface TotalCost {
  years: number;
  gap?: TotalCostGap;
  /** Pieces the figure lacks, so it is not read as complete. */
  missing: ("monthly_contribution" | "bucket_pct" | "commission" | "exit_tax")[];
  /** Part of the priced value has no TER: it is left out of the projection (`ter_missing_eur`). */
  ter_partial: boolean;
  ter_missing_eur: Money;
  monthly_core_eur: Money;
  end_without_costs_eur?: Money;
  end_net_eur?: Money;
  ter_cost_eur?: Money;
  commission_cost_eur?: Money;
  exit_tax_eur?: Money;
  /** TER + commissions + exit tax (the parts that exist, see `missing`). */
  total_eur?: Money;
}

const eur = (value: Decimal): Money => Money.of(value, EUR);

export const totalCost = (
  summary: CostSummary,
  settings: Settings,
  assumptions: TotalCostAssumptions,
): TotalCost => {
  const { totals } = summary.core;
  if (!Number.isInteger(assumptions.years) || assumptions.years < 0) {
    throw new ValidationError("invalid_horizon", "the horizon is a whole number of years", {
      years: assumptions.years,
    });
  }
  const missing: TotalCost["missing"] = [];

  const contribution =
    settings.monthly_contribution_eur === undefined
      ? undefined
      : Decimal.parse(settings.monthly_contribution_eur);
  if (contribution === undefined) {
    missing.push("monthly_contribution");
  }
  if (settings.bucket_pct_of_contribution === undefined) {
    missing.push("bucket_pct");
  }
  const bucketPct = Decimal.parse(settings.bucket_pct_of_contribution ?? "0");
  const monthly = (contribution ?? Decimal.ZERO).mul(HUNDRED.sub(bucketPct)).div(HUNDRED);

  const base = {
    years: assumptions.years,
    missing,
    ter_partial: totals.ter_partial,
    ter_missing_eur: totals.ter_missing_eur,
    monthly_core_eur: eur(monthly),
  };
  if (totals.partial) {
    return { ...base, gap: "partial" };
  }
  if (totals.weighted_ter === undefined) {
    return { ...base, gap: "no_ter" };
  }

  const commission = assumptions.commissionPct;
  if (commission === undefined) {
    missing.push("commission");
  }
  if (assumptions.exitTaxPct === undefined) {
    missing.push("exit_tax");
  }

  const start = totals.value_eur.amount.sub(totals.ter_missing_eur.amount);
  const common = { start, monthly, years: assumptions.years };
  const last = (annualReturnPct: Decimal, entryFeePct?: Decimal) => {
    const points = grow({ ...common, annualReturnPct, ...(entryFeePct ? { entryFeePct } : {}) });
    return points[points.length - 1] as (typeof points)[number];
  };
  const free = last(assumptions.grossReturnPct);
  const afterTer = last(assumptions.grossReturnPct.sub(totals.weighted_ter));
  const net = last(assumptions.grossReturnPct.sub(totals.weighted_ter), commission);

  const terCost = free.value.sub(afterTer.value);
  const commissionCost = commission === undefined ? undefined : afterTer.value.sub(net.value);
  let total = terCost.add(commissionCost ?? Decimal.ZERO);
  let tax: Decimal | undefined;
  if (assumptions.exitTaxPct !== undefined) {
    // The basis follows the pot: only what was invested in the assets that declare a TER.
    const invested = summary.core.rows
      .filter((row) => row.ter !== undefined && row.value_eur !== undefined)
      .reduce((sum, row) => sum.add(row.invested_eur.amount), Decimal.ZERO);
    const basis = invested.add(net.contributed.sub(start));
    const gain = net.value.sub(basis);
    tax = gain.isPositive() ? gain.mul(assumptions.exitTaxPct).div(HUNDRED) : Decimal.ZERO;
    total = total.add(tax);
  }
  return {
    ...base,
    end_without_costs_eur: eur(free.value),
    end_net_eur: eur(net.value),
    ter_cost_eur: eur(terCost),
    ...(commissionCost === undefined ? {} : { commission_cost_eur: eur(commissionCost) }),
    ...(tax === undefined ? {} : { exit_tax_eur: eur(tax) }),
    total_eur: eur(total),
  };
};
