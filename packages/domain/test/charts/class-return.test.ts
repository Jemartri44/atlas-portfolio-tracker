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

  it("moves no money with a split: only the number of units changes, not what they are worth", () => {
    const b = bought();
    b.corporateAction({
      kind: "split",
      asset_id: "ast_world",
      effects: [{ op: "scale", ratio: "2" }],
    });
    worth(b, "ast_world", "20", "55");
    const equity = of(b, "equity");
    // 1000 in, 20 × 55 = 1100 worth: +10 % in the year.
    expect(equity?.value_eur?.amount.toString()).toBe("1100");
    expect(equity?.gain_pct?.toString()).toBe("10");
    expect(equity?.unsupported).toEqual([]);
    expect(of(b, "gold")?.gap).toBe("no_flows");
  });

  it("gives no figure for a class that received a grant, and says which event, when and on what", () => {
    const b = bought();
    const grant = b.corporateAction({
      kind: "stock_dividend",
      asset_id: "ast_world",
      effective_date: "2027-03-01",
      effects: [
        {
          op: "grant",
          per_account: [{ account_id: "acc_fund", quantity: "1" }],
          unit_cost: "0",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-03-01",
          acquisition_date: "2027-03-01",
        },
      ],
    });
    worth(b, "ast_world", "11", "100");
    expect(of(b, "equity")).toEqual({
      asset_class: "equity",
      gap: "unsupported_events",
      unsupported: [
        {
          reason: "corporate_action_grant",
          event_id: grant.id,
          date: "2027-03-01",
          asset_ids: ["ast_world"],
          kind: "stock_dividend",
        },
      ],
    });
  });

  it("counts the cash in lieu of a reverse split as money out, net of the fee and the withholding", () => {
    const b = bought();
    b.corporateAction({
      kind: "reverse_split",
      asset_id: "ast_world",
      effective_date: "2027-06-06",
      effects: [
        { op: "scale", ratio: "1/4" },
        {
          op: "forced_sale",
          per_account: [{ account_id: "acc_fund", quantity: "0.5", fee: "1", withholding: "5" }],
          unit_price: "120",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-06-06",
        },
      ],
    });
    // 10 units → 2.5 → 2 after selling half a unit.
    worth(b, "ast_world", "2", "480");
    const equity = of(b, "equity");
    // 0.5 × 120 − 1 = 59 of proceeds, 5 withheld: 54 came back; 2 × 480 = 960 is left.
    expect(equity?.returned_eur?.amount.toString()).toBe("54");
    expect(equity?.value_eur?.amount.toString()).toBe("960");
    expect(equity?.gain_eur?.amount.toString()).toBe("14");
    expect(equity?.unsupported).toEqual([]);
  });

  it("converts the cash in lieu of a foreign currency, in two accounts, with each withholding", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.account("acc_etf2", { platform: "ibkr", country: "IE" });
    const usd = { currency: "USD", fx_rate: "1.25" };
    for (const account of ["acc_etf", "acc_etf2"]) {
      b.buy({
        account_id: account,
        asset_id: "ast_gold",
        value_date: "2027-01-05",
        quantity: "4",
        unit_price: "200",
        ...usd,
      });
    }
    b.corporateAction({
      kind: "reverse_split",
      asset_id: "ast_gold",
      effective_date: "2027-06-06",
      effects: [
        { op: "scale", ratio: "1/4" },
        {
          op: "forced_sale",
          per_account: [
            { account_id: "acc_etf", quantity: "0.5", fee: "1", withholding: "10" },
            { account_id: "acc_etf2", quantity: "0.5", fee: "1", withholding: "20" },
          ],
          unit_price: "800",
          currency: "USD",
          fx_rate: "1.25",
          fx_rate_date: "2027-06-04",
        },
      ],
    });
    b.valuation({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      date: END,
      quantity: "1",
      unit_value: "150",
    });
    b.valuation({
      account_id: "acc_etf2",
      asset_id: "ast_gold",
      date: END,
      quantity: "1",
      unit_value: "150",
    });
    const gold = of(b, "gold");
    // Each account: 0.5 × 800 − 1 = 399 USD. Both: 798 / 1.25 = 638.4 EUR, less 30 / 1.25 = 24 withheld.
    expect(gold?.returned_eur?.amount.toString()).toBe("614.4");
    expect(gold?.unsupported).toEqual([]);
  });

  it("values a transfer leg with no NAV at the price of that day in its own currency", () => {
    const b = bought();
    b.asset("ast_usd_bonds", {
      asset_class: "fixed_income",
      asset_type: "fund",
      currency: "USD",
    });
    b.transfer({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      quantity_out: "10",
      nav_out: "100",
      value_date_out: "2027-02-05",
      to_account_id: "acc_fund",
      to_asset_id: "ast_usd_bonds",
      quantity_in: "10",
      value_date_in: "2027-02-06",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_usd_bonds",
      date: "2027-02-06",
      quantity: "10",
      unit_value: "120",
      currency: "USD",
      fx_rate: "1.2",
      fx_rate_date: "2027-02-05",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_usd_bonds",
      date: END,
      quantity: "10",
      unit_value: "120",
      currency: "USD",
      fx_rate: "1.2",
      fx_rate_date: "2028-01-04",
    });
    // 10 × 120 USD at 1.2 USD per euro = 1000 euros.
    expect(of(b, "fixed_income")?.invested_eur?.amount.toString()).toBe("1000");
    expect(of(b, "fixed_income")?.unsupported).toEqual([]);
  });

  it("counts the cash that comes with a merger inside the class as money out", () => {
    const b = bought();
    b.asset("ast_eq2", { asset_class: "equity" });
    b.corporateAction({
      kind: "merger",
      asset_id: "ast_world",
      effective_date: "2027-06-06",
      neutrality_regime: true,
      effects: [
        { op: "convert", to_asset_id: "ast_eq2", ratio: "1" },
        {
          op: "cost_adjustment",
          asset_id: "ast_eq2",
          per_account: [{ account_id: "acc_fund", amount: "30" }],
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-06-06",
        },
      ],
    });
    worth(b, "ast_eq2", "10", "100");
    const equity = of(b, "equity");
    expect(equity?.returned_eur?.amount.toString()).toBe("30");
    expect(equity?.gain_eur?.amount.toString()).toBe("30");
    expect(equity?.unsupported).toEqual([]);
  });

  it("moves no money with a conversion inside the class, and the value follows the new asset", () => {
    const b = bought();
    b.asset("ast_eq2", { asset_class: "equity" });
    b.corporateAction({
      kind: "fund_merger",
      asset_id: "ast_world",
      effective_date: "2027-06-06",
      effects: [{ op: "convert", to_asset_id: "ast_eq2", ratio: "1" }],
    });
    worth(b, "ast_eq2", "10", "110");
    const equity = of(b, "equity");
    expect(equity?.invested_eur?.amount.toString()).toBe("1000");
    expect(equity?.value_eur?.amount.toString()).toBe("1100");
    expect(equity?.gain_pct?.toString()).toBe("10");
  });

  const intoMoneyMarket = (b: LedgerBuilder, navs: { out?: string; in?: string }) => {
    b.asset("ast_mm", { asset_class: "fixed_income", asset_type: "money_market" });
    return b.transfer({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      quantity_out: "10",
      ...(navs.out === undefined ? {} : { nav_out: navs.out }),
      value_date_out: "2027-02-05",
      to_account_id: "acc_fund",
      to_asset_id: "ast_mm",
      quantity_in: "10",
      ...(navs.in === undefined ? {} : { nav_in: navs.in }),
      value_date_in: "2027-02-06",
    });
  };

  it("moves the money of a transfer that changes class by the NAV of each leg, on its own date", () => {
    const b = bought();
    intoMoneyMarket(b, { out: "104", in: "102" });
    worth(b, "ast_mm", "10", "110");
    const equity = of(b, "equity");
    // 1000 in, 10 × 104 = 1040 out on the 5th of February: all of it left the class.
    expect(equity?.returned_eur?.amount.toString()).toBe("1040");
    expect(equity?.value_eur?.amount.toString()).toBe("0");
    expect(equity?.gain_eur?.amount.toString()).toBe("40");
    expect(equity?.unsupported).toEqual([]);
    const bonds = of(b, "fixed_income");
    // 10 × 102 = 1020 in on the 6th, worth 1100 at the end.
    expect(bonds?.invested_eur?.amount.toString()).toBe("1020");
    expect(bonds?.gain_eur?.amount.toString()).toBe("80");
    expect(bonds?.unsupported).toEqual([]);
  });

  it("takes the price of that very day for a leg with no NAV", () => {
    const b = bought();
    intoMoneyMarket(b, {});
    worth(b, "ast_world", "10", "104", "2027-02-05");
    worth(b, "ast_mm", "10", "102", "2027-02-06");
    worth(b, "ast_mm", "10", "110");
    expect(of(b, "equity")?.returned_eur?.amount.toString()).toBe("1040");
    expect(of(b, "fixed_income")?.invested_eur?.amount.toString()).toBe("1020");
  });

  it("gives no figure for a leg with no NAV and no price of that exact day, and says which day", () => {
    const b = bought();
    const transfer = intoMoneyMarket(b, { in: "102" });
    // The nearest price is the day before: never taken.
    worth(b, "ast_world", "10", "104", "2027-02-04");
    worth(b, "ast_mm", "10", "110");
    expect(of(b, "equity")?.unsupported).toEqual([
      {
        reason: "transfer_without_nav",
        event_id: transfer.id,
        date: "2027-02-05",
        asset_ids: ["ast_world"],
      },
    ]);
    expect(of(b, "equity")?.gap).toBe("unsupported_events");
    // The other leg has its NAV: its class keeps the figure.
    expect(of(b, "fixed_income")?.unsupported).toEqual([]);
    expect(of(b, "fixed_income")?.invested_eur?.amount.toString()).toBe("1020");
  });

  it("does not read a transfer leg that falls after the date", () => {
    const b = bought();
    intoMoneyMarket(b, {});
    worth(b, "ast_world", "10", "110");
    expect(classReturns(b.build(), "2027-02-05").classes[1]?.unsupported).toEqual([]);
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

  it("flags both classes of a conversion that changes class, once it happened", () => {
    const b = bought();
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      value_date: "2027-01-05",
      quantity: "10",
    });
    const merger = b.corporateAction({
      kind: "merger",
      asset_id: "ast_world",
      effects: [{ op: "convert", to_asset_id: "ast_bonds", ratio: "1" }],
    });
    const why = {
      reason: "corporate_action_reclassifies",
      event_id: merger.id,
      date: "2027-03-01",
      asset_ids: ["ast_world", "ast_bonds"],
      kind: "merger",
    };
    expect(of(b, "equity")?.unsupported).toEqual([why]);
    expect(of(b, "fixed_income")?.unsupported).toEqual([why]);

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

  it("flags the old and the new class when an asset changes class or book, whenever recorded", () => {
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
    expect(of(b, "equity")?.unsupported.map((item) => item.reason)).toEqual(["asset_reclassified"]);
    expect(of(b, "fixed_income")?.unsupported.map((item) => item.reason)).toEqual([
      "asset_reclassified",
    ]);

    // Recorded after the date asked: the history is still reassigned, so it is flagged all the same.
    const later = bought();
    worth(later, "ast_world", "10", "110");
    later.recordedAt("2029-01-01");
    later.assetUpdated({
      asset_id: "ast_world",
      asset_type: "fund",
      book: "core",
      asset_class: "fixed_income",
      name: "ast_world",
      currency: "EUR",
      transferable: true,
      active: true,
    });
    expect(of(later, "equity")?.unsupported.map((item) => item.reason)).toEqual([
      "asset_reclassified",
    ]);
    expect(of(later, "fixed_income")?.unsupported.map((item) => item.reason)).toEqual([
      "asset_reclassified",
    ]);

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
    expect(of(toBucket, "equity")?.unsupported.map((item) => item.reason)).toEqual([
      "asset_reclassified",
    ]);

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
