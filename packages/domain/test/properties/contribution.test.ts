// Properties of the monthly split (constitution VII, priority 4). Whatever the
// weights, the values and the amount: the split adds up to the cent, never goes
// negative, never overshoots a target while shortfalls remain, and never leaves
// the portfolio further from the plan than it was.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { Money } from "../../src/money/money.js";
import { type ContributionPlan, contributionPlan } from "../../src/projections/contribution.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { AssetClass } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
const CLASSES: readonly AssetClass[] = ["equity", "fixed_income", "gold", "crypto"];

interface Asset {
  /** Value in euros, two decimals. */
  value: string;
  /** Integer target weight; the generator makes them add up to 100. */
  weight: number;
}

/** Integer weights adding up to exactly 100, one per asset. */
const weightsOf = (shares: readonly number[]): number[] => {
  const total = shares.reduce((sum, share) => sum + share, 0);
  if (total === 0) {
    return shares.map((_, index) => (index === 0 ? 100 : 0));
  }
  const weights = shares.map((share) => Math.floor((share * 100) / total));
  weights[0] = (weights[0] as number) + (100 - weights.reduce((sum, w) => sum + w, 0));
  return weights;
};

const assetsArb = fc
  .array(
    fc.record({
      cents: fc.integer({ min: 0, max: 5_000_00 }),
      share: fc.integer({ min: 0, max: 100 }),
    }),
    { minLength: 1, maxLength: 4 },
  )
  .map((entries): Asset[] => {
    const weights = weightsOf(entries.map((entry) => entry.share));
    return entries.map((entry, index) => ({
      value: (entry.cents / 100).toFixed(2),
      weight: weights[index] as number,
    }));
  });

const amountArb = fc.integer({ min: 1, max: 10_000_00 }).map((cents) => (cents / 100).toFixed(2));

/** A core ledger where asset `i` is worth `assets[i].value` euros at DATE. */
const planOf = (assets: readonly Asset[], amount: string, bucketPct: string): ContributionPlan => {
  const b = new LedgerBuilder();
  b.account("acc_fund");
  const targets: Record<string, string> = {};
  assets.forEach((asset, index) => {
    const assetId = `ast_${index}`;
    b.asset(assetId, { asset_class: CLASSES[index % CLASSES.length] as AssetClass });
    targets[assetId] = String(asset.weight);
    if (asset.value !== "0.00") {
      b.buy({
        account_id: "acc_fund",
        asset_id: assetId,
        quantity: "1",
        unit_price: asset.value,
      });
      b.valuation({
        account_id: "acc_fund",
        asset_id: assetId,
        date: DATE,
        quantity: "1",
        unit_value: asset.value,
      });
    }
  });
  return contributionPlan(projectLedger(b.build()), {
    amount,
    date: DATE,
    settings: mergeSettings(DEFAULT_SETTINGS, {
      target_weights: targets,
      bucket_pct_of_contribution: bucketPct,
    }),
  });
};

const sumOf = (plan: ContributionPlan): Money =>
  plan.rows.reduce((total, row) => total.add(row.allocation_eur), Money.zero("EUR"));

/** Largest |weight − target| in percentage points, over a set of values. */
const maxDeviation = (
  values: readonly Money[],
  targets: readonly Decimal[],
  total: Money,
): Decimal => {
  if (total.isZero()) {
    return Decimal.ZERO;
  }
  return values.reduce((worst, value, index) => {
    const weight = value.amount.div(total.amount).mul(Decimal.parse("100"));
    const deviation = weight.sub(targets[index] as Decimal).abs();
    return deviation.gt(worst) ? deviation : worst;
  }, Decimal.ZERO);
};

describe("contributionPlan properties", () => {
  it("adds up to the core amount exactly, with no negative allocation", () => {
    fc.assert(
      fc.property(
        assetsArb,
        amountArb,
        fc.constantFrom("0", "10", "100"),
        (assets, amount, pct) => {
          const plan = planOf(assets, amount, pct);
          expect(sumOf(plan).eq(plan.core_amount_eur)).toBe(true);
          expect(plan.bucket_budget_eur.add(plan.core_amount_eur).eq(plan.amount_eur)).toBe(true);
          for (const row of plan.rows) {
            expect(row.allocation_eur.isNegative()).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("never pushes an asset above its target while shortfalls are not covered", () => {
    fc.assert(
      fc.property(assetsArb, amountArb, (assets, amount) => {
        const plan = planOf(assets, amount, "0");
        if (plan.surplus_distributed) {
          return; // the leftover branch does overshoot on purpose
        }
        for (const row of plan.rows) {
          // The contribution never takes an asset past its target. An asset
          // already above it (a weight of zero, say) simply gets nothing.
          const ceiling = row.value_eur.cmp(row.target_eur) > 0 ? row.value_eur : row.target_eur;
          // Two cents of slack: the allocation is rounded to cents, and the row
          // with the largest shortfall may also take the rounding residue (A6).
          expect(row.value_after_eur.sub(ceiling).amount.lt(Decimal.parse("0.02"))).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("never leaves the portfolio further from the plan than it was", () => {
    fc.assert(
      fc.property(assetsArb, amountArb, (assets, amount) => {
        const plan = planOf(assets, amount, "0");
        const targets = plan.rows.map((row) => row.target_pct);
        const before = maxDeviation(
          plan.rows.map((row) => row.value_eur),
          targets,
          plan.core_value_eur,
        );
        const total = plan.core_value_eur.add(plan.core_amount_eur);
        const after = maxDeviation(
          plan.rows.map((row) => row.value_after_eur),
          targets,
          total,
        );
        // The cent-level noise of the split (its own rounding plus the residue)
        // is worth this many percentage points of the resulting total.
        const tolerance = total.isZero()
          ? Decimal.parse("100")
          : Decimal.parse("0.02").div(total.amount).mul(Decimal.parse("100"));
        expect(after.sub(before).lt(tolerance.add(Decimal.parse("0.0000000001")))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
