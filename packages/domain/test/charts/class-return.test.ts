// The return of each class of the core, worked out by hand case by case.

import { describe, expect, it } from "vitest";
import { classReturns } from "../../src/charts.js";
import type { AssetClass } from "../../src/schema/events.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const END = "2028-01-05";

const bought = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    value_date: "2027-01-05",
    quantity: "10",
  });
  return b;
};

const worth = (
  b: LedgerBuilder,
  asset: string,
  quantity: string,
  unit: string,
  date = END,
): void => {
  b.valuation({ account_id: "acc_fund", asset_id: asset, date, quantity, unit_value: unit });
};

const of = (b: LedgerBuilder, assetClass: AssetClass) =>
  classReturns(b.build(), END).classes.find((row) => row.asset_class === assetClass);

describe("classReturns", () => {
  it("is the plain yearly return for one purchase held exactly a year: 1000 → 1100 is +10 %", () => {
    const b = bought();
    worth(b, "ast_world", "10", "110");
    const equity = of(b, "equity");
    expect(equity?.invested_eur?.amount.toString()).toBe("1000");
    expect(equity?.value_eur?.amount.toString()).toBe("1100");
    expect(equity?.gain_eur?.amount.toString()).toBe("100");
    expect(equity?.gain_pct?.toString()).toBe("10");
    expect(equity?.xirr_pct?.toString()).toBe("10");
    expect(equity?.gap).toBeUndefined();
  });

  it("counts what came back: a sale and a dividend net of what was withheld", () => {
    const b = bought();
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2027-07-05",
      quantity: "5",
      unit_price: "120",
      withholding: "10",
    });
    b.dividend({
      account_id: "acc_fund",
      asset_id: "ast_world",
      gross: "20",
      withholding_origin: "5",
    });
    worth(b, "ast_world", "5", "110");
    const equity = of(b, "equity");
    // 590 from the sale (600 less 10 withheld) plus 15 net of the dividend came back; 550 is left.
    expect(equity?.returned_eur?.amount.toString()).toBe("605");
    expect(equity?.gain_eur?.amount.toString()).toBe("155");
  });

  it("moves the money of a swap from one class to the other", () => {
    const b = bought();
    b.swap({
      account_id: "acc_fund",
      from_asset_id: "ast_world",
      to_asset_id: "ast_bonds",
      value_date: "2027-07-05",
      quantity_out: "1",
      market_value_out: "100",
      market_value_in: "100",
    });
    worth(b, "ast_world", "9", "100");
    worth(b, "ast_bonds", "1", "100");
    expect(of(b, "equity")?.returned_eur?.amount.toString()).toBe("100");
    expect(of(b, "fixed_income")?.invested_eur?.amount.toString()).toBe("100");
  });

  it("measures a class that was bought and sold out entirely", () => {
    const b = bought();
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2027-07-05",
      quantity: "10",
      unit_price: "110",
    });
    const equity = of(b, "equity");
    expect(equity?.value_eur?.amount.toString()).toBe("0");
    expect(equity?.gain_eur?.amount.toString()).toBe("100");
  });

  it("gives no figure for a class that had something not modelled, and says what", () => {
    const b = bought();
    b.corporateAction({
      kind: "split",
      asset_id: "ast_world",
      effects: [{ op: "scale", ratio: "2" }],
    });
    worth(b, "ast_world", "20", "55");
    expect(of(b, "equity")).toEqual({
      asset_class: "equity",
      gap: "unsupported_events",
      unsupported_events: ["corporate_action"],
    });
    expect(of(b, "gold")?.gap).toBe("no_flows");
  });

  it("flags both classes of a transfer that changes class", () => {
    const b = bought();
    b.asset("ast_mm", { asset_class: "fixed_income", asset_type: "money_market" });
    b.transfer({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      quantity_out: "10",
      nav_out: "100",
      value_date_out: "2027-02-05",
      to_account_id: "acc_fund",
      to_asset_id: "ast_mm",
      quantity_in: "10",
      nav_in: "100",
      value_date_in: "2027-02-06",
    });
    worth(b, "ast_mm", "10", "100");
    expect(of(b, "equity")?.unsupported_events).toEqual(["transfer"]);
    expect(of(b, "fixed_income")?.unsupported_events).toEqual(["transfer"]);
  });

  it("gives no figure with a held asset of the class unpriced, and none for an absurd rate", () => {
    expect(of(bought(), "equity")?.gap).toBe("partial");
    const b = bought();
    worth(b, "ast_world", "10", "10000");
    expect(of(b, "equity")?.gap).toBe("no_rate");
    expect(of(b, "equity")?.gain_eur?.amount.toString()).toBe("99000");
  });

  it("ignores a bucket asset entirely, and has no percentage for a class that only received income", () => {
    const b = bought();
    b.thesisOpened({ thesis_id: "t1" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      thesis_id: "t1",
      currency: "EUR",
      quantity: "5",
    });
    b.corporateAction({
      kind: "split",
      asset_id: "ast_spec",
      effects: [{ op: "scale", ratio: "2" }],
    });
    b.dividend({ account_id: "acc_etf", asset_id: "ast_gold", gross: "10" });
    worth(b, "ast_world", "10", "110");
    expect(of(b, "equity")?.invested_eur?.amount.toString()).toBe("1000");
    const gold = of(b, "gold");
    expect(gold?.gain_pct).toBeUndefined();
    expect(gold?.gap).toBe("no_rate");
  });

  it("ignores flows after the date", () => {
    const b = bought();
    worth(b, "ast_world", "10", "110");
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2028-06-01",
      quantity: "10",
    });
    expect(of(b, "equity")?.invested_eur?.amount.toString()).toBe("1000");
  });

  it("flags every class a corporate action touches, destination included, but only once it happened", () => {
    const b = bought();
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      value_date: "2027-01-05",
      quantity: "10",
    });
    b.corporateAction({
      kind: "merger",
      asset_id: "ast_world",
      effects: [{ op: "convert", to_asset_id: "ast_bonds", ratio: "1" }],
    });
    expect(of(b, "equity")?.unsupported_events).toEqual(["corporate_action"]);
    expect(of(b, "fixed_income")?.unsupported_events).toEqual(["corporate_action"]);

    const later = bought();
    later.corporateAction({
      kind: "split",
      asset_id: "ast_world",
      effective_date: "2029-03-01",
      effects: [{ op: "scale", ratio: "2" }],
    });
    worth(later, "ast_world", "10", "110");
    expect(of(later, "equity")?.gap).toBeUndefined();
  });

  it("nets a swap inside one class to the difference that moved", () => {
    const b = bought();
    b.asset("ast_eq2", { asset_class: "equity" });
    b.swap({
      account_id: "acc_fund",
      from_asset_id: "ast_world",
      to_asset_id: "ast_eq2",
      value_date: "2027-07-05",
      market_value_out: "100",
      market_value_in: "105",
    });
    worth(b, "ast_world", "9", "100");
    worth(b, "ast_eq2", "1", "105");
    const equity = of(b, "equity");
    expect(equity?.invested_eur?.amount.toString()).toBe("1005");
    expect(equity?.returned_eur?.amount.toString()).toBe("0");
  });

  it("converts a foreign currency once, with its fee and withholding", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const usd = { currency: "USD", fx_rate: "1.25", fee: "5" };
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      value_date: "2027-01-05",
      quantity: "4",
      unit_price: "200",
      ...usd,
    });
    b.sell({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      value_date: "2027-07-05",
      quantity: "1",
      unit_price: "250",
      withholding: "10",
      ...usd,
    });
    b.valuation({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      date: END,
      quantity: "3",
      unit_value: "150",
    });
    const gold = of(b, "gold");
    // (800 + 5) / 1.25 in, (250 − 5 − 10) / 1.25 out.
    expect(gold?.invested_eur?.amount.toString()).toBe("644");
    expect(gold?.returned_eur?.amount.toString()).toBe("188");
  });

  it("leaves out a reversed purchase and an income after the date", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const wrong = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2027-01-05",
      quantity: "10",
    });
    b.reversal(wrong.id);
    b.dividend({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2028-06-01",
      gross: "50",
    });
    expect(of(b, "equity")?.gap).toBe("no_flows");
  });

  it("flags the old and the new class when an asset changes class or book, once it happened", () => {
    const b = bought();
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      value_date: "2027-01-05",
      quantity: "10",
    });
    b.assetUpdated({
      asset_id: "ast_world",
      asset_type: "fund",
      book: "core",
      asset_class: "fixed_income",
      name: "ast_world",
      currency: "EUR",
      transferable: true,
      active: true,
    });
    expect(of(b, "equity")?.unsupported_events).toEqual(["asset_updated"]);
    expect(of(b, "fixed_income")?.unsupported_events).toEqual(["asset_updated"]);

    const later = bought();
    worth(later, "ast_world", "10", "110");
    later.recordedAt("2029-01-01");
    later.assetUpdated({
      asset_id: "ast_world",
      asset_type: "fund",
      book: "bucket",
      name: "ast_world",
      currency: "EUR",
      transferable: true,
      active: true,
    });
    expect(of(later, "equity")?.gap).toBeUndefined();

    const toBucket = bought();
    toBucket.assetUpdated({
      asset_id: "ast_world",
      asset_type: "fund",
      book: "bucket",
      name: "ast_world",
      currency: "EUR",
      transferable: true,
      active: true,
    });
    expect(of(toBucket, "equity")?.unsupported_events).toEqual(["asset_updated"]);

    const renamed = bought();
    worth(renamed, "ast_world", "10", "110");
    renamed.assetUpdated({
      asset_id: "ast_world",
      asset_type: "fund",
      book: "core",
      asset_class: "equity",
      name: "A new name",
      currency: "EUR",
      transferable: true,
      active: true,
    });
    expect(of(renamed, "equity")?.gap).toBeUndefined();
  });
});
