// The contribution of the month, as rows.
//
// The split is the domain's (`contributionPlan`, business rule 2) and it is
// priority 4 of the constitution's test list: nothing about it is recomputed
// here. What this adds is the **names** and the two sentences the screen has to
// say every time — that the bucket share is a budget and not an allocation, and
// that this is a proposal nobody has recorded.

import type { ContributionPlan, Money } from "@atlas/domain";
import { valueLabel } from "../../format/labels.js";
import { displayName, type NameIndex, NO_NAMES } from "../../format/names.js";

export interface ContributionRowView {
  assetId: string;
  name: string;
  assetClass: string;
  targetPct: string;
  value: Money;
  target: Money;
  gap: Money;
  allocation: Money;
  valueAfter: Money;
  weightAfterPct: string;
  /** Nothing to buy here this month: shown, but quietly. */
  idle: boolean;
}

export interface ContributionView {
  date: string;
  amount: Money;
  fromSettings: boolean;
  bucketBudget: Money;
  coreAmount: Money;
  coreValue: Money;
  surplusDistributed: boolean;
  rows: ContributionRowView[];
}

export const contributionView = (
  plan: ContributionPlan,
  names: NameIndex = NO_NAMES,
): ContributionView => ({
  date: plan.date,
  amount: plan.amount_eur,
  fromSettings: plan.amount_origin === "settings",
  bucketBudget: plan.bucket_budget_eur,
  coreAmount: plan.core_amount_eur,
  coreValue: plan.core_value_eur,
  surplusDistributed: plan.surplus_distributed,
  rows: plan.rows.map((row) => ({
    assetId: row.asset_id,
    name: displayName(names, row.asset_id),
    assetClass: valueLabel(row.asset_class),
    targetPct: row.target_pct.toString(),
    value: row.value_eur,
    target: row.target_eur,
    gap: row.gap_eur,
    allocation: row.allocation_eur,
    valueAfter: row.value_after_eur,
    weightAfterPct: row.weight_after_pct.toString(),
    idle: row.allocation_eur.isZero(),
  })),
});
