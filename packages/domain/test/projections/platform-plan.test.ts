import { describe, expect, it } from "vitest";
import { Money } from "../../src/money/money.js";
import {
  accountHolding,
  feeEstimate,
  type Order,
  platformPlan,
} from "../../src/projections/platform-plan.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";

const order = (asset_id: string, amount: string): Order => ({
  asset_id,
  amount_eur: Money.parse(amount, "EUR"),
});

/** Equity fund and bonds in `acc_fund` with 20 EUR of cash left; gold in `acc_etf` bought with a 3 USD fee. */
const held = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.deposit({ account_id: "acc_fund", amount: "9320", value_date: "2027-01-01" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "58", unit_price: "100" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_bonds", quantity: "35", unit_price: "100" });
  b.buy({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    quantity: "7",
    unit_price: "100",
    currency: "USD",
    fee: "3",
  });
  return b;
};

const run = (b: LedgerBuilder, orders: Order[], choose?: Map<string, string>) => {
  const events = b.build();
  return platformPlan(projectLedger(events), events, DATE, orders, choose);
};

describe("platformPlan", () => {
  it("groups the purchases by account and says how much to deposit", () => {
    const result = run(held(), [order("ast_world", "80"), order("ast_gold", "820")]);
    expect(result.unassigned).toEqual([]);
    expect(result.rows.map((row) => row.account_id)).toEqual(["acc_etf", "acc_fund"]);
    const [etf, fund] = result.rows;
    // Gold: 820 plus the 3 the last purchase paid, and no cash in euros to cover it.
    expect(etf?.buy_eur.amount.toString()).toBe("820");
    expect(etf?.fees_eur.amount.toString()).toBe("3");
    expect(etf?.deposit_eur.amount.toString()).toBe("823");
    expect(etf?.platform).toBe("ibkr");
    expect(etf?.lines[0]?.fee?.basis).toBe("same_asset");
    // Fund: 80 to buy, 20 already there, no fee.
    expect(fund?.cash_eur?.amount.toString()).toBe("20");
    expect(fund?.deposit_eur.amount.toString()).toBe("60");
    expect(fund?.costliest_asset_id).toBeUndefined();
  });

  it("never asks to deposit a negative amount when the cash covers the purchases", () => {
    const result = run(held(), [order("ast_world", "10")]);
    expect(result.rows[0]?.deposit_eur.amount.toString()).toBe("0");
  });

  it("points at the line with the highest commission over its amount", () => {
    const result = run(held(), [order("ast_gold", "300"), order("ast_gold", "820")]);
    expect(result.rows[0]?.costliest_asset_id).toBe("ast_gold");
    expect(result.rows[0]?.lines.map((line) => line.fee_pct?.toString())).toEqual([
      "1",
      "0.36585366",
    ]);
  });

  it("puts an asset that sits nowhere apart and lets the owner choose its account", () => {
    const b = held();
    b.asset("ast_mm", { asset_class: "fixed_income" });
    b.account("acc_old", { active: false });
    const apart = run(b, [order("ast_mm", "50")]);
    expect(apart.rows).toEqual([]);
    // Only active core accounts are offered: neither the bucket nor a closed one.
    expect(apart.unassigned).toEqual([
      { ...order("ast_mm", "50"), candidates: ["acc_etf", "acc_fund"] },
    ]);
    const chosen = run(b, [order("ast_mm", "50")], new Map([["ast_mm", "acc_fund"]]));
    expect(chosen.unassigned).toEqual([]);
    expect(chosen.rows[0]?.account_id).toBe("acc_fund");
    // A fund bought there before gives the fee of the same type of asset.
    expect(chosen.rows[0]?.lines[0]?.fee?.basis).toBe("same_asset_type");
    for (const bad of ["acc_bucket", "acc_old", "acc_missing"]) {
      expect(run(b, [order("ast_mm", "50")], new Map([["ast_mm", bad]])).unassigned).toHaveLength(
        1,
      );
    }
  });

  it("does not convert the cash of an account kept in another currency", () => {
    const b = new LedgerBuilder();
    b.account("acc_usd", { base_currency: "USD", platform: "ibkr" });
    b.asset("ast_gold", { asset_type: "etc", asset_class: "gold", transferable: false });
    b.buy({ account_id: "acc_usd", asset_id: "ast_gold", fee: "2" });
    const row = run(b, [order("ast_gold", "100")]).rows[0];
    expect(row?.foreign_currency).toBe(true);
    expect(row?.cash_eur).toBeUndefined();
    expect(row?.deposit_eur.amount.toString()).toBe("102");
  });

  it("skips an order of zero euros", () => {
    const result = run(held(), [order("ast_world", "0")]);
    expect(result).toEqual({ rows: [], unassigned: [] });
  });
});

describe("accountHolding", () => {
  it("takes the account with the larger position and, on a tie, the first id", () => {
    const b = held();
    b.account("acc_two");
    b.buy({ account_id: "acc_two", asset_id: "ast_world", quantity: "58", unit_price: "100" });
    expect(accountHolding(projectLedger(b.build()), "ast_world")).toBe("acc_fund");
    b.buy({ account_id: "acc_two", asset_id: "ast_world", quantity: "1", unit_price: "100" });
    expect(accountHolding(projectLedger(b.build()), "ast_world")).toBe("acc_two");
  });

  it("is undefined for an asset nobody holds", () => {
    expect(accountHolding(projectLedger(held().build()), "ast_nothing")).toBeUndefined();
  });
});

describe("feeEstimate", () => {
  const query = (account_id: string, asset_id: string, side: "buy" | "sell" = "buy") => ({
    side,
    account_id,
    asset_id,
  });

  it("is unknown, never zero, when the ledger has no equivalent trade", () => {
    const b = held();
    const events = b.build();
    const state = projectLedger(events);
    expect(feeEstimate(state, events, DATE, query("acc_fund", "ast_gold"))).toBeUndefined();
    expect(feeEstimate(state, events, DATE, query("acc_etf", "ast_gold", "sell"))).toBeUndefined();
  });

  it("reads the last trade of the same asset, converted to euros, with its date", () => {
    const b = held();
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      quantity: "1",
      value_date: "2027-03-01",
      currency: "USD",
      fx_rate: "2",
      fee: "5",
    });
    const events = b.build();
    const state = projectLedger(events);
    const estimate = feeEstimate(state, events, DATE, query("acc_etf", "ast_gold"));
    expect(estimate?.fee_eur.amount.toString()).toBe("2.5");
    expect(estimate?.as_of).toBe("2027-03-01");
    // Asked as of a day before that purchase, it falls back to the earlier one.
    expect(
      feeEstimate(
        state,
        events,
        "2027-02-01",
        query("acc_etf", "ast_gold"),
      )?.fee_eur.amount.toString(),
    ).toBe("3");
  });

  it("prefers the same asset over a more recent trade of the same type", () => {
    const b = held();
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", value_date: "2027-02-01", fee: "1" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_bonds", value_date: "2027-03-01", fee: "9" });
    const events = b.build();
    const state = projectLedger(events);
    expect(
      feeEstimate(state, events, DATE, query("acc_fund", "ast_world"))?.fee_eur.amount.toString(),
    ).toBe("1");
  });
});
