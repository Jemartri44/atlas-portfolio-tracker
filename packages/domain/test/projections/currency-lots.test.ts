// Lots of foreign currency and the gain of a security in currency (spec 029).
//
// The figures are those of the rulings: DGT V2422-20 gives no gain on the
// shares and none on the conversion; the research of 2026-10-26 gives nothing
// on the shares and the whole exchange difference on the currency.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Money } from "../../src/money/money.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { taxLedgerOf, taxOpArb } from "../properties/tax-ledgers.js";

const text = (money: { amount: { toString(): string } }): string => money.amount.toString();

/**
 * 1.000 € → 1.200 $ (1,2); 10 shares bought at 120 $ (that day 1,3); sold at
 * 120 $ (1,5); the 1.200 $ back to euros at 1,2.
 */
const v2422 = (settings: Settings = DEFAULT_SETTINGS) => {
  const b = new LedgerBuilder();
  b.settings(settings);
  b.account("acc_us", { platform: "broker", country: "US" });
  b.asset("stk_us", { asset_type: "stock", currency: "USD", transferable: false });
  b.deposit({ account_id: "acc_us", value_date: "2027-01-04", amount: "1000" });
  b.fx({
    account_id: "acc_us",
    value_date: "2027-01-05",
    sold_amount: "1000",
    sold_currency: "EUR",
    bought_amount: "1200",
    bought_currency: "USD",
    fee: "0",
    fee_currency: "EUR",
    fx_rate_bought: "1.2",
    fx_rate_date: "2027-01-05",
  });
  b.buy({
    account_id: "acc_us",
    asset_id: "stk_us",
    value_date: "2027-01-11",
    quantity: "10",
    unit_price: "120",
    currency: "USD",
    fx_rate: "1.3",
  });
  b.sell({
    account_id: "acc_us",
    asset_id: "stk_us",
    value_date: "2027-03-01",
    quantity: "10",
    unit_price: "120",
    currency: "USD",
    fx_rate: "1.5",
  });
  b.fx({
    account_id: "acc_us",
    value_date: "2027-03-02",
    sold_amount: "1200",
    sold_currency: "USD",
    bought_amount: "1000",
    bought_currency: "EUR",
    fee: "0",
    fee_currency: "EUR",
    fx_rate_sold: "1.2",
    fx_rate_bought: "1",
    fx_rate_date: "2027-03-02",
  });
  return b.build();
};

describe("DGT V2422-20", () => {
  it("gives no gain on the shares and none on the conversion, first in currency", () => {
    const state = projectLedger(v2422());
    expect(state.gains.map((gain) => [text(gain.gain_eur), gain.fx_method])).toEqual([
      ["0", "currency_first"],
    ]);
    expect(state.currencyGains.map((gain) => [gain.kind, text(gain.gain_eur)])).toEqual([
      ["conversion", "0"],
    ]);
  });

  it("moves the whole difference to the conversion, leg by leg", () => {
    const state = projectLedger(v2422({ ...DEFAULT_SETTINGS, fx_gain_method: "each_leg" }));
    // 1.200/1,5 − 1.200/1,3 = 800 − 923,08: the loss the old method booked on the shares.
    expect(state.gains.map((gain) => text(gain.gain_eur_rounded))).toEqual(["-123.08"]);
    // And it comes back on the currency: the total is still 1.000 € in, 1.000 € out.
    expect(state.currencyGains.map((gain) => text(gain.gain_eur_rounded))).toEqual(["123.08"]);
  });
});

/** A dollar account funded with `eur` euros at `rate`. */
const funded = (eur: string, usd: string, rate: string, date = "2027-01-05") => {
  const b = new LedgerBuilder();
  b.settings(DEFAULT_SETTINGS);
  b.account("acc_us", { platform: "broker", country: "US" });
  b.asset("stk_us", { asset_type: "stock", currency: "USD", transferable: false });
  b.deposit({ account_id: "acc_us", value_date: "2027-01-04", amount: eur });
  b.fx({
    account_id: "acc_us",
    value_date: date,
    sold_amount: eur,
    sold_currency: "EUR",
    bought_amount: usd,
    bought_currency: "USD",
    fee: "0",
    fee_currency: "EUR",
    fx_rate_bought: rate,
    fx_rate_date: date,
  });
  return b;
};

const toEuros = (b: LedgerBuilder, usd: string, eur: string, rate: string, date: string) =>
  b.fx({
    account_id: "acc_us",
    value_date: date,
    sold_amount: usd,
    sold_currency: "USD",
    bought_amount: eur,
    bought_currency: "EUR",
    fee: "0",
    fee_currency: "EUR",
    fx_rate_sold: rate,
    fx_rate_bought: "1",
    fx_rate_date: date,
  });

const trade = (b: LedgerBuilder, kind: "buy" | "sell", date: string, price: string, rate: string) =>
  b[kind]({
    account_id: "acc_us",
    asset_id: "stk_us",
    value_date: date,
    quantity: "10",
    unit_price: price,
    currency: "USD",
    fx_rate: rate,
  });

const currencyGains = (b: LedgerBuilder) =>
  projectLedger(b.build()).currencyGains.map((gain) => [gain.kind, text(gain.gain_eur_rounded)]);

describe("the exchange difference", () => {
  it("is all on the currency when the shares neither gain nor lose (the research of 2026-10-26)", () => {
    // 1.000 $ bought at 1,10 (909,09 €), sold at 1,20 the day they come back (833,33 €).
    const b = funded("909.0909090909", "1000", "1.1");
    trade(b, "buy", "2027-02-01", "100", "1.15");
    trade(b, "sell", "2027-03-01", "100", "1.2");
    toEuros(b, "1000", "833.3333333333", "1.2", "2027-03-01");
    const state = projectLedger(b.build());
    expect(state.gains.map((gain) => text(gain.gain_eur))).toEqual(["0"]);
    expect(currencyGains(b)).toEqual([["conversion", "-75.76"]]);
  });

  it("adds up to the euros that came in minus those that went out, with a gain and fees", () => {
    // 1.000 € → 1.200 $; 10 at 110 $ + 2 $; sold at 125 $ − 2 $ at 1,25; 1.248 $ back at 1,3.
    const b = funded("1000", "1200", "1.2");
    b.buy({
      account_id: "acc_us",
      asset_id: "stk_us",
      value_date: "2027-02-01",
      quantity: "10",
      unit_price: "110",
      fee: "2",
      currency: "USD",
      fx_rate: "1.15",
    });
    b.sell({
      account_id: "acc_us",
      asset_id: "stk_us",
      value_date: "2027-03-01",
      quantity: "10",
      unit_price: "125",
      fee: "2",
      currency: "USD",
      fx_rate: "1.25",
    });
    toEuros(b, "1346", "1035.3846153846", "1.3", "2027-04-01");
    const state = projectLedger(b.build());
    // (1.248 − 1.102) $ = 146 $ at 1,25.
    expect(state.gains.map((gain) => text(gain.gain_eur))).toEqual(["116.8"]);
    // 1.346 $: 98 $ left of the purchase (81,67 €) and 1.248 $ of the sale (918,33 € + 116,80 €).
    const [conversion] = state.currencyGains;
    expect(text(conversion?.cost_eur as never)).toBe("1116.8");
    expect(text(conversion?.gain_eur_rounded as never)).toBe("-81.42");
    // 116,80 − 81,42 = 35,38 = 1.035,38 € out − 1.000 € in.
    expect(text(state.gains[0]?.gain_eur.add(conversion?.gain_eur as never) as never)).toBe(
      "35.3846153846",
    );
  });

  it("is imputed on a fee paid in dollars, at the rate of its day", () => {
    const b = funded("1000", "1100", "1.1");
    b.fee({
      account_id: "acc_us",
      value_date: "2027-06-30",
      amount: "11",
      currency: "USD",
      fx_rate: "1.2",
      fee_kind: "custody",
    });
    // 11 $ cost 10 € and are worth 9,17 € that day.
    expect(currencyGains(b)).toEqual([["payment", "-0.83"]]);
  });

  it("is imputed when an inflow covers dollars spent without having them", () => {
    const b = new LedgerBuilder();
    b.settings(DEFAULT_SETTINGS);
    b.account("acc_us", { platform: "broker", country: "US" });
    b.asset("stk_us", { asset_type: "stock", currency: "USD", transferable: false });
    // 100 $ spent at 1,25 (80 €) with none in the account; 100 $ come in at 1 (100 €).
    trade(b, "buy", "2027-02-01", "10", "1.25");
    b.deposit({
      account_id: "acc_us",
      value_date: "2027-03-01",
      amount: "100",
      currency: "USD",
      fx_rate: "1",
    });
    const state = projectLedger(b.build());
    expect(state.currencyGains.map((gain) => [gain.kind, text(gain.gain_eur_rounded)])).toEqual([
      ["cover", "-20"],
    ]);
    expect(state.currencyLots.get("USD")?.open).toEqual([]);
  });

  it("carries the cost through a change of one currency for another, and imputes it in euros", () => {
    const b = funded("1000", "1100", "1.1");
    b.fx({
      account_id: "acc_us",
      value_date: "2027-03-01",
      sold_amount: "1100",
      sold_currency: "USD",
      bought_amount: "900",
      bought_currency: "GBP",
      fee: "0",
      fee_currency: "USD",
      fx_rate_sold: "1.08",
      fx_rate_bought: "0.86",
      fx_rate_date: "2027-03-01",
    });
    b.fx({
      account_id: "acc_us",
      value_date: "2027-04-01",
      sold_amount: "900",
      sold_currency: "GBP",
      bought_amount: "1050",
      bought_currency: "EUR",
      fee: "0",
      fee_currency: "EUR",
      fx_rate_sold: "0.857",
      fx_rate_bought: "1",
      fx_rate_date: "2027-04-01",
    });
    // Dollars for pounds imputes nothing (V2466-08); the pounds cost the 1.000 € of the dollars.
    expect(currencyGains(b)).toEqual([["conversion", "50"]]);
  });

  it("adds a fee in euros between two foreign currencies to the cost of what is received", () => {
    const b = funded("1000", "1100", "1.1");
    b.fx({
      account_id: "acc_us",
      value_date: "2027-03-01",
      sold_amount: "1100",
      sold_currency: "USD",
      bought_amount: "900",
      bought_currency: "GBP",
      fee: "5",
      fee_currency: "EUR",
      fx_rate_sold: "1.08",
      fx_rate_bought: "0.86",
      fx_rate_date: "2027-03-01",
    });
    const [pounds] = projectLedger(b.build()).currencyLots.get("GBP")?.open ?? [];
    expect(text(pounds?.cost_eur as never)).toBe("1005");
  });

  it("adds a fee paid in a third currency to the cost, at what that currency cost", () => {
    const b = funded("1000", "1100", "1.1");
    // 10 CHF that cost 10.53 EUR pay the fee of a change of dollars for pounds.
    b.deposit({
      account_id: "acc_us",
      value_date: "2027-02-01",
      amount: "10",
      currency: "CHF",
      fx_rate: "0.95",
    });
    b.fx({
      account_id: "acc_us",
      value_date: "2027-03-01",
      sold_amount: "1100",
      sold_currency: "USD",
      bought_amount: "900",
      bought_currency: "GBP",
      fee: "10",
      fee_currency: "CHF",
      fx_rate_sold: "1.08",
      fx_rate_bought: "0.86",
      fx_rate_date: "2027-03-01",
    });
    const state = projectLedger(b.build());
    const [pounds] = state.currencyLots.get("GBP")?.open ?? [];
    expect(text(pounds?.cost_eur.roundToCents() as never)).toBe("1010.53");
    expect(state.currencyLots.get("CHF")?.open).toEqual([]);
  });

  it("is imputed the same day when the broker converted itself, and the lots are not touched", () => {
    const b = new LedgerBuilder();
    b.settings(DEFAULT_SETTINGS);
    b.account("acc_us", { platform: "broker", country: "US" });
    b.asset("stk_us", { asset_type: "stock", currency: "USD", transferable: false });
    b.buy({
      account_id: "acc_us",
      asset_id: "stk_us",
      value_date: "2027-02-01",
      quantity: "1",
      unit_price: "120",
      currency: "USD",
      fx_rate: "1.2",
      broker_settled_eur: "100.5",
    });
    b.sell({
      account_id: "acc_us",
      asset_id: "stk_us",
      value_date: "2027-03-01",
      quantity: "1",
      unit_price: "150",
      currency: "USD",
      fx_rate: "1.25",
      broker_settled_eur: "118",
    });
    const state = projectLedger(b.build());
    // 30 $ at 1,25 = 24 € on the shares; the 150 $ cost 100,50 + 24 and were credited as 118.
    expect(state.gains.map((gain) => text(gain.gain_eur))).toEqual(["24"]);
    expect(state.currencyGains.map((gain) => [gain.kind, text(gain.gain_eur_rounded)])).toEqual([
      ["auto_conversion", "-6.5"],
    ]);
    expect(state.currencyLots.get("USD")).toBeUndefined();
  });

  it("is imputed on a fee the broker charged in euros: its value against what it charged", () => {
    const b = funded("1000", "1100", "1.1");
    b.fee({
      account_id: "acc_us",
      value_date: "2027-06-30",
      amount: "12",
      currency: "USD",
      fx_rate: "1.2",
      fee_kind: "custody",
      broker_settled_eur: "10.30",
    });
    // 12 USD worth 10 EUR that day, charged as 10.30 EUR; the dollars held are untouched.
    expect(currencyGains(b)).toEqual([["auto_conversion", "-0.3"]]);
    expect(text(projectLedger(b.build()).currencyLots.get("USD")?.open[0]?.amount as never)).toBe(
      "1100",
    );
  });

  it("imputes nothing on a withdrawal: the currency leaves at cost", () => {
    const b = funded("1000", "1100", "1.1");
    b.withdrawal({
      account_id: "acc_us",
      value_date: "2027-03-01",
      amount: "550",
      currency: "USD",
      fx_rate: "1.3",
    });
    const state = projectLedger(b.build());
    expect(state.currencyGains).toEqual([]);
    expect(text(state.currencyLots.get("USD")?.open[0]?.cost_eur as never)).toBe("500");
  });
});

describe("the currency lots", () => {
  it("add up to the balances of their currency in every account, on random ledgers", () => {
    fc.assert(
      fc.property(fc.array(taxOpArb, { minLength: 5, maxLength: 30 }), (ops) => {
        const state = projectLedger(taxLedgerOf(ops));
        const lots = (state.currencyLots.get("USD")?.open ?? []).reduce(
          (total, lot) => total.add(lot.amount),
          Money.zero("USD"),
        );
        const cash = [...state.cash]
          .filter(([key]) => key.endsWith("|USD"))
          .reduce((total, [, balance]) => total.add(balance), Money.zero("USD"));
        expect(text(lots)).toBe(text(cash));
        // Never longs and shorts at once: an inflow covers the shorts first.
        const open = state.currencyLots.get("USD")?.open ?? [];
        expect(new Set(open.map((lot) => lot.amount.isNegative())).size).toBeLessThanOrEqual(1);
      }),
      { numRuns: 200 },
    );
  });
});
