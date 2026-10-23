// Ledgers that stress the average balance of the fourth quarter: the cases in
// which a day-by-day reading of the cash can go wrong. Shared by the test that
// fixes their figures and by any check that compares two ways of computing them.

import type { LedgerEvent } from "../../src/schema/events.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { HAND_SETTINGS } from "../tax/helpers.js";

const SETTINGS = {
  ...HAND_SETTINGS,
  model_720_threshold_eur: "50000",
  model_720_increase_eur: "20000",
  model_720_alert_threshold_eur: "45000",
};

export interface Scenario {
  name: string;
  events: LedgerEvent[];
  years: number[];
}

const usd = (date: string, amount: string, rate: string) => ({
  value_date: date,
  amount,
  currency: "USD",
  fx_rate: rate,
  fx_rate_date: date,
});

const base = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  b.settings(SETTINGS);
  return b;
};

const reversals = (): Scenario => {
  const b = base();
  b.account("acc_ib", { platform: "ibkr", country: "IE" });
  b.deposit({ account_id: "acc_ib", value_date: "2027-03-01", amount: "20000" });
  const wrong = b.deposit({ account_id: "acc_ib", value_date: "2027-10-01", amount: "4600" });
  b.reversal(wrong.id);
  b.deposit({ account_id: "acc_ib", value_date: "2027-11-16", amount: "4600" });
  const out = b.withdrawal({ account_id: "acc_ib", value_date: "2027-12-01", amount: "9000" });
  b.reversal(out.id);
  b.withdrawal({ account_id: "acc_ib", value_date: "2027-12-15", amount: "1500" });
  const fee = b.fee({ account_id: "acc_ib", value_date: "2027-10-20", amount: "12.34" });
  b.reversal(fee.id);
  b.account("acc_only_voided", { platform: "ibkr", country: "IE" });
  const ghost = b.deposit({
    account_id: "acc_only_voided",
    value_date: "2027-11-01",
    amount: "800",
  });
  b.reversal(ghost.id);
  return { name: "reversals", events: b.build(), years: [2027, 2028] };
};

const lateAccounts = (): Scenario => {
  const b = base();
  b.recordedAt("2028-02-01");
  b.account("acc_late", { platform: "ibkr", country: "IE" });
  b.deposit({ account_id: "acc_late", value_date: "2027-08-10", amount: "30000" });
  b.withdrawal({ account_id: "acc_late", value_date: "2027-11-20", amount: "5000" });
  b.recordedAt("2027-12-20");
  b.account("acc_dec", { platform: "ibkr", country: "IE" });
  b.deposit({ account_id: "acc_dec", value_date: "2027-03-01", amount: "60000" });
  b.recordedAt("2027-11-10");
  b.account("acc_nov", { platform: "ibkr", country: "FR" });
  b.deposit({ account_id: "acc_nov", value_date: "2027-11-12", amount: "7000" });
  return { name: "late accounts", events: b.build(), years: [2027, 2028] };
};

const countryAndActivity = (): Scenario => {
  const b = base();
  b.recordedAt("2027-01-02");
  b.account("acc_moves", { platform: "ibkr", country: "IE" });
  b.deposit({ account_id: "acc_moves", value_date: "2027-01-04", amount: "60000" });
  b.account("acc_toggles", { platform: "ibkr", country: "DE" });
  b.deposit({ account_id: "acc_toggles", value_date: "2027-02-01", amount: "12000" });
  b.account("acc_closed_early", { platform: "ibkr", country: "DE" });
  b.deposit({ account_id: "acc_closed_early", value_date: "2027-02-01", amount: "3000" });
  const update = (id: string, country: string, active: boolean) =>
    b.accountUpdated({
      account_id: id,
      name: id,
      platform: "ibkr",
      book: "core",
      base_currency: "EUR",
      country,
      active,
    });
  b.recordedAt("2027-09-30");
  update("acc_closed_early", "DE", false);
  b.recordedAt("2027-10-20");
  update("acc_toggles", "DE", false);
  b.recordedAt("2027-11-10");
  update("acc_toggles", "DE", true);
  b.recordedAt("2027-11-20");
  update("acc_moves", "ES", true);
  b.recordedAt("2028-02-01");
  update("acc_moves", "IE", true);
  b.recordedAt("2028-02-02");
  b.deposit({ account_id: "acc_moves", value_date: "2028-01-05", amount: "1000" });
  return { name: "country and activity", events: b.build(), years: [2027, 2028, 2029] };
};

const currencies = (): Scenario => {
  const b = base();
  b.account("acc_multi", { platform: "ibkr", country: "IE" });
  b.asset("stock_x", { asset_type: "stock", transferable: false, currency: "USD" });
  b.deposit({ account_id: "acc_multi", value_date: "2027-06-01", amount: "40000" });
  b.deposit({ account_id: "acc_multi", ...usd("2027-10-04", "5000", "1.1") });
  b.fx({
    account_id: "acc_multi",
    value_date: "2027-10-18",
    sold_amount: "10000",
    sold_currency: "EUR",
    bought_amount: "10800",
    bought_currency: "USD",
    fee: "2",
    fee_currency: "USD",
    fx_rate_sold: "1",
    fx_rate_bought: "1.08",
    fx_rate_date: "2027-10-18",
  });
  b.buy({
    account_id: "acc_multi",
    asset_id: "stock_x",
    value_date: "2027-11-03",
    quantity: "10",
    unit_price: "100",
    currency: "USD",
    fx_rate: "1.08",
    fx_rate_date: "2027-11-03",
  });
  b.interest({
    account_id: "acc_multi",
    value_date: "2027-11-30",
    gross: "7",
    currency: "USD",
    fx_rate: "1.09",
    fx_rate_date: "2027-11-30",
  });
  b.sell({
    account_id: "acc_multi",
    asset_id: "stock_x",
    value_date: "2027-12-15",
    quantity: "4",
    unit_price: "120",
    currency: "USD",
    fx_rate: "1.07",
    fx_rate_date: "2027-12-15",
  });
  b.deposit({ account_id: "acc_multi", ...usd("2027-12-31", "100", "1.1") });
  b.deposit({ account_id: "acc_multi", value_date: "2028-01-05", amount: "9999" });
  return { name: "several currencies", events: b.build(), years: [2027, 2028] };
};

const boundaries = (): Scenario => {
  const b = base();
  b.account("acc_edge", { platform: "ibkr", country: "IE" });
  b.account("acc_empty", { platform: "ibkr", country: "IE" });
  b.deposit({ account_id: "acc_edge", value_date: "2027-09-30", amount: "1000" });
  b.deposit({ account_id: "acc_edge", value_date: "2027-10-01", amount: "200" });
  b.withdrawal({ account_id: "acc_edge", value_date: "2027-10-01", amount: "50" });
  b.deposit({ account_id: "acc_edge", value_date: "2027-12-31", amount: "75" });
  b.account("acc_dec31", { platform: "ibkr", country: "IE" });
  b.deposit({ account_id: "acc_dec31", value_date: "2027-12-31", amount: "300" });
  b.account("acc_emptied", { platform: "ibkr", country: "IE" });
  b.deposit({ account_id: "acc_emptied", value_date: "2027-05-03", amount: "500" });
  b.withdrawal({ account_id: "acc_emptied", value_date: "2027-09-15", amount: "500" });
  return { name: "period boundaries", events: b.build(), years: [2027, 2028] };
};

export const handScenarios = (): Scenario[] => [
  reversals(),
  lateAccounts(),
  countryAndActivity(),
  currencies(),
  boundaries(),
];
