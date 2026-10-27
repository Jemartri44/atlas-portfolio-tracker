// The gain of a collective investment undertaking in currency, and of a lot
// bought in one currency and sold in another (criterion #4).
//
// DGT V0777-21 and V0207-24: a fund, an ETF or a money-market fund in dollars
// is computed leg by leg, each at the rate of its day, and the exchange
// difference of the dollars invested in it is imputed in the year of the sale.
// The dollars received come in at the rate of the sale. Shares and ETCs keep
// computing first in the currency (V1740-17, V2422-20).

import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { AssetType } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { reportOf } from "../tax/helpers.js";

const rounded = (money: { roundToCents(): { amount: { toString(): string } } }): string =>
  money.roundToCents().amount.toString();

/**
 * Case C1 of the audit of 2026-10-27: 1.100 € → 1.210 $ (1,10); 10 units at
 * 121 $ (that day 1,05); sold in 2027 at 150 $ (1,25); the 1.500 $ back to
 * 1.200 € in 2028. 1.100 € in, 1.200 € out: +100.
 */
const c1Ledger = (
  assetType: AssetType,
  settings: Settings = DEFAULT_SETTINGS,
  buyRate = "1.05",
) => {
  const b = new LedgerBuilder();
  b.settings(settings);
  b.account("acc_us", { platform: "broker", country: "IE" });
  b.asset("sec_us", { asset_type: assetType, currency: "USD", transferable: false });
  b.deposit({ account_id: "acc_us", value_date: "2027-01-04", amount: "1100" });
  b.fx({
    account_id: "acc_us",
    value_date: "2027-01-05",
    sold_amount: "1100",
    sold_currency: "EUR",
    bought_amount: "1210",
    bought_currency: "USD",
    fee: "0",
    fee_currency: "EUR",
    fx_rate_bought: "1.1",
    fx_rate_date: "2027-01-05",
  });
  const trade = (kind: "buy" | "sell", date: string, price: string, rate: string) =>
    b[kind]({
      account_id: "acc_us",
      asset_id: "sec_us",
      value_date: date,
      quantity: "10",
      unit_price: price,
      currency: "USD",
      fx_rate: rate,
    });
  trade("buy", "2027-01-11", "121", buyRate);
  trade("sell", "2027-06-01", "150", "1.25");
  b.fx({
    account_id: "acc_us",
    value_date: "2028-02-01",
    sold_amount: "1500",
    sold_currency: "USD",
    bought_amount: "1200",
    bought_currency: "EUR",
    fee: "0",
    fee_currency: "EUR",
    fx_rate_sold: "1.25",
    fx_rate_bought: "1",
    fx_rate_date: "2028-02-01",
  });
  return b.build();
};

const c1 = (assetType: AssetType, settings: Settings = DEFAULT_SETTINGS, buyRate = "1.05") =>
  projectLedger(c1Ledger(assetType, settings, buyRate));

const figures = (assetType: AssetType) => {
  const state = c1(assetType);
  return {
    security: state.gains.map((gain) => [gain.year, rounded(gain.gain_eur), gain.fx_method]),
    currency: state.currencyGains.map((gain) => [gain.year, gain.kind, rounded(gain.gain_eur)]),
  };
};

describe("a collective investment undertaking in dollars (V0777-21, V0207-24)", () => {
  it.each(["fund", "etf", "money_market"] as const)(
    "%s: each leg at its rate, and the dollars invested imputed in the year of the sale",
    (assetType) => {
      expect(figures(assetType)).toEqual({
        // 1.200 − 1.210/1,05 = 1.200 − 1.152,38.
        security: [[2027, "47.62", "iic"]],
        // 1.152,38 − 1.100 in 2027, and the dollars received at the rate of the sale.
        currency: [
          [2027, "invested", "52.38"],
          [2028, "conversion", "0"],
        ],
      });
    },
  );

  it.each(["stock", "etc", "etp"] as const)(
    "%s: still first in the currency (V1740-17, V2422-20)",
    (assetType) => {
      expect(figures(assetType)).toEqual({
        // (1.500 − 1.210)/1,25.
        security: [[2027, "232", "currency_first"]],
        // 1.200 − (1.100 + 232).
        currency: [[2028, "conversion", "-132"]],
      });
    },
  );

  it("imputes nothing on the dollars invested when they cost what they were worth that day", () => {
    const state = c1("fund", DEFAULT_SETTINGS, "1.1");
    expect(state.currencyGains.map((gain) => gain.kind)).toEqual(["conversion"]);
  });

  it("names its method and the dollars invested with their own criterion in the report", () => {
    const report = reportOf(c1Ledger("etf"), 2027);
    expect(report.capital_gains.lines[0]?.criteria).toContain("4:iic");
    expect(
      report.capital_gains.currency_lines.map((line) => [
        line.kind,
        line.criteria.includes("4:iic"),
      ]),
    ).toEqual([["invested", true]]);
  });

  it("does not follow the method of the settings: it is the doctrine of the undertakings", () => {
    const state = c1("etf", { ...DEFAULT_SETTINGS, fx_gain_method: "each_leg" });
    expect(state.gains.map((gain) => [rounded(gain.gain_eur), gain.fx_method])).toEqual([
      ["47.62", "iic"],
    ]);
  });
});

describe("a lot bought in one currency and sold in another", () => {
  it("imputes the exchange difference of the dollars invested on the sale (case C6)", () => {
    // 1.100 $ for 900 €; 10 shares at 110 $ on a day at 1,10 (1.000 €); sold
    // in euros at 120 € (1.200 €). 900 € in, 1.200 € out: +300.
    const b = new LedgerBuilder();
    b.settings(DEFAULT_SETTINGS);
    b.account("acc_us", { platform: "broker", country: "IE" });
    b.asset("stk_us", { asset_type: "stock", currency: "USD", transferable: false });
    b.deposit({ account_id: "acc_us", value_date: "2027-01-04", amount: "900" });
    b.fx({
      account_id: "acc_us",
      value_date: "2027-01-05",
      sold_amount: "900",
      sold_currency: "EUR",
      bought_amount: "1100",
      bought_currency: "USD",
      fee: "0",
      fee_currency: "EUR",
      fx_rate_bought: "1.2222222222",
      fx_rate_date: "2027-01-05",
    });
    b.buy({
      account_id: "acc_us",
      asset_id: "stk_us",
      value_date: "2027-01-11",
      quantity: "10",
      unit_price: "110",
      currency: "USD",
      fx_rate: "1.1",
    });
    b.sell({
      account_id: "acc_us",
      asset_id: "stk_us",
      value_date: "2027-06-01",
      quantity: "10",
      unit_price: "120",
      currency: "EUR",
      fx_rate: "1",
    });
    const state = projectLedger(b.build());
    expect(state.gains.map((gain) => [rounded(gain.gain_eur), gain.fx_method])).toEqual([
      ["200", "mixed"],
    ]);
    expect(state.currencyGains.map((gain) => [gain.kind, rounded(gain.gain_eur)])).toEqual([
      ["invested", "100"],
    ]);
  });
});
