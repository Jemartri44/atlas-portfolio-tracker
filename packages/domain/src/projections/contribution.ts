// Monthly contribution split (business rule 2, data-schema.md §7).
//
// The bucket budget is separated first and never allocated: it is a budget, not
// an allocation (constitution III). The rest goes to the core assets by water
// level: first to the asset furthest below its target (computed on the value
// after the contribution) until its shortfall equals the next one's, then to
// both, and so on. If the contribution covers every shortfall, the surplus
// goes by target weight. It proposes and never sells (rule 2; selling is an
// annual decision, rule 3) and never writes: the orders are placed by hand.

import type { CivilDate } from "../dates/civil-date.js";
import { ValidationError } from "../errors.js";
import { Decimal } from "../money/decimal.js";
import { EUR, Money } from "../money/money.js";
import type { AssetClass, AssetId } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import type { ExternalPrices } from "./prices.js";
import type { LedgerState, Warning } from "./state.js";
import { coreWeights } from "./weights.js";

const HUNDRED = Decimal.parse("100");
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
  /**
   * New money the core would need for purchases alone to bring every asset to
   * its target, today's prices unchanged: `max(value / target) − V`, over the
   * assets with a target. Zero when nothing is above its target. Arithmetic of
   * today, not a forecast.
   */
  purchases_only_eur: Money;
  warnings: Warning[];
}

export interface ContributionInput {
  /** From `--amount`; falls back to `monthly_contribution_eur`. */
  amount?: string;
  date: CivilDate;
  settings: Settings;
  /** The automatic closes, through the gate like every view. */
  external?: ExternalPrices;
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
 * One row of the split while it is being computed. It is a record and not a
 * handful of arrays aligned by index: this is the calculation of priority 4 of
 * the constitution, and two arrays that drift apart would still typecheck.
 */
export interface Slice {
  asset_id: AssetId;
  asset_class: AssetClass;
  target_pct: Decimal;
  value_eur: Money;
  target_eur: Money;
  gap_eur: Money;
  allocation_eur: Money;
}

/** New money that would bring every asset with a target to it by purchases alone. */
export const purchasesOnlyOf = (
  slices: readonly { target_pct: Decimal; value_eur: Money }[],
  total: Money,
): Money => {
  let needed = total;
  for (const slice of slices) {
    if (slice.target_pct.isPositive()) {
      const whole = slice.value_eur.mul(HUNDRED).div(slice.target_pct);
      needed = whole.cmp(needed) > 0 ? whole : needed;
    }
  }
  return needed.sub(total);
};

/**
 * Spreads `money` over the shortfalls by water level: the largest shortfall is
 * filled first, down to the level of the next one, and so on until the money
 * runs out. Every asset that receives something ends with the same shortfall
 * left (the level); the ones below the level receive nothing. Exact, not yet
 * rounded. Requires `money` to be at most the sum of the shortfalls.
 */
export const fillByLevel = (gaps: readonly Money[], money: Money): Money[] => {
  const order = gaps.map((gap, index) => ({ gap, index })).sort((a, b) => b.gap.cmp(a.gap));
  let cumulative = Money.zero(EUR);
  let level = Money.zero(EUR);
  for (let k = 1; k <= order.length; k += 1) {
    cumulative = cumulative.add((order[k - 1] as (typeof order)[number]).gap);
    const next = order[k]?.gap ?? Money.zero(EUR);
    // What it takes to bring the first k shortfalls down to the next one.
    if (cumulative.sub(next.mul(Decimal.parse(String(k)))).cmp(money) >= 0) {
      level = cumulative.sub(money).div(Decimal.parse(String(k)));
      break;
    }
  }
  return gaps.map((gap) => (gap.cmp(level) > 0 ? gap.sub(level) : Money.zero(EUR)));
};

/**
 * Spreads the rounding residue so the allocations add up to the core amount
 * exactly. It goes to the largest shortfall first; when taking
 * it would leave that allocation negative, only what it holds is taken and the
 * rest moves to the next one.
 */
const settleResidue = (order: readonly Slice[], residue: Money): void => {
  let left = residue;
  for (const slice of order) {
    if (left.isZero()) {
      return;
    }
    const current = slice.allocation_eur;
    if (left.isNegative()) {
      // Take at most what the row holds, so no allocation can turn negative.
      const take = current.amount.lt(left.neg().amount) ? current.neg() : left;
      slice.allocation_eur = current.add(take);
      left = left.sub(take);
      continue;
    }
    slice.allocation_eur = current.add(left);
    return;
  }
};

/** Rows sorted by shortfall, then by target weight, then by id: a stable, explainable order. */
const residueOrder = (slices: readonly Slice[]): Slice[] =>
  [...slices].sort((a, b) => {
    const byGap = b.gap_eur.cmp(a.gap_eur);
    if (byGap !== 0) {
      return byGap;
    }
    const byTarget = b.target_pct.cmp(a.target_pct);
    return byTarget !== 0 ? byTarget : a.asset_id.localeCompare(b.asset_id);
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

export interface SplitInput {
  asset_id: AssetId;
  asset_class: AssetClass;
  target_pct: Decimal;
  value_eur: Money;
}

/**
 * Spreads `core` euros of new money over the assets by water level, with the
 * targets computed on the value after it (`total + core`). Rounded to cents, the
 * residue settled so the allocations add up to `core` exactly. Shared by the
 * monthly contribution and by the first step of a rebalance, so the two can
 * never disagree about who is furthest from its weight.
 */
export const splitCore = (
  items: readonly SplitInput[],
  total: Money,
  core: Money,
): { slices: Slice[]; surplus: boolean } => {
  const after = total.add(core);
  const rowWeight = items.reduce((sum, item) => sum.add(item.target_pct), Decimal.ZERO);
  const slices: Slice[] = items.map((item) => {
    const target = after.mul(item.target_pct).div(HUNDRED);
    const gap = target.sub(item.value_eur);
    return {
      ...item,
      target_eur: target,
      gap_eur: gap.isNegative() ? Money.zero(EUR) : gap,
      allocation_eur: Money.zero(EUR),
    };
  });
  const totalGap = slices.reduce((sum, slice) => sum.add(slice.gap_eur), Money.zero(EUR));

  /*
   * Because the targets are computed on the value after the contribution, the
   * shortfalls add up to the core amount plus whatever is above target, so the
   * water-level branch is the normal case. The surplus branch is reached when
   * part of the plan points at assets that are not in the table (an unknown
   * target weight, a warning of `coreWeights`): then the weights of the rows do
   * not add up to 100 and the leftover is spread among them in proportion to
   * the weight they do have, which the callers check is never zero.
   */
  const surplus = totalGap.cmp(core) < 0;
  const leftover = core.sub(totalGap);
  const levelled = surplus
    ? []
    : fillByLevel(
        slices.map((slice) => slice.gap_eur),
        core,
      );
  slices.forEach((slice, index) => {
    const raw = surplus
      ? slice.gap_eur.add(leftover.mul(slice.target_pct).div(rowWeight))
      : (levelled[index] as Money);
    slice.allocation_eur = raw.roundToCents();
  });
  const assigned = slices.reduce((sum, slice) => sum.add(slice.allocation_eur), Money.zero(EUR));
  settleResidue(residueOrder(slices), core.sub(assigned));
  return { slices, surplus };
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
  const weights = coreWeights(state, date, settings, input.external);
  if (weights.missing_prices.length > 0) {
    fail("missing_manual_prices", "some core assets held have no price in euros", {
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
  const approximated = weights.rows
    .filter((row) => row.price?.approximate)
    .map((row) => row.asset_id);
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
  // Every row has a value: the ones held without a price were rejected above.
  const { slices, surplus } = splitCore(
    weights.rows.map((row) => ({
      asset_id: row.asset_id,
      asset_class: row.asset_class,
      target_pct: row.target_pct,
      value_eur: row.value_eur as Money,
    })),
    total,
    core,
  );

  const rows = slices.map((slice) => {
    const valueAfter = slice.value_eur.add(slice.allocation_eur);
    return {
      ...slice,
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
    purchases_only_eur: purchasesOnlyOf(slices, total),
    // The calculator says when a weight it uses rests on an approximation
    // through the reference ETF: the domain says it, the interfaces only
    // translate it (ADR-0024).
    warnings:
      approximated.length === 0
        ? weights.warnings
        : [
            ...weights.warnings,
            {
              code: "weights_use_approximation",
              event_id: "",
              message: "approximated weights",
              details: { assets: approximated },
            },
          ],
  };
};
