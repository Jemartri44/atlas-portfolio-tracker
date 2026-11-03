import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { grow } from "../../src/projections/growth.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { projection } from "../../src/projections/projection.js";
import { coreWeights } from "../../src/projections/weights.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
const d = (text: string) => Decimal.parse(text);

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  monthly_contribution_eur: "100",
  bucket_pct_of_contribution: "10",
  target_weights: { ast_world: "60", ast_bonds: "40" },
};

/** 600 in the world fund and 400 in bonds, or the bonds left without a price. */
const core = (priced = true): LedgerEvent[] => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "6", unit_price: "100" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_bonds", quantity: "4", unit_price: "100" });
  b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date: DATE, unit_value: "100" });
  if (priced) {
    b.valuation({ account_id: "acc_fund", asset_id: "ast_bonds", date: DATE, unit_value: "100" });
  }
  return b.build();
};

const run = (
  events: LedgerEvent[],
  withSettings: Settings,
  assumptions: Partial<Parameters<typeof projection>[2]> = {},
) =>
  projection(coreWeights(projectLedger(events), DATE, withSettings), withSettings, {
    years: 2,
    scenarios: [{ name: "base", returnsPct: { equity: d("7"), fixed_income: d("3") } }],
    ...assumptions,
  });

describe("projection", () => {
  it("blends the class returns by the target weights and grows the pot with the core's share of the contribution", () => {
    const result = run(core(), settings);
    expect(result.gap).toBeUndefined();
    expect(result.missing).toEqual([]);
    expect(result.start_eur.amount.toString()).toBe("1000");
    expect(result.monthly_core_eur.amount.toString()).toBe("90");
    const [base] = result.scenarios;
    expect(base?.blended_return_pct?.toString()).toBe("5.4");
    const expected = grow({
      start: d("1000"),
      monthly: d("90"),
      annualReturnPct: d("5.4"),
      years: 2,
    });
    expect(base?.points?.map((p) => p.value_eur.amount.toString())).toEqual(
      expected.map((p) => p.value.toString()),
    );
    expect(base?.points?.[2]?.contributed_eur.amount.toString()).toBe("3160");
    expect(base?.goal_month).toBeUndefined();
  });

  it("says the month the goal is reached, 0 if already there, and nothing if never", () => {
    const flat = { name: "flat", returnsPct: { equity: d("0"), fixed_income: d("0") } };
    const at = (goalEur: string) =>
      run(core(), settings, { scenarios: [flat], goalEur: d(goalEur) }).scenarios[0]?.goal_month;
    expect(at("1450")).toBe(5);
    expect(at("1000")).toBe(0);
    expect(at("999999")).toBeUndefined();
  });

  it("gives no figure for a scenario that lacks the return of a class with weight", () => {
    const result = run(core(), settings, {
      scenarios: [{ name: "partial", returnsPct: { equity: d("7") } }],
    });
    expect(result.scenarios).toEqual([{ name: "partial", missing_returns: ["fixed_income"] }]);
  });

  it("does not need a return for a class with no weight", () => {
    const only = { ...settings, target_weights: { ast_world: "100" } };
    const result = run(core(), only, {
      scenarios: [{ name: "world", returnsPct: { equity: d("7") } }],
    });
    expect(result.scenarios[0]?.blended_return_pct?.toString()).toBe("7");
  });

  it("gives no figure with a held asset unpriced or without target weights", () => {
    expect(run(core(false), settings).gap).toBe("partial");
    expect(run(core(), { ...settings, target_weights: {} }).gap).toBe("no_targets");
  });

  it("says which settings are missing instead of assuming them", () => {
    const bare = { ...settings } as Settings;
    delete bare.monthly_contribution_eur;
    delete bare.bucket_pct_of_contribution;
    const result = run(core(), bare);
    expect(result.missing).toEqual(["monthly_contribution", "bucket_pct"]);
    expect(result.monthly_core_eur.amount.isZero()).toBe(true);
  });

  it("refuses a horizon that is not a whole number of years", () => {
    expect(() => run(core(), settings, { years: 1.5 })).toThrow("whole number");
  });
});
