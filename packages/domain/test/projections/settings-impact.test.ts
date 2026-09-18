import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { movedFiscalYears, silencedWarnings } from "../../src/projections/settings-impact.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

/**
 * The 30th of December sold, settled on the 2nd of January: by trade date the
 * gain is of 2027, by value date it is of 2028. Changing the rule moves it, and
 * a return already filed stops matching (prompt 005 §3.5 bis).
 */
const straddling = () => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "10",
    unit_price: "10",
    trade_date: "2027-01-10",
    value_date: "2027-01-12",
  });
  b.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "10",
    unit_price: "13",
    trade_date: "2027-12-30",
    value_date: "2028-01-02",
  });
  return b.build();
};

const byValueDate = DEFAULT_SETTINGS;
const byTradeDate = mergeSettings(DEFAULT_SETTINGS, {
  fiscal_date_rule: { fund: "trade_date" },
});

describe("movedFiscalYears", () => {
  it("lists the years whose realized gains change, with both figures", () => {
    const moved = movedFiscalYears(straddling(), byValueDate, byTradeDate, 2029);
    expect(moved).toHaveLength(2);
    expect(moved[0]).toMatchObject({ year: 2027 });
    expect(moved[0]?.before.amount.toString()).toBe("0");
    expect(moved[0]?.after.amount.toString()).toBe("30");
    expect(moved[1]).toMatchObject({ year: 2028 });
    expect(moved[1]?.before.amount.toString()).toBe("30");
    expect(moved[1]?.after.amount.toString()).toBe("0");
  });

  it("says nothing about the year in course: nothing has been filed yet", () => {
    // Standing in 2028, the gain that moves from 2028 to 2027 still warns about
    // 2027, which is over; asked from 2027, neither year is past.
    expect(movedFiscalYears(straddling(), byValueDate, byTradeDate, 2028)).toHaveLength(1);
    expect(movedFiscalYears(straddling(), byValueDate, byTradeDate, 2027)).toEqual([]);
  });

  it("says nothing when the change touches no fiscal rule", () => {
    const louder = mergeSettings(DEFAULT_SETTINGS, { deviation_threshold_pp: "3" });
    expect(movedFiscalYears(straddling(), byValueDate, louder, 2029)).toEqual([]);
  });

  it("says nothing on a ledger with no sales", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
    expect(movedFiscalYears(b.build(), byValueDate, byTradeDate, 2029)).toEqual([]);
  });
});

/**
 * 700 EUR of ast_world, 300 of ast_bonds and 20 of ast_gold against targets of
 * 60/30/10: the equity is over its target, the gold is far under it and weighs
 * under the satellite minimum. A threshold of 5 pp and a minimum of 5 % both
 * warn, so raising either one switches its warning off — which is exactly what
 * the user has to be told before writing (constitution IV).
 */
const drifted = (withPrices = true) => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "7", unit_price: "100" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_bonds", quantity: "3", unit_price: "100" });
  b.buy({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    quantity: "0.2",
    unit_price: "100",
    currency: "USD",
    fx_rate: "1",
  });
  if (withPrices) {
    for (const [account_id, asset_id] of [
      ["acc_fund", "ast_world"],
      ["acc_fund", "ast_bonds"],
    ] as const) {
      b.valuation({ account_id, asset_id, date: "2027-12-31", unit_value: "100" });
    }
    b.valuation({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      date: "2027-12-31",
      unit_value: "100",
      currency: "USD",
      fx_rate: "1",
    });
  }
  return projectLedger(b.build(), { collectErrors: true });
};

const tight = mergeSettings(DEFAULT_SETTINGS, {
  target_weights: { ast_world: "60", ast_bonds: "30", ast_gold: "10" },
  deviation_threshold_pp: "5",
  satellite_min_weight_pct: "5",
});

const subjects = (warnings: readonly { code: string; details: Record<string, unknown> }[]) =>
  warnings.map(
    (warning) => `${warning.code}:${warning.details.asset_id ?? warning.details.asset_class}`,
  );

describe("silencedWarnings", () => {
  it("lists the warnings the new settings would switch off", () => {
    const louder = mergeSettings(tight, { deviation_threshold_pp: "15" });
    const result = silencedWarnings(drifted(), "2027-12-31", tight, louder);
    expect(result.evaluated).toBe(true);
    expect(subjects(result.silenced)).toEqual([
      "deviation_above_threshold:ast_world",
      "deviation_above_threshold:ast_gold",
    ]);
    expect(result.missing_prices).toEqual([]);
  });

  it("silences nothing when the threshold rises but the deviation still exceeds it", () => {
    // The warning carries the threshold in its details: comparing the whole
    // detail bag would call this "silenced", and it is not.
    const slightly = mergeSettings(tight, { deviation_threshold_pp: "6" });
    const result = silencedWarnings(drifted(), "2027-12-31", tight, slightly);
    expect(result.silenced).toEqual([]);
    expect(result.evaluated).toBe(true);
  });

  it("silences nothing when the change makes the warnings louder", () => {
    const stricter = mergeSettings(tight, { deviation_threshold_pp: "1" });
    expect(silencedWarnings(drifted(), "2027-12-31", tight, stricter).silenced).toEqual([]);
  });

  it("silences the satellite minimum on its own", () => {
    const withoutMinimum = mergeSettings(tight, { satellite_min_weight_pct: "0" });
    const result = silencedWarnings(drifted(), "2027-12-31", tight, withoutMinimum);
    expect(subjects(result.silenced)).toEqual(["satellite_below_minimum:gold"]);
  });

  it("does not claim anything when it cannot be evaluated", () => {
    const louder = mergeSettings(tight, { deviation_threshold_pp: "15" });
    const result = silencedWarnings(drifted(false), "2027-12-31", tight, louder);
    expect(result.evaluated).toBe(false);
    expect(result.silenced).toEqual([]);
    expect(result.missing_prices.sort()).toEqual(["ast_bonds", "ast_gold", "ast_world"]);
  });

  it("ignores the warnings a threshold cannot silence", () => {
    // `asset_without_target` depends on the facts, not on a parameter: dropping
    // a target must not be reported as silencing a threshold warning.
    const noTargets = mergeSettings(tight, { target_weights: { ast_world: "100" } });
    const result = silencedWarnings(drifted(), "2027-12-31", tight, noTargets);
    expect(result.silenced.every((warning) => warning.code !== "asset_without_target")).toBe(true);
  });
});
