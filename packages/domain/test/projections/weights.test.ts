import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import type { ExternalPrices } from "../../src/projections/prices.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { coreWeights } from "../../src/projections/weights.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";

const settings = (extra: Partial<Settings>): Settings => mergeSettings(DEFAULT_SETTINGS, extra);

/** 600 EUR of ast_world, 300 of ast_bonds and 100 of ast_gold: 60/30/10 by value. */
const balanced = (): LedgerBuilder => {
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

const TARGETS = { ast_world: "60", ast_bonds: "30", ast_gold: "10" };
const weightsOf = (b: LedgerBuilder, extra: Partial<Settings> = {}) =>
  coreWeights(projectLedger(b.build()), DATE, settings({ target_weights: TARGETS, ...extra }));

const codes = (result: { warnings: { code: string }[] }): string[] =>
  result.warnings.map((warning) => warning.code);

describe("coreWeights", () => {
  it("values every core asset, weights it and compares it with its target", () => {
    const result = weightsOf(balanced());
    expect(result.total_eur.amount.toString()).toBe("1000");
    expect(result.partial).toBe(false);
    expect(
      result.rows.map((row) => [
        row.asset_id,
        row.value_eur?.amount.toString(),
        row.weight_pct?.toString(),
        row.deviation_pp?.toString(),
      ]),
    ).toEqual([
      ["ast_world", "600", "60", "0"],
      ["ast_bonds", "300", "30", "0"],
      ["ast_gold", "100", "10", "0"],
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("groups by asset class, in the order of the plan", () => {
    const result = weightsOf(balanced());
    expect(
      result.by_class.map((subtotal) => [
        subtotal.asset_class,
        subtotal.value_eur.amount.toString(),
        subtotal.weight_pct?.toString(),
      ]),
    ).toEqual([
      ["equity", "600", "60"],
      ["fixed_income", "300", "30"],
      ["gold", "100", "10"],
    ]);
  });

  it("never shows a bucket asset (constitution III)", () => {
    const b = balanced();
    b.thesisOpened({ thesis_id: "th", account_id: "acc_bucket", asset_id: "ast_spec" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: "50",
      thesis_id: "th",
    });
    b.valuation({ account_id: "acc_bucket", asset_id: "ast_spec", date: DATE, unit_value: "50" });
    const result = weightsOf(b);
    expect(result.rows.map((row) => row.asset_id)).not.toContain("ast_spec");
    expect(result.total_eur.amount.toString()).toBe("1000");
  });

  it("marks the total partial and blanks every weight when a held asset has no price", () => {
    const b = balanced();
    b.asset("ast_mm", { asset_class: "fixed_income", asset_type: "money_market" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_mm", quantity: "5", unit_price: "100" });
    const result = weightsOf(b);
    expect(result.partial).toBe(true);
    expect(result.missing_prices).toEqual(["ast_mm"]);
    expect(result.rows.every((row) => row.weight_pct === undefined)).toBe(true);
    expect(result.by_class.every((subtotal) => subtotal.weight_pct === undefined)).toBe(true);
    expect(codes(result)).toContain("partial_core_total");
    // The partial total only adds up what does have a price; it is never presented as complete.
    expect(result.total_eur.amount.toString()).toBe("1000");
  });

  it("marks the subtotal of a class whose member is held without a price", () => {
    const b = balanced();
    b.asset("ast_mm", { asset_class: "fixed_income", asset_type: "money_market" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_mm", quantity: "5", unit_price: "100" });
    const result = weightsOf(b);
    const partialOf = (asset_class: string) =>
      result.by_class.find((subtotal) => subtotal.asset_class === asset_class)?.partial;
    expect(partialOf("fixed_income")).toBe(true);
    // The other classes are whole even though the core total is not.
    expect(partialOf("equity")).toBe(false);
    expect(partialOf("gold")).toBe(false);
  });

  it("shows an asset with a target and no position at zero, without making the total partial", () => {
    const b = balanced();
    b.asset("ast_mm", { asset_class: "fixed_income", asset_type: "money_market" });
    const result = weightsOf(b, {
      target_weights: { ast_world: "50", ast_bonds: "30", ast_gold: "10", ast_mm: "10" },
    });
    const row = result.rows.find((entry) => entry.asset_id === "ast_mm");
    expect(row?.quantity.toString()).toBe("0");
    expect(row?.value_eur?.amount.toString()).toBe("0");
    expect(row?.price).toBeUndefined();
    expect(row?.weight_pct?.toString()).toBe("0");
    expect(row?.deviation_pp?.toString()).toBe("-10");
    expect(result.partial).toBe(false);
    expect(result.missing_prices).toEqual([]);
  });

  it("warns about a target weight that is not a core asset, and about a position without a target", () => {
    const result = weightsOf(balanced(), {
      target_weights: { ast_world: "60", ast_bonds: "30", ast_spec: "10" },
    });
    expect(codes(result)).toContain("unknown_target_weight");
    expect(codes(result)).toContain("asset_without_target");
    expect(result.rows.find((row) => row.asset_id === "ast_gold")?.target_pct.toString()).toBe("0");
  });

  it("warns above the deviation threshold, and stays quiet exactly at it", () => {
    // ast_world at 60 % against a target of 55: a deviation of 5 pp.
    const overweight = { ast_world: "55", ast_bonds: "35", ast_gold: "10" };
    expect(
      codes(weightsOf(balanced(), { target_weights: overweight, deviation_threshold_pp: "5" })),
    ).not.toContain("deviation_above_threshold");
    expect(
      codes(weightsOf(balanced(), { target_weights: overweight, deviation_threshold_pp: "4.9" })),
    ).toContain("deviation_above_threshold");
    // Without the parameter the rule is not evaluated at all.
    expect(codes(weightsOf(balanced(), { target_weights: overweight }))).not.toContain(
      "deviation_above_threshold",
    );
  });

  it("warns about a satellite below its minimum, but not at zero nor exactly at the minimum", () => {
    expect(codes(weightsOf(balanced(), { satellite_min_weight_pct: "12" }))).toContain(
      "satellite_below_minimum",
    );
    expect(codes(weightsOf(balanced(), { satellite_min_weight_pct: "10" }))).not.toContain(
      "satellite_below_minimum",
    );
    // A satellite at 0 % is a valid choice (rule 6b: 0 % or at least the minimum).
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "6", unit_price: "100" });
    b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date: DATE, unit_value: "100" });
    expect(
      codes(
        coreWeights(
          projectLedger(b.build()),
          DATE,
          settings({ target_weights: { ast_world: "100" }, satellite_min_weight_pct: "10" }),
        ),
      ),
    ).not.toContain("satellite_below_minimum");
  });

  it("reports a stale price without refusing to compute", () => {
    const b = balanced();
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-12-20",
      unit_value: "100",
    });
    const result = weightsOf(b, { stale_price_days: 5 });
    expect(result.stale_prices).toEqual([]);
    const older = weightsOf(
      (() => {
        const c = new LedgerBuilder();
        catalogue(c);
        c.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "6", unit_price: "100" });
        c.valuation({
          account_id: "acc_fund",
          asset_id: "ast_world",
          date: "2027-12-01",
          unit_value: "100",
        });
        return c;
      })(),
      { stale_price_days: 5, target_weights: { ast_world: "100" } },
    );
    expect(older.stale_prices).toEqual(["ast_world"]);
    expect(codes(older)).toContain("stale_price");
    expect(older.partial).toBe(false);
  });

  it("answers with empty tables on a ledger without core assets", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const result = coreWeights(projectLedger(b.build()), DATE, DEFAULT_SETTINGS);
    expect(result.rows).toEqual([]);
    expect(result.by_class).toEqual([]);
    expect(result.total_eur.amount.toString()).toBe("0");
    expect(result.partial).toBe(false);
  });
});

describe("coreWeights as of a date", () => {
  /**
   * The reviewer's scenario: 10 of each fund in 2027 and 90 more of ast_world
   * in 2028. Read at a 2027 date, the table must be the portfolio of 2027, not
   * the one of 2028 valued with the prices of 2027.
   */
  const grown = (): LedgerBuilder => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2027-01-11",
      quantity: "10",
      unit_price: "100",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      value_date: "2027-01-11",
      quantity: "10",
      unit_price: "100",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-01-31",
      unit_value: "100",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      date: "2027-01-31",
      unit_value: "100",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2028-01-11",
      quantity: "90",
      unit_price: "100",
    });
    return b;
  };

  const HALVES = { ast_world: "50", ast_bonds: "50" };
  const MID = "2027-06-30";

  it("uses the position of the date asked, not the one of the end of the ledger", () => {
    const events = grown().build();
    const asked = coreWeights(
      projectLedger(events, { asOf: MID }),
      MID,
      settings({ target_weights: HALVES }),
    );
    expect(
      asked.rows.map((row) => [
        row.asset_id,
        row.quantity.toString(),
        row.value_eur?.amount.toString(),
        row.weight_pct?.toString(),
        row.deviation_pp?.toString(),
      ]),
    ).toEqual([
      ["ast_world", "10", "1000", "50", "0"],
      ["ast_bonds", "10", "1000", "50", "0"],
    ]);
    expect(asked.total_eur.amount.toString()).toBe("2000");
  });

  it("without the cut, the same date reports the position of 2028", () => {
    const whole = coreWeights(
      projectLedger(grown().build()),
      MID,
      settings({
        target_weights: HALVES,
      }),
    );
    expect(whole.rows.map((row) => row.quantity.toString())).toEqual(["100", "10"]);
    expect(whole.total_eur.amount.toString()).toBe("11000");
  });
});

const noRate013 = (asset: string): ExternalPrices => ({
  at: (assetId) =>
    assetId === asset
      ? {
          date: "2028-01-05",
          unit_value: Decimal.parse("5000"),
          currency: "GBX",
          source: "eodhd",
          fx_missing: "currency_not_published",
        }
      : undefined,
});

describe("coreWeights with a quote that has no rate (feature 013)", () => {
  it("uses the last price with euros, and carries the newer quote without them as information", () => {
    const state = projectLedger(balanced().build());
    const result = coreWeights(
      state,
      "2028-01-10",
      settings({ target_weights: TARGETS }),
      noRate013("ast_gold"),
    );
    // Review of PR #78: a quote in pence of every day must not leave the whole
    // core without weights while the ledger has a valuation with its rate.
    expect(result.partial).toBe(false);
    const gold = result.rows.find((row) => row.asset_id === "ast_gold");
    expect(gold?.price).toMatchObject({ origin: "manual", currency: "USD" });
    expect(gold?.price?.newer_quote).toMatchObject({
      currency: "GBX",
      fx_missing: "currency_not_published",
    });
  });

  it("never adds up in euros a quote that has none, when it is all there is: partial, and said", () => {
    const b = balanced();
    const events = b
      .build()
      .filter((event) => !(event.type === "valuation" && event.asset_id === "ast_gold"));
    const result = coreWeights(
      projectLedger(events),
      "2028-01-10",
      settings({ target_weights: TARGETS }),
      noRate013("ast_gold"),
    );
    expect(result.partial).toBe(true);
    expect(result.missing_prices).toEqual(["ast_gold"]);
    expect(result.rows.find((row) => row.asset_id === "ast_gold")?.price?.currency).toBe("GBX");
    expect(codes(result)).toContain("price_without_eur_value");
  });
});
