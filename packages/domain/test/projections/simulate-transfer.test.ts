import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { simulateTransfer } from "../../src/projections/simulate-transfer.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
const TARGETS = { ast_world: "60", ast_bonds: "30", ast_gold: "10" };

const settings = (extra: Partial<Settings> = {}): Settings =>
  mergeSettings(DEFAULT_SETTINGS, { target_weights: TARGETS, ...extra });

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

const simulate = (b: LedgerBuilder, input: Record<string, unknown>) =>
  simulateTransfer(projectLedger(b.build()), {
    from_asset_id: "ast_world",
    to_asset_id: "ast_bonds",
    date: DATE,
    settings: settings(),
    ...input,
  } as Parameters<typeof simulateTransfer>[1]);

const weightOf = (
  weights: { rows: { asset_id: string; weight_pct?: { toString(): string } }[] },
  id: string,
) => weights.rows.find((row) => row.asset_id === id)?.weight_pct?.toString();

describe("simulateTransfer", () => {
  it("moves value between two core funds and shows the weights before and after", () => {
    const result = simulate(core(), { quantity: "2" });
    expect(result.moved_eur.amount.toString()).toBe("200");
    expect(result.taxable).toBe(false);
    expect(weightOf(result.before, "ast_world")).toBe("60");
    expect(weightOf(result.before, "ast_bonds")).toBe("30");
    expect(weightOf(result.after, "ast_world")).toBe("40");
    expect(weightOf(result.after, "ast_bonds")).toBe("50");
    // The total does not change: a transfer moves value, it does not create it.
    expect(result.after.total_eur.eq(result.before.total_eur)).toBe(true);
  });

  it("transfers the whole position with --all", () => {
    const result = simulate(core(), { all: true });
    expect(result.quantity.toString()).toBe("6");
    expect(result.moved_eur.amount.toString()).toBe("600");
    expect(weightOf(result.after, "ast_world")).toBe("0");
    expect(weightOf(result.after, "ast_bonds")).toBe("90");
  });

  it("refuses an asset that is not transferable, not core, unknown, or the same one", () => {
    const b = core();
    expect(() => simulate(b, { to_asset_id: "ast_gold", quantity: "1" })).toThrow(ValidationError);
    expect(() => simulate(b, { to_asset_id: "ast_spec", quantity: "1" })).toThrow(ValidationError);
    expect(() => simulate(b, { to_asset_id: "ast_ghost", quantity: "1" })).toThrow(ValidationError);
    expect(() => simulate(b, { to_asset_id: "ast_world", quantity: "1" })).toThrow(ValidationError);
    try {
      simulate(b, { to_asset_id: "ast_gold", quantity: "1" });
    } catch (error) {
      expect((error as ValidationError).code).toBe("not_transferable");
    }
  });

  it("refuses without a manual price of either asset, listing what is missing", () => {
    const b = core();
    b.asset("ast_mm", { asset_class: "fixed_income", asset_type: "money_market" });
    try {
      simulate(b, { to_asset_id: "ast_mm", quantity: "1" });
      throw new Error("expected a ValidationError");
    } catch (error) {
      expect((error as ValidationError).code).toBe("missing_manual_prices");
      expect((error as ValidationError).details.assets).toEqual(["ast_mm"]);
    }
  });

  it("refuses more than the core holds, and a quantity of zero", () => {
    const b = core();
    try {
      simulate(b, { quantity: "7" });
      throw new Error("expected a ValidationError");
    } catch (error) {
      expect((error as ValidationError).code).toBe("insufficient_position");
      expect((error as ValidationError).details.available).toBe("6");
    }
    expect(() => simulate(b, { quantity: "0" })).toThrow(ValidationError);
  });

  it("moves the position held at the date asked, not the one of the end of the ledger (asOf)", () => {
    const b = core();
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2028-06-01",
      quantity: "94",
      unit_price: "100",
    });
    const events = b.build();
    const input = {
      from_asset_id: "ast_world",
      to_asset_id: "ast_bonds",
      all: true,
      date: DATE,
      settings: settings(),
    };
    const asked = simulateTransfer(projectLedger(events, { asOf: DATE }), input);
    expect(asked.quantity.toString()).toBe("6");
    expect(asked.moved_eur.amount.toString()).toBe("600");
    // Read whole, the same command would move the 2028 position.
    expect(simulateTransfer(projectLedger(events), input).quantity.toString()).toBe("100");
  });

  it("re-evaluates the threshold warnings on the simulated portfolio", () => {
    const result = simulate(core(), {
      quantity: "2",
      settings: settings({ deviation_threshold_pp: "5" }),
    });
    expect(result.before.warnings.map((warning) => warning.code)).not.toContain(
      "deviation_above_threshold",
    );
    expect(result.after.warnings.map((warning) => warning.code)).toContain(
      "deviation_above_threshold",
    );
  });
});
