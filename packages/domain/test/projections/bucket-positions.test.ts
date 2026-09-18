import { describe, expect, it } from "vitest";
import { Quantity } from "../../src/money/quantity.js";
import { bucketPositions } from "../../src/projections/bucket.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { Account } from "../../src/projections/state.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const USD = { currency: "USD", fx_rate: "1.25", fx_rate_date: "2027-01-11" } as const;

/** A bucket with one thesis, ten shares bought at 50 USD (1.25 USD/EUR) and a fee of 1 USD. */
const openBucket = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.thesisOpened({ thesis_id: "th1", expected_horizon_days: 90 });
  b.buy({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    quantity: "10",
    unit_price: "50",
    fee: "1",
    trade_date: "2027-01-11",
    value_date: "2027-01-13",
    ...USD,
    thesis_id: "th1",
  });
  return b;
};

const project = (b: LedgerBuilder, asOf?: string) =>
  projectLedger(b.build(), asOf === undefined ? {} : { asOf });

describe("bucketPositions", () => {
  it("shows quantity, average cost, price, value and the latent gain", () => {
    const b = openBucket();
    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      date: "2027-06-30",
      quantity: "10",
      unit_value: "62.5",
      currency: "USD",
      fx_rate: "1.25",
    });
    const view = bucketPositions(project(b), "2027-06-30", DEFAULT_SETTINGS);
    expect(view.rows).toHaveLength(1);
    const row = view.rows[0];
    // (10 × 50 + 1) / 1.25 = 400.80 € of cost, 10 × 62.5 / 1.25 = 500 € of value.
    expect(row?.cost_eur?.amount.toString()).toBe("400.8");
    expect(row?.unit_cost_eur?.amount.toString()).toBe("40.08");
    expect(row?.value_eur?.amount.toString()).toBe("500");
    expect(row?.unrealized_eur?.amount.toString()).toBe("99.2");
    expect(row?.unrealized_pct?.round(4).toString()).toBe("24.7505");
    expect(view.partial).toBe(false);
    expect(view.total_value_eur.amount.toString()).toBe("500");
    expect(view.total_cost_eur.amount.toString()).toBe("400.8");
  });

  it("carries the open thesis, its days and whether the horizon is past", () => {
    const b = openBucket();
    b.valuation({ account_id: "acc_bucket", asset_id: "ast_spec", date: "2027-06-30" });
    const state = project(b);
    const early = bucketPositions(state, "2026-10-01", DEFAULT_SETTINGS).rows[0];
    expect(early).toMatchObject({
      thesis_id: "th1",
      expected_horizon_days: 90,
      horizon_exceeded: false,
      invalidation: "test invalidation",
    });
    // The thesis is dated by the `recorded_at` of its opening, which is an
    // administrative date, not a business one (data-schema.md §6.4).
    expect(early?.days_open).toBe(30);
    expect(bucketPositions(state, "2027-12-31", DEFAULT_SETTINGS).rows[0]?.horizon_exceeded).toBe(
      true,
    );
  });

  it("does not attribute a position to a thesis that had not been opened yet", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.recordedAt("2027-01-05");
    b.thesisOpened({ thesis_id: "th_first" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: "50",
      fee: "1",
      trade_date: "2027-01-11",
      value_date: "2027-01-13",
      ...USD,
      thesis_id: "th_first",
    });
    b.recordedAt("2027-02-01");
    b.thesisClosed("th_first");
    b.recordedAt("2027-09-01");
    b.thesisOpened({ thesis_id: "th_later" });
    const state = project(b);
    // In June the second thesis was three months away and the first was closed:
    // the row carries no thesis at all.
    const june = bucketPositions(state, "2027-06-30", DEFAULT_SETTINGS).rows[0];
    expect(june?.thesis_id).toBeUndefined();
    expect(june?.days_open).toBeUndefined();
    const december = bucketPositions(state, "2027-12-31", DEFAULT_SETTINGS).rows[0];
    expect(december?.thesis_id).toBe("th_later");
    expect(december?.days_open).toBe(121);
  });

  it("keeps the row without a price, with no value and no P&L, and says the total is partial", () => {
    const view = bucketPositions(project(openBucket()), "2027-06-30", DEFAULT_SETTINGS);
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]?.price).toBeUndefined();
    expect(view.rows[0]?.value_eur).toBeUndefined();
    expect(view.rows[0]?.unrealized_eur).toBeUndefined();
    // The cost is known even without a price: it comes from the ledger.
    expect(view.rows[0]?.cost_eur?.amount.toString()).toBe("400.8");
    expect(view.partial).toBe(true);
    expect(view.missing_prices).toEqual(["ast_spec"]);
    expect(view.warnings.map((w) => w.code)).toContain("partial_bucket_total");
  });

  it("marks a stale price and still uses it", () => {
    const b = openBucket();
    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      date: "2027-06-30",
      unit_value: "62.5",
      currency: "USD",
      fx_rate: "1.25",
    });
    const view = bucketPositions(
      project(b),
      "2027-07-31",
      mergeSettings(DEFAULT_SETTINGS, { stale_price_days: 5 }),
    );
    expect(view.rows[0]?.price?.stale).toBe(true);
    expect(view.rows[0]?.value_eur?.amount.toString()).toBe("500");
    expect(view.stale_prices).toEqual(["ast_spec"]);
    expect(view.warnings.map((w) => w.code)).toContain("stale_price");
  });

  it("shows a position whose thesis was closed, with the thesis columns empty", () => {
    const b = openBucket();
    b.thesisClosed("th1");
    const view = bucketPositions(project(b), "2027-06-30", DEFAULT_SETTINGS);
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]?.thesis_id).toBeUndefined();
    expect(view.rows[0]?.days_open).toBeUndefined();
  });

  it("leaves the core out of every row and total (constitution III)", () => {
    const b = openBucket();
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
    b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date: "2027-06-30" });
    const view = bucketPositions(project(b), "2027-06-30", DEFAULT_SETTINGS);
    expect(view.rows.map((row) => row.asset_id)).toEqual(["ast_spec"]);
  });

  it("reads the quantities of the date asked, not the ones at the end of the ledger", () => {
    const b = openBucket();
    b.sell({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: "60",
      trade_date: "2027-09-01",
      ...USD,
      thesis_id: "th1",
    });
    expect(bucketPositions(project(b), "2027-12-31", DEFAULT_SETTINGS).rows).toHaveLength(0);
    const before = bucketPositions(project(b, "2027-06-30"), "2027-06-30", DEFAULT_SETTINGS);
    expect(before.rows[0]?.quantity.toString()).toBe("10");
  });

  it("says 'no cost' for a position with no open lots instead of dividing by zero", () => {
    // The shape `integrity` reports as `lots_mismatch`: a ledger edited by hand
    // can hold a position no lot backs. The view degrades; it does not crash.
    const state = project(openBucket());
    state.positions.set("acc_bucket|ast_spec2", Quantity.parse("5"));
    state.accounts.set("acc_bucket2", state.accounts.get("acc_bucket") as Account);
    const view = bucketPositions(state, "2027-06-30", DEFAULT_SETTINGS);
    const orphan = view.rows.find((row) => row.asset_id === "ast_spec2");
    expect(orphan?.unit_cost_eur).toBeUndefined();
    expect(orphan?.cost_eur).toBeUndefined();
    expect(orphan?.unrealized_eur).toBeUndefined();
  });

  it("orders the rows by account and then by asset", () => {
    const b = openBucket();
    b.account("acc_bucket2", { book: "bucket", platform: "ibkr" });
    b.asset("ast_spec2", { book: "bucket", asset_type: "stock", transferable: false });
    b.thesisOpened({ thesis_id: "th2", account_id: "acc_bucket2", asset_id: "ast_spec2" });
    b.buy({
      account_id: "acc_bucket2",
      asset_id: "ast_spec2",
      quantity: "3",
      unit_price: "10",
      trade_date: "2027-02-01",
      value_date: "2027-02-03",
      thesis_id: "th2",
    });
    const rows = bucketPositions(project(b), "2027-06-30", DEFAULT_SETTINGS).rows;
    expect(rows.map((row) => `${row.account_id}|${row.asset_id}`)).toEqual([
      "acc_bucket|ast_spec",
      "acc_bucket2|ast_spec2",
    ]);
  });

  it("shows the latent gain of a free position without a percentage over zero cost", () => {
    // Shares received for nothing (a `grant` with zero cost: rights of a stock
    // dividend, a crypto fork): the gain is the whole value, and there is no
    // percentage to compute over a cost of zero.
    const b = openBucket();
    b.asset("ast_free", { book: "bucket", asset_type: "stock", transferable: false });
    b.corporateAction({
      kind: "stock_dividend",
      asset_id: "ast_spec",
      effects: [
        {
          op: "grant",
          asset_id: "ast_free",
          per_account: [{ account_id: "acc_bucket", quantity: "5" }],
          unit_cost: "0",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-03-01",
          acquisition_date: "2027-03-01",
        },
      ],
    });
    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_free",
      date: "2027-06-30",
      quantity: "5",
      unit_value: "3",
    });
    const row = bucketPositions(project(b), "2027-06-30", DEFAULT_SETTINGS).rows.find(
      (candidate) => candidate.asset_id === "ast_free",
    );
    expect(row?.cost_eur?.isZero()).toBe(true);
    expect(row?.unrealized_eur?.amount.toString()).toBe("15");
    expect(row?.unrealized_pct).toBeUndefined();
  });

  it("has nothing to show when the bucket is empty", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const view = bucketPositions(project(b), "2027-06-30", DEFAULT_SETTINGS);
    expect(view.rows).toEqual([]);
    expect(view.partial).toBe(false);
    expect(view.total_value_eur.isZero()).toBe(true);
  });
});
