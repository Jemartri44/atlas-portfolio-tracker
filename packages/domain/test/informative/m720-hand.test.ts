// The Modelo 720 at 31/12/2027, **worked out by hand** (feature 010, §6.1 of
// `specs/010-tax-output/questions.md`).
//
// The literals below are copied from that document, which was committed on
// 2026-09-19, before a line of this module existed. Any discrepancy is
// investigated and written down there, and the literal is not touched until it
// is clear who was right.
//
// The configuration is written out in full — the three thresholds of the model
// among them — because a hand calculation that borrows a default from the code
// is a mirror of the engine and not a check on it.

import { describe, expect, it } from "vitest";
import { model720 } from "../../src/informative/m720.js";
import type { InformativeCategory, InformativeReturn } from "../../src/informative/report.js";
import type { Money } from "../../src/money/money.js";
import type { Settings } from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { HAND_SETTINGS } from "../tax/helpers.js";

/** Nothing rides a default: the three figures of the model are written down. */
const SETTINGS: Settings = {
  ...HAND_SETTINGS,
  model_720_threshold_eur: "50000",
  model_720_increase_eur: "20000",
  model_720_alert_threshold_eur: "45000",
};

const TODAY = "2028-03-01";

const cents = (money: Money | undefined): string => {
  if (money === undefined) {
    return "—";
  }
  const [whole, fraction = ""] = money.amount.toString().split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
};

const categoryOf = (report: InformativeReturn, name: string): InformativeCategory =>
  report.categories.find((entry) => entry.category === name) as InformativeCategory;

const itemOf = (category: InformativeCategory, account: string, asset?: string) =>
  category.items.find(
    (item) => item.account_id === account && item.asset_id === asset,
  ) as InformativeCategory["items"][number];

/** The ledger of §6.1: two Irish accounts, one Spanish, and 31/12/2027 a Friday. */
const ledger = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  b.settings(SETTINGS);
  b.account("acc_es");
  b.account("acc_ib", { platform: "ibkr", country: "IE" });
  b.account("acc_ib2", { platform: "ibkr", country: "IE", book: "bucket" });
  b.asset("fund_es");
  b.asset("etf_us", { asset_type: "etf", currency: "USD", transferable: false });
  b.asset("etc_au", { asset_type: "etc", asset_class: "gold", transferable: false });
  b.asset("etp_bt", { asset_type: "etp", asset_class: "crypto", transferable: false });
  b.asset("stock_x", { asset_type: "stock", book: "bucket", transferable: false });
  b.thesisOpened({
    thesis_id: "th_x",
    account_id: "acc_ib2",
    asset_id: "stock_x",
    planned_size_eur: "6000",
  });

  b.deposit({ account_id: "acc_es", value_date: "2027-01-04", amount: "100000" });
  b.buy({
    account_id: "acc_es",
    asset_id: "fund_es",
    value_date: "2027-01-05",
    quantity: "600",
    unit_price: "100",
  });
  b.deposit({ account_id: "acc_ib", value_date: "2027-03-01", amount: "52000" });
  b.buy({
    account_id: "acc_ib",
    asset_id: "etc_au",
    value_date: "2027-03-02",
    quantity: "1000",
    unit_price: "20",
  });
  b.buy({
    account_id: "acc_ib",
    asset_id: "etp_bt",
    value_date: "2027-03-03",
    quantity: "2",
    unit_price: "3500",
  });
  b.fx({
    account_id: "acc_ib",
    value_date: "2027-03-04",
    sold_amount: "15000",
    sold_currency: "EUR",
    fx_rate_sold: "1",
    bought_amount: "18000",
    bought_currency: "USD",
    fx_rate_bought: "1.2",
    fx_rate_date: "2027-03-04",
    fee: "0",
    fee_currency: "USD",
  });
  b.buy({
    account_id: "acc_ib",
    asset_id: "etf_us",
    value_date: "2027-03-05",
    quantity: "100",
    unit_price: "150",
    currency: "USD",
    fx_rate: "1.2",
    fx_rate_date: "2027-03-05",
  });
  b.deposit({ account_id: "acc_ib2", value_date: "2027-06-01", amount: "6500" });
  b.buy({
    account_id: "acc_ib2",
    asset_id: "stock_x",
    value_date: "2027-06-02",
    quantity: "100",
    unit_price: "60",
    thesis_id: "th_x",
  });
  b.deposit({ account_id: "acc_ib", value_date: "2027-11-16", amount: "4000" });
  b.deposit({
    account_id: "acc_ib",
    value_date: "2027-12-01",
    amount: "2500",
    currency: "USD",
    fx_rate: "1.08",
    fx_rate_date: "2027-12-01",
  });
  b.withdrawal({ account_id: "acc_ib2", value_date: "2027-12-20", amount: "2000" });
  // Dated the 30th: the value exists and is not the one the rule asks for.
  b.valuation({
    account_id: "acc_ib2",
    asset_id: "stock_x",
    date: "2027-12-30",
    quantity: "100",
    unit_value: "60",
  });
  b.withdrawal({ account_id: "acc_ib", value_date: "2027-12-31", amount: "2000" });
  b.valuation({
    account_id: "acc_ib",
    asset_id: "etf_us",
    date: "2027-12-31",
    quantity: "100",
    unit_value: "165.01",
    currency: "USD",
    fx_rate: "1.10",
    fx_rate_date: "2027-12-31",
  });
  b.valuation({
    account_id: "acc_ib",
    asset_id: "etc_au",
    date: "2027-12-31",
    quantity: "1000",
    unit_value: "22",
  });
  b.valuation({
    account_id: "acc_ib",
    asset_id: "etp_bt",
    date: "2027-12-31",
    quantity: "2",
    unit_value: "4000.0025",
  });
  b.valuation({
    account_id: "acc_es",
    asset_id: "fund_es",
    date: "2027-12-31",
    quantity: "600",
    unit_value: "110",
  });
  return b;
};

describe("the Modelo 720 of 2027, worked out by hand", () => {
  const report = model720(ledger().build(), 2027, { today: TODAY });
  const accounts = categoryOf(report, "accounts");
  const securities = categoryOf(report, "securities");

  it("leaves the Spanish account out, which is what decides the verdict", () => {
    expect(report.excluded).toEqual([{ account_id: "acc_es", reason: "domestic_account" }]);
    // With it in, the accounts would hold 55.500,00 and would oblige.
    expect(accounts.items.map((item) => item.account_id)).toEqual(["acc_ib", "acc_ib2"]);
    expect(securities.items.map((item) => item.asset_id)).not.toContain("fund_es");
    expect(report.notes.map((n) => n.code)).toContain("informative_domestic_accounts_left_out");
  });

  it("gives each account its balance at 31/12 and its average of the fourth quarter", () => {
    // acc_ib: 12.000,00 € and 5.500,00 $ at 1,10 = 17.000,00. On average,
    // 46 days at 10.000, 45 at 14.000 and one at 12.000, plus 61 days at
    // 3.000 $ and 31 at 5.500 $.
    expect(cents(itemOf(accounts, "acc_ib").value_eur)).toBe("17000.00");
    expect(cents(itemOf(accounts, "acc_ib").q4_average_eur)).toBe("15471.34");
    // acc_ib2 went to −1.500,00 on 20 December: the negative nets, it does not
    // disappear.
    expect(cents(itemOf(accounts, "acc_ib2").value_eur)).toBe("-1500.00");
    expect(cents(itemOf(accounts, "acc_ib2").q4_average_eur)).toBe("239.13");
    expect(cents(accounts.value_eur)).toBe("15500.00");
    expect(cents(accounts.q4_average_eur)).toBe("15710.47");
  });

  it("does not oblige on the accounts, and does not warn either", () => {
    expect(accounts.complete).toBe(true);
    expect(accounts.verdict).toBe("not_obliged");
    expect(accounts.reasons).toEqual([]);
  });

  it("values each security once and adds up the rounded values, not the exact ones", () => {
    expect(cents(itemOf(securities, "acc_ib", "etf_us").value_eur)).toBe("15000.91");
    expect(cents(itemOf(securities, "acc_ib", "etc_au").value_eur)).toBe("22000.00");
    // 8.000,005 rounds half-up to 8.000,01; half-even would give 8.000,00.
    expect(cents(itemOf(securities, "acc_ib", "etp_bt").value_eur)).toBe("8000.01");
    expect(cents(itemOf(securities, "acc_ib2", "stock_x").value_eur)).toBe("6000.00");
    // The sum of the rounded assets, which is the reading of criterion #6: the
    // exact sum rounded once would give 51.000,91.
    expect(cents(securities.value_eur)).toBe("51000.92");
  });

  it("marks the valuation of the 30th and says the verdict was decided with it", () => {
    const flagged = itemOf(securities, "acc_ib2", "stock_x");
    expect(flagged.flags).toEqual(["valuation_not_year_end"]);
    expect(flagged.valuation_date).toBe("2027-12-30");
    expect(securities.complete).toBe(false);
    expect(securities.verdict).toBe("obliged");
    expect(securities.reasons.map((reason) => reason.kind)).toEqual(["threshold"]);
    // Without those 6.000,00 the category would hold 45.000,92 and would not
    // oblige: the marked value is what decided it, and the output says so.
    expect(securities.decided_with).toEqual([
      { account_id: "acc_ib2", asset_id: "stock_x", flag: "valuation_not_year_end" },
    ]);
  });

  it("takes the rate of 31 December, which in 2027 is a Friday", () => {
    const item = itemOf(securities, "acc_ib", "etf_us");
    expect(item.fx_rate).toBe("1.1");
    expect(item.fx_rate_date).toBe("2027-12-31");
    expect(item.flags).toEqual([]);
    expect(itemOf(accounts, "acc_ib").fx_rate_date).toBe("2027-12-31");
  });

  it("says it is a fiscal total and which criteria it depends on", () => {
    expect(report.scope).toBe("fiscal_total");
    expect(report.period).toBe("closed_year");
    expect(report.criteria).toContain("11");
    expect(cents(report.threshold_eur)).toBe("50000.00");
    expect(cents(report.alert_eur)).toBe("45000.00");
  });
});
