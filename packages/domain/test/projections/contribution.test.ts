import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { Money } from "../../src/money/money.js";
import {
  assertSplit,
  type ContributionRow,
  contributionPlan,
} from "../../src/projections/contribution.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { coreWeights } from "../../src/projections/weights.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";

const settings = (extra: Partial<Settings>): Settings =>
  mergeSettings(DEFAULT_SETTINGS, { bucket_pct_of_contribution: "0", ...extra });

/** A core worth 600 / 300 / 100 euros in equity, fixed income and gold. */
const core = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "6", unit_price: "100" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_bonds", quantity: "3", unit_price: "100" });
  b.buy({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    quantity: "1",
    unit_price: "100",
    currency: "USD",
    fx_rate: "1",
  });
  b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date: DATE, unit_value: "100" });
  b.valuation({ account_id: "acc_fund", asset_id: "ast_bonds", date: DATE, unit_value: "100" });
  b.valuation({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    date: DATE,
    unit_value: "100",
    currency: "USD",
    fx_rate: "1",
  });
  return b;
};

const BALANCED = { ast_world: "60", ast_bonds: "30", ast_gold: "10" };

const plan = (b: LedgerBuilder, amount: string, extra: Partial<Settings> = {}) =>
  contributionPlan(projectLedger(b.build()), {
    amount,
    date: DATE,
    settings: settings({ target_weights: BALANCED, ...extra }),
  });

const allocations = (result: { rows: { asset_id: string; allocation_eur: Money }[] }) =>
  Object.fromEntries(
    result.rows.map((row) => [row.asset_id, row.allocation_eur.amount.toString()]),
  );

/** Code of the ValidationError a rejection raises; each one means something different. */
const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return (error as ValidationError).code;
  }
  return "accepted";
};

const sumOf = (result: { rows: { allocation_eur: Money }[] }): string =>
  result.rows
    .reduce((total, row) => total.add(row.allocation_eur), Money.zero("EUR"))
    .amount.toString();

describe("contributionPlan", () => {
  it("separates the bucket budget and never allocates it", () => {
    const result = plan(core(), "1000", { bucket_pct_of_contribution: "10" });
    expect(result.bucket_budget_eur.amount.toString()).toBe("100");
    expect(result.core_amount_eur.amount.toString()).toBe("900");
    expect(sumOf(result)).toBe("900");
    expect(result.rows.map((row) => row.asset_id)).toEqual(["ast_world", "ast_bonds", "ast_gold"]);
  });

  it("splits in proportion to the shortfall while the contribution does not cover it", () => {
    // Core 600/300/100 against 40/40/20 of 1000 + 1000: shortfalls 200, 500, 300.
    const result = plan(core(), "1000", {
      target_weights: { ast_world: "40", ast_bonds: "40", ast_gold: "20" },
    });
    expect(result.surplus_distributed).toBe(false);
    expect(allocations(result)).toEqual({
      ast_world: "200",
      ast_bonds: "500",
      ast_gold: "300",
    });
    // Nobody ends above their target when the contribution does not cover every shortfall.
    for (const row of result.rows) {
      expect(row.value_after_eur.cmp(row.target_eur)).toBeLessThanOrEqual(0);
    }
  });

  it("follows the target weights exactly when the portfolio is already balanced", () => {
    // At target, every shortfall is `w_i × contribution` and they add up to it.
    const result = plan(core(), "100");
    expect(result.surplus_distributed).toBe(false);
    expect(allocations(result)).toEqual({ ast_world: "60", ast_bonds: "30", ast_gold: "10" });
    expect(sumOf(result)).toBe("100");
  });

  it("spreads the leftover of a plan that points at an asset outside the table", () => {
    // 10 % of the plan goes to an asset that is not in the core catalogue: the
    // shortfalls no longer add up to the contribution and the rest is spread
    // among the rows in proportion to the weight they do have.
    const result = plan(core(), "1000", {
      target_weights: { ast_world: "60", ast_bonds: "30", ast_ghost: "10" },
    });
    expect(result.surplus_distributed).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toContain("unknown_target_weight");
    expect(sumOf(result)).toBe("1000");
    for (const row of result.rows) {
      expect(row.allocation_eur.isNegative()).toBe(false);
    }
  });

  it("covers a single shortfall and spreads what is left over", () => {
    const b = core();
    // Gold falls to 50 EUR: the only asset below its target.
    b.valuation({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      date: DATE,
      unit_value: "50",
      currency: "USD",
      fx_rate: "1",
    });
    const result = plan(b, "1000");
    expect(sumOf(result)).toBe("1000");
    // Money against Money: an amount is never compared through a float.
    const gold = result.rows.find((row) => row.asset_id === "ast_gold") as ContributionRow;
    expect(gold.allocation_eur.cmp(Money.parse("100", "EUR"))).toBeGreaterThan(0);
  });

  it("adds up to the core amount to the cent when the split does not divide evenly", () => {
    const result = plan(core(), "0.10");
    expect(sumOf(result)).toBe("0.1");
    expect(allocations(result)).toEqual({ ast_world: "0.06", ast_bonds: "0.03", ast_gold: "0.01" });
  });

  it("keeps every allocation at or above zero with a contribution of a few cents", () => {
    const result = plan(core(), "0.03", {
      target_weights: { ast_world: "20", ast_bonds: "20", ast_gold: "60" },
    });
    expect(sumOf(result)).toBe("0.03");
    for (const row of result.rows) {
      expect(row.allocation_eur.isNegative()).toBe(false);
    }
  });

  it("spills the rounding residue across rows when the first cannot absorb it", () => {
    // Five equal assets at target and three cents to split: every row rounds up
    // to a cent, so two cents must come back out of more than one row (A6).
    const b = new LedgerBuilder();
    catalogue(b);
    const targets: Record<string, string> = {};
    for (const suffix of ["a", "b", "c", "d", "e"]) {
      const assetId = `ast_${suffix}`;
      b.asset(assetId, { asset_class: "equity" });
      b.buy({ account_id: "acc_fund", asset_id: assetId, quantity: "1", unit_price: "100" });
      b.valuation({ account_id: "acc_fund", asset_id: assetId, date: DATE, unit_value: "100" });
      targets[assetId] = "20";
    }
    const result = contributionPlan(projectLedger(b.build()), {
      amount: "0.03",
      date: DATE,
      settings: settings({ target_weights: targets }),
    });
    expect(sumOf(result)).toBe("0.03");
    /*
     * The exact map, not just the sum: the residue is taken from the largest
     * shortfall first and, on a tie, from the largest target weight and then
     * the first `asset_id`. Every row rounded up to a cent, so two cents come
     * back out of the first two rows in that order.
     */
    expect(allocations(result)).toEqual({
      ast_a: "0",
      ast_b: "0",
      ast_c: "0.01",
      ast_d: "0.01",
      ast_e: "0.01",
    });
  });

  it("refuses when the whole plan points outside the table", () => {
    // Every weight names an asset that is not in the core catalogue (a mistyped
    // `asset_id`): no row has a target, so there is no shortfall to cover and
    // no weight to spread by. Distributing anyway would put the whole
    // contribution into the first row by id, at a target of 0 %.
    const ghost = { ast_ghost: "100" };
    try {
      plan(core(), "1000", { target_weights: ghost });
      throw new Error("expected a ValidationError");
    } catch (error) {
      expect((error as ValidationError).code).toBe("no_target_weight_in_table");
      expect((error as ValidationError).details.assets).toEqual([
        "ast_world",
        "ast_bonds",
        "ast_gold",
      ]);
    }
    // The warning that names the culprit is the one coreWeights already raises.
    expect(
      coreWeights(
        projectLedger(core().build()),
        DATE,
        settings({ target_weights: ghost }),
      ).warnings.map((warning) => warning.code),
    ).toContain("unknown_target_weight");
  });

  it("refuses the same way when the core table has no rows at all", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    try {
      contributionPlan(projectLedger(b.build()), {
        amount: "100",
        date: DATE,
        settings: settings({ target_weights: { ast_ghost: "100" } }),
      });
      throw new Error("expected a ValidationError");
    } catch (error) {
      expect((error as ValidationError).code).toBe("no_target_weight_in_table");
      expect((error as ValidationError).details.assets).toEqual([]);
    }
  });

  it("answers with zero weights when there is nothing to weigh", () => {
    // The bucket takes the whole contribution and the core owns nothing yet.
    const b = new LedgerBuilder();
    catalogue(b);
    const result = contributionPlan(projectLedger(b.build()), {
      amount: "100",
      date: DATE,
      settings: settings({
        target_weights: { ast_world: "100" },
        bucket_pct_of_contribution: "100",
      }),
    });
    expect(result.core_amount_eur.amount.toString()).toBe("0");
    expect(result.rows[0]?.weight_after_pct.toString()).toBe("0");
    expect(sumOf(result)).toBe("0");
  });

  it("gives nothing to an asset with a zero target and a live position", () => {
    const result = plan(core(), "1000", {
      target_weights: { ast_world: "70", ast_bonds: "30", ast_gold: "0" },
    });
    expect(allocations(result).ast_gold).toBe("0");
    expect(sumOf(result)).toBe("1000");
  });

  it("gives its whole target to an asset with a target and no position", () => {
    const b = core();
    b.asset("ast_mm", { asset_class: "fixed_income", asset_type: "money_market" });
    const result = plan(b, "1000", {
      target_weights: { ast_world: "50", ast_bonds: "25", ast_gold: "10", ast_mm: "15" },
    });
    const row = result.rows.find((entry) => entry.asset_id === "ast_mm");
    expect(row?.value_eur.amount.toString()).toBe("0");
    expect(row?.gap_eur.amount.toString()).toBe("300");
    expect(sumOf(result)).toBe("1000");
  });

  it("works with the bucket at 0 % and at 100 %", () => {
    const none = plan(core(), "1000", { bucket_pct_of_contribution: "0" });
    expect(none.bucket_budget_eur.amount.toString()).toBe("0");
    expect(sumOf(none)).toBe("1000");
    const all = plan(core(), "1000", { bucket_pct_of_contribution: "100" });
    expect(all.bucket_budget_eur.amount.toString()).toBe("1000");
    expect(all.core_amount_eur.amount.toString()).toBe("0");
    expect(sumOf(all)).toBe("0");
    expect(all.rows.every((row) => row.allocation_eur.isZero())).toBe(true);
  });

  it("takes the amount from the settings when no flag is given", () => {
    const result = contributionPlan(projectLedger(core().build()), {
      date: DATE,
      settings: settings({ target_weights: BALANCED, monthly_contribution_eur: "600" }),
    });
    expect(result.amount_origin).toBe("settings");
    expect(result.amount_eur.amount.toString()).toBe("600");
  });

  it("refuses without an amount, without target weights and without the bucket percentage", () => {
    const state = projectLedger(core().build());
    // Each rejection has its own code: the CLI turns it into its own message.
    expect(
      codeOf(() =>
        contributionPlan(state, { date: DATE, settings: settings({ target_weights: BALANCED }) }),
      ),
    ).toBe("missing_amount");
    expect(
      codeOf(() =>
        contributionPlan(state, { amount: "100", date: DATE, settings: DEFAULT_SETTINGS }),
      ),
    ).toBe("missing_target_weights");
    expect(
      codeOf(() =>
        contributionPlan(state, {
          amount: "100",
          date: DATE,
          settings: mergeSettings(DEFAULT_SETTINGS, { target_weights: BALANCED }),
        }),
      ),
    ).toBe("missing_bucket_pct");
  });

  it("refuses a contribution of zero, a negative one and one that is not a decimal", () => {
    expect(codeOf(() => plan(core(), "0"))).toBe("invalid_amount");
    expect(codeOf(() => plan(core(), "-100"))).toBe("invalid_amount");
    // A word never reaches the amount check: `Money.parse` rejects it first.
    expect(codeOf(() => plan(core(), "cien"))).toBe("invalid_decimal");
  });

  it("refuses to split when a core asset held has no price, listing what is missing", () => {
    const b = core();
    b.asset("ast_mm", { asset_class: "fixed_income", asset_type: "money_market" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_mm", quantity: "5", unit_price: "100" });
    try {
      plan(b, "1000", {
        target_weights: { ast_world: "50", ast_bonds: "25", ast_gold: "10", ast_mm: "15" },
      });
      throw new Error("expected a ValidationError");
    } catch (error) {
      expect((error as ValidationError).code).toBe("missing_manual_prices");
      expect((error as ValidationError).details.assets).toEqual(["ast_mm"]);
      expect((error as ValidationError).details.date).toBe(DATE);
    }
  });

  it("splits over a stale price, warning instead of refusing", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "6", unit_price: "100" });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-12-01",
      unit_value: "100",
    });
    const result = contributionPlan(projectLedger(b.build()), {
      amount: "100",
      date: DATE,
      settings: settings({ target_weights: { ast_world: "100" }, stale_price_days: 5 }),
    });
    expect(result.warnings.map((warning) => warning.code)).toContain("stale_price");
    expect(sumOf(result)).toBe("100");
  });

  it("carries the threshold warnings of the weights", () => {
    const result = plan(core(), "100", {
      target_weights: { ast_world: "40", ast_bonds: "40", ast_gold: "20" },
      deviation_threshold_pp: "5",
    });
    expect(result.warnings.map((warning) => warning.code)).toContain("deviation_above_threshold");
  });

  it("guards its own invariants in production, not only in the tests", () => {
    const rows = [
      { asset_id: "ast_world", allocation_eur: Money.parse("60", "EUR") },
      { asset_id: "ast_bonds", allocation_eur: Money.parse("30", "EUR") },
    ];
    expect(() => assertSplit(rows, Money.parse("90", "EUR"))).not.toThrow();
    expect(() => assertSplit(rows, Money.parse("100", "EUR"))).toThrow(ValidationError);
    expect(() =>
      assertSplit(
        [
          { asset_id: "ast_world", allocation_eur: Money.parse("100", "EUR") },
          { asset_id: "ast_bonds", allocation_eur: Money.parse("-10", "EUR") },
        ],
        Money.parse("90", "EUR"),
      ),
    ).toThrow(ValidationError);
  });
});
