// The contribution of the month, as rows.
//
// The split is the domain's (`contributionPlan`, business rule 2) and it is
// priority 4 of the constitution's test list: nothing about it is recomputed
// here. What this adds is the **names** and the two sentences the screen has to
// say every time — that the bucket share is a budget and not an allocation, and
// that this is a proposal nobody has recorded.

import { type ContributionPlan, Decimal, Money, type Warning } from "@atlas/domain";
import { parseDecimalInput } from "../../format/input.js";
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
  /**
   * Its share of the part that goes to the core, in percent: what says where
   * the money goes when the amount is hidden. Absent when the core part is zero.
   */
  sharePct?: string;
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
  /** The two parts of the amount as shares of it, in percent; absent with no amount. */
  corePct?: string;
  bucketPct?: string;
  surplusDistributed: boolean;
  rows: ContributionRowView[];
  /** The note of the domain when a weight it used rests on an approximation (P3). */
  approximation?: Warning;
}

const HUNDRED = Decimal.parse("100");

/**
 * `part / whole` in percent, as a decimal string, **never rounded here**: the
 * figure rounds once, when it is shown (ADR-0005). Absent without a whole to
 * divide by: a share of nothing is not zero.
 */
const shareOf = (part: Money, whole: Money): string | undefined =>
  whole.amount.isPositive() ? part.amount.div(whole.amount).mul(HUNDRED).toString() : undefined;

const shares = (plan: ContributionPlan): Pick<ContributionView, "corePct" | "bucketPct"> => {
  const core = shareOf(plan.core_amount_eur, plan.amount_eur);
  const bucket = shareOf(plan.bucket_budget_eur, plan.amount_eur);
  return {
    ...(core === undefined ? {} : { corePct: core }),
    ...(bucket === undefined ? {} : { bucketPct: bucket }),
  };
};

const rowShare = (allocation: Money, core: Money): Pick<ContributionRowView, "sharePct"> => {
  const share = shareOf(allocation, core);
  return share === undefined ? {} : { sharePct: share };
};

const approximationOf = (plan: ContributionPlan): { approximation?: Warning } => {
  const note = plan.warnings.find((warning) => warning.code === "weights_use_approximation");
  return note === undefined ? {} : { approximation: note };
};

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
  ...shares(plan),
  surplusDistributed: plan.surplus_distributed,
  ...approximationOf(plan),
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
    ...rowShare(row.allocation_eur, plan.core_amount_eur),
    idle: row.allocation_eur.isZero(),
  })),
});

/**
 * What the user typed in «Importe de este mes»: nothing (the amount of the
 * settings stands), a valid decimal string for `contributionPlan`'s `amount`,
 * or the sentence that says why it is not one. Never a float: the text goes
 * through the same reading as every typed number, then through `Money`.
 */
export type TypedAmount =
  | { kind: "none" }
  | { kind: "amount"; value: string }
  | { kind: "invalid"; message: string };

export const typedAmount = (raw: string): TypedAmount => {
  if (raw.trim() === "") {
    return { kind: "none" };
  }
  const parsed = parseDecimalInput(raw);
  if (!parsed.ok) {
    return { kind: "invalid", message: parsed.message };
  }
  if (!Money.parse(parsed.value, "EUR").amount.isPositive()) {
    return { kind: "invalid", message: "La aportación tiene que ser mayor que cero." };
  }
  return { kind: "amount", value: parsed.value };
};
