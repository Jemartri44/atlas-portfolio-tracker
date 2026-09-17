// Monthly contribution split (business rule 2, data-schema.md §7, decision (d)
// of prompt 004).
//
// The bucket budget is separated first and never allocated: it is a budget, not
// an allocation (constitution III). The rest goes to the core assets in
// proportion to their shortfall against the target computed on the value after
// the contribution; if the contribution covers every shortfall, the surplus
// goes by target weight. It proposes and never sells (rule 2; selling is an
// annual decision, rule 3) and never writes: the orders are placed by hand.

import type { CivilDate } from "../dates/civil-date.js";
import { ValidationError } from "../errors.js";
import { Decimal } from "../money/decimal.js";
import { Money } from "../money/money.js";
import type { AssetClass, AssetId } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import type { LedgerState, Warning } from "./state.js";
import { coreWeights } from "./weights.js";

const HUNDRED = Decimal.parse("100");
const EUR = "EUR";

export interface ContributionRow {
  asset_id: AssetId;
  asset_class: AssetClass;
  target_pct: Decimal;
  /** Value today, in euros. */
  value_eur: Money;
  /** `target_pct/100 × (V + core)`. */
  target_eur: Money;
  /** `max(0, target − value)`. */
  gap_eur: Money;
  /** Rounded to cents, never negative; the row sum is exactly the core amount. */
  allocation_eur: Money;
  value_after_eur: Money;
  weight_after_pct: Decimal;
}

export interface ContributionPlan {
  date: CivilDate;
  amount_eur: Money;
  amount_origin: "flag" | "settings";
  /** Shown apart and never allocated (rule of the budget). */
  bucket_budget_eur: Money;
  core_amount_eur: Money;
  /** Value of the core before the contribution. */
  core_value_eur: Money;
  rows: ContributionRow[];
  /** True when the contribution covered every shortfall and the surplus went by target weight. */
  surplus_distributed: boolean;
  warnings: Warning[];
}

export interface ContributionInput {
  /** From `--amount`; falls back to `monthly_contribution_eur`. */
  amount?: string;
  date: CivilDate;
  settings: Settings;
}

const fail = (code: string, message: string, details: Record<string, unknown> = {}): never => {
  throw new ValidationError(code, message, details);
};

/** The amount of the month and where it comes from. */
const amountOf = (input: ContributionInput): { amount: Money; origin: "flag" | "settings" } => {
  const raw = input.amount ?? input.settings.monthly_contribution_eur;
  if (raw === undefined) {
    return fail(
      "missing_amount",
      "no amount given and monthly_contribution_eur is not configured",
      {},
    );
  }
  const amount = Money.parse(raw, EUR);
  if (!amount.amount.isPositive()) {
    return fail("invalid_amount", "the contribution must be greater than zero", { value: raw });
  }
  return { amount, origin: input.amount === undefined ? "settings" : "flag" };
};

/**
 * Spreads the rounding residue so the allocations add up to the core amount
 * exactly. It goes to the largest shortfall first (decision (d)); when taking
 * it would leave that allocation negative, only what it holds is taken and the
 * rest moves to the next one (A6).
 */
const settleResidue = (order: readonly number[], allocations: Money[], residue: Money): void => {
  let left = residue;
  for (const index of order) {
    if (left.isZero()) {
      return;
    }
    const current = allocations[index] as Money;
    if (left.isNegative()) {
      // Take at most what the row holds, so no allocation can turn negative.
      const take = current.amount.lt(left.neg().amount) ? current.neg() : left;
      allocations[index] = current.add(take);
      left = left.sub(take);
      continue;
    }
    allocations[index] = current.add(left);
    return;
  }
};

/** Rows sorted by shortfall, then by target weight, then by id: a stable, explainable order. */
const residueOrder = (
  gaps: readonly Money[],
  targets: readonly Decimal[],
  ids: readonly AssetId[],
) =>
  gaps
    .map((_, index) => index)
    .sort((a, b) => {
      const byGap = (gaps[b] as Money).cmp(gaps[a] as Money);
      if (byGap !== 0) {
        return byGap;
      }
      const byTarget = (targets[b] as Decimal).cmp(targets[a] as Decimal);
      return byTarget !== 0 ? byTarget : (ids[a] as string).localeCompare(ids[b] as string);
    });

/**
 * The two invariants of the split, checked in production and not only in the
 * tests: a proposal that does not add up, or that asks for a negative amount,
 * must never reach the user (constitution V).
 */
export const assertSplit = (
  rows: readonly { asset_id: AssetId; allocation_eur: Money }[],
  core: Money,
): void => {
  const distributed = rows.reduce((sum, row) => sum.add(row.allocation_eur), Money.zero(EUR));
  const negative = rows.filter((row) => row.allocation_eur.isNegative());
  if (!distributed.eq(core) || negative.length > 0) {
    fail("split_not_exact", "the split does not add up to the core amount", {
      distributed: distributed.amount.toString(),
      core: core.amount.toString(),
      negative: negative.map((row) => row.asset_id),
    });
  }
};

export const contributionPlan = (
  state: LedgerState,
  input: ContributionInput,
): ContributionPlan => {
  const { settings, date } = input;
  if (settings.target_weights === undefined) {
    fail("missing_target_weights", "target_weights is not configured", {});
  }
  if (settings.bucket_pct_of_contribution === undefined) {
    fail("missing_bucket_pct", "bucket_pct_of_contribution is not configured", {});
  }
  const { amount, origin } = amountOf(input);
  const weights = coreWeights(state, date, settings);
  if (weights.missing_prices.length > 0) {
    fail("missing_manual_prices", "some core assets held have no manual price", {
      assets: weights.missing_prices,
      date,
    });
  }

  /*
   * Every row of the table at a target of zero: the weights in force point at
   * nothing that can be bought (typically a mistyped `asset_id`, which
   * `coreWeights` reports as `unknown_target_weight`). There is no shortfall to
   * cover and no weight to spread the surplus by, so anything distributed would
   * land on whichever row happens to sort first — an asset with a target of 0 %
   * whose deviation the contribution would only make worse. Reject instead.
   * The empty table falls here too.
   */
  const rowWeight = weights.rows.reduce((sum, row) => sum.add(row.target_pct), Decimal.ZERO);
  if (rowWeight.isZero()) {
    fail(
      "no_target_weight_in_table",
      "the target weights in force do not point at any asset of the core table",
      { assets: weights.rows.map((row) => row.asset_id), date },
    );
  }

  const bucket = amount
    .mul(Decimal.parse(settings.bucket_pct_of_contribution as string))
    .div(HUNDRED)
    .roundToCents();
  const core = amount.sub(bucket);
  const total = weights.total_eur;
  const after = total.add(core);

  const ids = weights.rows.map((row) => row.asset_id);
  const targets = weights.rows.map((row) => row.target_pct);
  const values = weights.rows.map((row) => row.value_eur as Money);
  const targetValues = targets.map((target) => after.mul(target).div(HUNDRED));
  const gaps = targetValues.map((target, index) => {
    const gap = target.sub(values[index] as Money);
    return gap.isNegative() ? Money.zero(EUR) : gap;
  });
  const totalGap = gaps.reduce((sum, gap) => sum.add(gap), Money.zero(EUR));

  /*
   * Because the targets are computed on the value after the contribution, the
   * shortfalls add up to the core amount plus whatever is above target, so the
   * proportional branch is the normal case. The surplus branch is reached when
   * part of the plan points at assets that are not in the table (an unknown
   * target weight, a warning of `coreWeights`): then the weights of the rows do
   * not add up to 100 and the leftover is spread among them in proportion to
   * the weight they do have, which is never zero (checked above).
   */
  const surplus = totalGap.cmp(core) < 0;
  const leftover = core.sub(totalGap);
  const raw = gaps.map((gap, index) => {
    if (!surplus) {
      return totalGap.isZero() ? Money.zero(EUR) : core.mul(gap.amount).div(totalGap.amount);
    }
    return gap.add(leftover.mul(targets[index] as Decimal).div(rowWeight));
  });
  const allocations = raw.map((value) => value.roundToCents());
  const assigned = allocations.reduce((sum, value) => sum.add(value), Money.zero(EUR));
  settleResidue(residueOrder(gaps, targets, ids), allocations, core.sub(assigned));

  const rows = weights.rows.map((row, index) => {
    const allocation = allocations[index] as Money;
    const valueAfter = (values[index] as Money).add(allocation);
    return {
      asset_id: row.asset_id,
      asset_class: row.asset_class,
      target_pct: row.target_pct,
      value_eur: values[index] as Money,
      target_eur: targetValues[index] as Money,
      gap_eur: gaps[index] as Money,
      allocation_eur: allocation,
      value_after_eur: valueAfter,
      weight_after_pct: after.isZero()
        ? Decimal.ZERO
        : valueAfter.amount.div(after.amount).mul(HUNDRED),
    };
  });

  assertSplit(rows, core);
  return {
    date,
    amount_eur: amount,
    amount_origin: origin,
    bucket_budget_eur: bucket,
    core_amount_eur: core,
    core_value_eur: total,
    rows,
    surplus_distributed: surplus,
    warnings: weights.warnings,
  };
};
