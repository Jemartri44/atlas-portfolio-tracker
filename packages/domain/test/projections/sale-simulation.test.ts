// "What if I sell this?", worked out by hand. The tax is the estimated quota
// (criterion #27): each half of the 2027 scale at 9.5 % up to 6,000 € (arts.
// 66.1 and 76 LIRPF), rounded to cents, and the difference with and without the sale.

import { describe, expect, it } from "vitest";
import { Quantity } from "../../src/money/quantity.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { simulateSale } from "../../src/projections/sale-tax.js";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults.js";
import { LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";

/** A fund held in two accounts, 6 and 4 units bought at 100, valued at `price` on 01/12/2027. */
const twoAccounts = (price: string) => {
  const b = new LedgerBuilder();
  b.account("acc_a");
  b.account("acc_b");
  b.asset("ast_world");
  b.buy({ account_id: "acc_a", asset_id: "ast_world", quantity: "6", value_date: "2026-01-12" });
  b.buy({ account_id: "acc_b", asset_id: "ast_world", quantity: "4", value_date: "2026-01-13" });
  b.valuation({
    account_id: "acc_a",
    asset_id: "ast_world",
    date: "2027-12-01",
    quantity: "10",
    unit_value: price,
  });
  return b;
};

const run = (b: LedgerBuilder, quantity?: string, date = DATE) => {
  const events = b.build();
  return simulateSale(projectLedger(events), events, {
    asset_id: "ast_world",
    ...(quantity === undefined ? {} : { quantity: Quantity.parse(quantity) }),
    date,
    settings: DEFAULT_SETTINGS,
  });
};

describe("simulateSale", () => {
  it("sells everything across the accounts, largest first, and prices the gain", () => {
    // 6 × 120 = 720 in acc_a and 4 × 120 = 480 in acc_b; cost 1,000, gain 200.
    // Quota: 200 × 9.5 % = 19.00 a half, 38.00 in all; nothing before the sale.
    const simulation = run(twoAccounts("120"));
    expect(
      simulation.orders.map((order) => [order.account_id, order.amount_eur.centsText()]),
    ).toEqual([
      ["acc_a", "720.00"],
      ["acc_b", "480.00"],
    ]);
    expect(simulation.gain_eur.centsText()).toBe("200.00");
    expect(simulation.lots).toHaveLength(2);
    expect(simulation.tax_eur.centsText()).toBe("38.00");
    expect(simulation.quota_before.quota_eur?.centsText()).toBe("0.00");
    expect(simulation.quota_after.quota_eur?.centsText()).toBe("38.00");
    expect(simulation.price.date).toBe("2027-12-01");
    expect(simulation.repurchase_until).toBeUndefined();
  });

  it("sells part of it from the largest account", () => {
    // 3 units at 120 out of the 6 bought at 100: gain 60, quota 5.70 + 5.70.
    const simulation = run(twoAccounts("120"), "3");
    expect(simulation.orders.map((order) => order.account_id)).toEqual(["acc_a"]);
    expect(simulation.gain_eur.centsText()).toBe("60.00");
    expect(simulation.tax_eur.centsText()).toBe("11.40");
  });

  it("says until when not to buy back a loss, with the default window of a fund", () => {
    // At 80: a loss of 200, no tax. A fund takes two months by default.
    const simulation = run(twoAccounts("80"));
    expect(simulation.gain_eur.centsText()).toBe("-200.00");
    expect(simulation.tax_eur.isZero()).toBe(true);
    expect(simulation.repurchase_until).toBe("2028-02-29");
  });

  it("sells an asset of the bucket from the bucket's account", () => {
    const b = new LedgerBuilder();
    b.account("acc_k", { book: "bucket" });
    b.asset("ast_bet", { book: "bucket", asset_type: "stock", transferable: false });
    b.thesisOpened({ thesis_id: "th1", account_id: "acc_k", asset_id: "ast_bet" });
    b.buy({
      account_id: "acc_k",
      asset_id: "ast_bet",
      quantity: "2",
      value_date: "2026-01-12",
      thesis_id: "th1",
    });
    b.valuation({
      account_id: "acc_k",
      asset_id: "ast_bet",
      date: "2027-12-01",
      quantity: "2",
      unit_value: "150",
    });
    const events = b.build();
    const simulation = simulateSale(projectLedger(events), events, {
      asset_id: "ast_bet",
      date: DATE,
      settings: DEFAULT_SETTINGS,
    });
    // 2 × 150 − 2 × 100 = 100; quota 9.50 + 9.50.
    expect(simulation.orders.map((order) => order.account_id)).toEqual(["acc_k"]);
    expect(simulation.tax_eur.centsText()).toBe("19.00");
  });

  it("prices an order that rounds to 0,00 € without a fee share instead of failing", () => {
    // acc_b keeps 0.001 units after a sale that cost 1 € of commission: at 3 €
    // the order is 0.003 €, 0,00 € in cents, and a share of 1 € over it is undefined.
    const b = new LedgerBuilder();
    b.account("acc_a");
    b.account("acc_b");
    b.asset("ast_world");
    b.buy({ account_id: "acc_a", asset_id: "ast_world", quantity: "6", value_date: "2026-01-12" });
    b.buy({
      account_id: "acc_b",
      asset_id: "ast_world",
      quantity: "1.001",
      value_date: "2026-01-13",
    });
    b.sell({
      account_id: "acc_b",
      asset_id: "ast_world",
      quantity: "1",
      fee: "1",
      value_date: "2026-06-10",
    });
    b.valuation({
      account_id: "acc_a",
      asset_id: "ast_world",
      date: "2027-12-01",
      quantity: "6",
      unit_value: "3",
    });
    const simulation = run(b);
    const tiny = simulation.orders.find((order) => order.account_id === "acc_b");
    expect(tiny?.amount_eur.centsText()).toBe("0.00");
    expect(tiny?.fee?.fee_eur.centsText()).toBe("1.00");
    expect(tiny?.fee_pct).toBeUndefined();
  });

  it("never writes: the ledger it was given is the same afterwards", () => {
    const events = twoAccounts("120").build();
    const before = JSON.stringify(events);
    simulateSale(projectLedger(events), events, {
      asset_id: "ast_world",
      date: DATE,
      settings: DEFAULT_SETTINGS,
    });
    expect(JSON.stringify(events)).toBe(before);
  });

  it.each([
    ["an asset nobody holds", "ast_none", undefined, DATE, "sale_asset_not_held"],
    ["more than is held", "ast_world", "11", DATE, "sale_exceeds_holding"],
    ["nothing", "ast_world", "0", DATE, "sale_exceeds_holding"],
    ["before any price", "ast_world", undefined, "2027-11-30", "sale_missing_price"],
  ])("refuses to sell %s", (_what, asset, quantity, date, code) => {
    const events = twoAccounts("120").build();
    expect(() =>
      simulateSale(projectLedger(events), events, {
        asset_id: asset,
        ...(quantity === undefined ? {} : { quantity: Quantity.parse(quantity) }),
        date,
        settings: DEFAULT_SETTINGS,
      }),
    ).toThrow(expect.objectContaining({ code }));
  });

  it("carries the refusal of the tax engine", () => {
    // The engine computes from 2018 on: a sale in 2017 is refused with its code.
    const b = new LedgerBuilder();
    b.account("acc_a");
    b.asset("ast_world");
    b.buy({ account_id: "acc_a", asset_id: "ast_world", value_date: "2016-01-12" });
    b.valuation({
      account_id: "acc_a",
      asset_id: "ast_world",
      date: "2017-06-01",
      quantity: "10",
      unit_value: "120",
    });
    const events = b.build();
    expect(() =>
      simulateSale(projectLedger(events), events, {
        asset_id: "ast_world",
        date: "2017-06-30",
        settings: DEFAULT_SETTINGS,
      }),
    ).toThrow(expect.objectContaining({ code: "tax_year_unsupported" }));
  });
});
