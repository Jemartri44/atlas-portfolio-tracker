import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerState } from "../../src/projections/state.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const EUR = { currency: "EUR", fx_rate: "1" } as const;

const codes = (state: LedgerState, code: string) =>
  state.warnings.filter((warning) => warning.code === code);

/** A stock bought, sold at a loss, and bought again on `repurchase`. */
const stockCycle = (repurchase?: string): LedgerState => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.thesisOpened({ thesis_id: "t1", planned_size_eur: "100000" });
  b.buy({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    quantity: "10",
    unit_price: "10",
    fee: "0",
    ...EUR,
    trade_date: "2027-01-10",
    value_date: "2027-01-12",
    thesis_id: "t1",
  });
  b.sell({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    quantity: "10",
    unit_price: "8",
    fee: "0",
    ...EUR,
    trade_date: "2027-02-10",
    thesis_id: "t1",
  });
  b.thesisClosed("t1");
  if (repurchase !== undefined) {
    b.thesisOpened({ thesis_id: "t2", planned_size_eur: "100000" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: "8",
      fee: "0",
      ...EUR,
      trade_date: repurchase,
      value_date: repurchase,
      thesis_id: "t2",
    });
  }
  return projectLedger(b.build());
};

describe("wash_sale_window_repurchase: buying back after a loss", () => {
  it("warns on the last day of the window and not on the next one (two months, a stock)", () => {
    const inside = codes(stockCycle("2027-04-10"), "wash_sale_window_repurchase");
    expect(inside).toHaveLength(1);
    expect(inside[0]?.details).toMatchObject({
      asset_id: "ast_spec",
      sale_date: "2027-02-10",
      window_end: "2027-04-10",
      loss_eur: "-20",
      window: "2m",
    });
    expect(codes(stockCycle("2027-04-11"), "wash_sale_window_repurchase")).toEqual([]);
  });

  it("warns at eleven months and not at thirteen for a fund (one year)", () => {
    const fundCycle = (repurchase: string): LedgerState => {
      const b = new LedgerBuilder();
      catalogue(b);
      b.buy({
        account_id: "acc_fund",
        asset_id: "ast_world",
        quantity: "10",
        unit_price: "10",
        ...EUR,
        trade_date: "2027-01-10",
        value_date: "2027-01-12",
      });
      b.sell({
        account_id: "acc_fund",
        asset_id: "ast_world",
        quantity: "10",
        unit_price: "8",
        ...EUR,
        trade_date: "2027-02-10",
        value_date: "2027-02-10",
      });
      b.buy({
        account_id: "acc_fund",
        asset_id: "ast_world",
        quantity: "5",
        unit_price: "8",
        ...EUR,
        trade_date: repurchase,
        value_date: repurchase,
      });
      return projectLedger(b.build());
    };
    // A fund is taxed by value date and its window is a year (ADR-0013/0014).
    expect(codes(fundCycle("2028-01-10"), "wash_sale_window_repurchase")).toHaveLength(1);
    expect(codes(fundCycle("2028-02-10"), "wash_sale_window_repurchase")).toHaveLength(1);
    expect(codes(fundCycle("2028-03-10"), "wash_sale_window_repurchase")).toEqual([]);
  });

  it("does not warn when the sale made money", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: "2027-01-10",
      value_date: "2027-01-12",
    });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "13",
      ...EUR,
      trade_date: "2027-02-10",
      value_date: "2027-02-10",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "5",
      unit_price: "13",
      ...EUR,
      trade_date: "2027-03-10",
      value_date: "2027-03-10",
    });
    const state = projectLedger(b.build());
    expect(codes(state, "wash_sale_window_repurchase")).toEqual([]);
    expect(codes(state, "wash_sale_window_prior_buy")).toEqual([]);
  });

  it("does not warn about another asset, however close the dates are", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: "2027-01-10",
      value_date: "2027-01-12",
    });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "8",
      ...EUR,
      trade_date: "2027-02-10",
      value_date: "2027-02-10",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: "2027-02-11",
      value_date: "2027-02-11",
    });
    expect(codes(projectLedger(b.build()), "wash_sale_window_repurchase")).toEqual([]);
  });
});

describe("wash_sale_window_prior_buy: selling at a loss after buying", () => {
  it("warns about a purchase inside the previous window and not about an older one", () => {
    const cycle = (buyDate: string): LedgerState => {
      const b = new LedgerBuilder();
      catalogue(b);
      b.thesisOpened({ thesis_id: "t1", planned_size_eur: "100000" });
      b.buy({
        account_id: "acc_bucket",
        asset_id: "ast_spec",
        quantity: "10",
        unit_price: "10",
        fee: "0",
        ...EUR,
        trade_date: buyDate,
        value_date: buyDate,
        thesis_id: "t1",
      });
      b.sell({
        account_id: "acc_bucket",
        asset_id: "ast_spec",
        quantity: "10",
        unit_price: "8",
        fee: "0",
        ...EUR,
        trade_date: "2027-03-10",
        thesis_id: "t1",
      });
      return projectLedger(b.build());
    };
    // Exactly two months before the sale: inside. One day earlier: outside.
    const inside = codes(cycle("2027-01-10"), "wash_sale_window_prior_buy");
    expect(inside).toHaveLength(1);
    expect(inside[0]?.details).toMatchObject({
      asset_id: "ast_spec",
      buy_date: "2027-01-10",
      window_start: "2027-01-10",
      quantity: "10",
      window: "2m",
    });
    expect(codes(cycle("2027-01-09"), "wash_sale_window_prior_buy")).toEqual([]);
  });

  it("warns once per purchase inside the window", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    for (const date of ["2027-02-01", "2027-02-15", "2027-03-01"]) {
      b.buy({
        account_id: "acc_fund",
        asset_id: "ast_world",
        quantity: "5",
        unit_price: "10",
        ...EUR,
        trade_date: date,
        value_date: date,
      });
    }
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "15",
      unit_price: "6",
      ...EUR,
      trade_date: "2027-06-01",
      value_date: "2027-06-01",
    });
    expect(codes(projectLedger(b.build()), "wash_sale_window_prior_buy")).toHaveLength(3);
  });

  it("applies to both books: the rule is fiscal, not of the bucket", () => {
    const bucket = stockCycle("2027-04-10");
    expect(codes(bucket, "wash_sale_window_repurchase")).toHaveLength(1);
    // And the sale of the bucket itself warned about its own purchase.
    expect(codes(bucket, "wash_sale_window_prior_buy")).toHaveLength(1);
  });

  it("does not count as a purchase what the rule does not count (a transfer in)", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: "2026-01-10",
      value_date: "2026-01-12",
    });
    b.transfer({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      quantity_out: "10",
      nav_out: "10",
      value_date_out: "2027-05-01",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_in: "10",
      nav_in: "10",
      value_date_in: "2027-05-03",
    });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      quantity: "10",
      unit_price: "6",
      ...EUR,
      trade_date: "2027-06-01",
      value_date: "2027-06-01",
    });
    // The transfer in is not an acquisition (data-schema.md §8.4), so the loss
    // on the destination fund warns about nothing.
    expect(codes(projectLedger(b.build()), "wash_sale_window_prior_buy")).toEqual([]);
  });
});
