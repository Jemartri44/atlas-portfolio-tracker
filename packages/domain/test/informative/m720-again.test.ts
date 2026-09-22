// When a Modelo 720 has to be filed **again**, worked out by hand (feature 010,
// §6.2 of `specs/010-tax-output/questions.md`).
//
// Four years on one ledger, each sitting on an edge on purpose:
//
//   - 2027 files for the first time, above the threshold;
//   - 2028 rises **exactly** 20.000,00 and does not oblige, because the law
//     says "superior a";
//   - 2029 rises 20.000,01 **over 2027**, which is the last return filed, and
//     obliges — over 2028 it would be a cent, and 2028 was never filed;
//   - 2030 falls and obliges anyway, because a security of the list of 2029 is
//     gone, and its accounts oblige on the **average** while the balance at
//     31 December falls.
//
// The literals come from the document, committed before this module existed.

import { describe, expect, it } from "vitest";
import { model720 } from "../../src/informative/m720.js";
import type { InformativeCategory, InformativeReturn } from "../../src/informative/report.js";
import { rateDayOf } from "../../src/informative/valuation.js";
import type { Money } from "../../src/money/money.js";
import type { Settings } from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { HAND_SETTINGS } from "../tax/helpers.js";

const SETTINGS: Settings = {
  ...HAND_SETTINGS,
  model_720_threshold_eur: "50000",
  model_720_increase_eur: "20000",
  model_720_alert_threshold_eur: "45000",
};

const TODAY = "2031-02-01";

const cents = (money: Money | undefined): string => {
  if (money === undefined) {
    return "—";
  }
  const [whole, fraction = ""] = money.amount.toString().split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
};

const categoryOf = (report: InformativeReturn, name: string): InformativeCategory =>
  report.categories.find((entry) => entry.category === name) as InformativeCategory;

interface Options {
  /** The deposit of 31/12/2029: 40.000,01 leaves 50.000,01, one cent above. */
  lastDeposit?: string;
  /** The withdrawal of 30/09/2030, which decides the average of the quarter. */
  autumnWithdrawal?: string;
}

const ledger = (options: Options = {}): LedgerBuilder => {
  const b = new LedgerBuilder();
  b.settings(SETTINGS);
  b.account("acc_ib", { platform: "ibkr", country: "IE" });
  b.asset("etf_a", { asset_type: "etf", transferable: false });
  b.asset("etc_b", { asset_type: "etc", asset_class: "gold", transferable: false });
  const value = (asset: string, date: string, unit: string, quantity: string) =>
    b.valuation({ account_id: "acc_ib", asset_id: asset, date, quantity, unit_value: unit });

  b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "70000" });
  b.buy({
    account_id: "acc_ib",
    asset_id: "etf_a",
    value_date: "2027-01-05",
    quantity: "600",
    unit_price: "50",
  });
  b.buy({
    account_id: "acc_ib",
    asset_id: "etc_b",
    value_date: "2027-01-05",
    quantity: "300",
    unit_price: "100",
  });
  value("etf_a", "2027-12-31", "50", "600");
  value("etc_b", "2027-12-31", "100", "300");
  b.filed({
    model: "720",
    tax_year: 2027,
    filed_at: "2028-03-15",
    declared: {
      securities: { value_eur: "60000.00" },
      items: [
        { category: "securities", account_id: "acc_ib", asset_id: "etf_a", value_eur: "30000.00" },
        { category: "securities", account_id: "acc_ib", asset_id: "etc_b", value_eur: "30000.00" },
      ],
    },
  });
  b.deposit({ account_id: "acc_ib", value_date: "2028-06-01", amount: "2000" });
  b.buy({
    account_id: "acc_ib",
    asset_id: "etc_b",
    value_date: "2028-06-01",
    quantity: "20",
    unit_price: "100",
  });
  // 31 December 2028 is a Sunday: the valuation is still dated the 31st and
  // the rate is the one of Friday the 29th. Neither of the two is marked.
  value("etf_a", "2028-12-31", "80", "600");
  value("etc_b", "2028-12-31", "100", "320");
  b.deposit({
    account_id: "acc_ib",
    value_date: "2029-12-31",
    amount: options.lastDeposit ?? "40000.01",
  });
  value("etf_a", "2029-12-31", "80", "600");
  value("etc_b", "2029-12-31", "100.00003125", "320");
  b.filed({
    model: "720",
    tax_year: 2029,
    filed_at: "2030-03-20",
    declared: {
      securities: { value_eur: "80000.01" },
      accounts: { balance_eur: "50000.01", q4_average_eur: "10434.78" },
      items: [
        { category: "securities", account_id: "acc_ib", asset_id: "etf_a", value_eur: "48000.00" },
        { category: "securities", account_id: "acc_ib", asset_id: "etc_b", value_eur: "32000.01" },
        {
          category: "accounts",
          account_id: "acc_ib",
          balance_eur: "50000.01",
          q4_average_eur: "10434.78",
        },
      ],
    },
  });
  b.sell({
    account_id: "acc_ib",
    asset_id: "etc_b",
    value_date: "2030-05-10",
    quantity: "320",
    unit_price: "100",
  });
  b.withdrawal({ account_id: "acc_ib", value_date: "2030-05-10", amount: "32000" });
  b.withdrawal({
    account_id: "acc_ib",
    value_date: "2030-09-30",
    amount: options.autumnWithdrawal ?? "19565.22",
  });
  value("etf_a", "2030-12-31", "90", "600");
  return b;
};

const reportOf = (year: number, options: Options = {}): InformativeReturn =>
  model720(ledger(options).build(), year, { today: TODAY });

describe("filing the Modelo 720 again", () => {
  it("2027: the first time, above the threshold", () => {
    const report = reportOf(2027);
    const securities = categoryOf(report, "securities");
    expect(cents(securities.value_eur)).toBe("60000.00");
    expect(securities.verdict).toBe("obliged");
    expect(securities.reasons.map((reason) => reason.kind)).toEqual(["threshold"]);
    const accounts = categoryOf(report, "accounts");
    expect(cents(accounts.value_eur)).toBe("10000.00");
    expect(cents(accounts.q4_average_eur)).toBe("10000.00");
    expect(accounts.verdict).toBe("not_obliged");
  });

  it("2028: a rise of exactly 20.000,00 does not oblige, and nothing is extinct", () => {
    const report = reportOf(2028);
    const securities = categoryOf(report, "securities");
    expect(cents(securities.value_eur)).toBe("80000.00");
    expect(securities.verdict).toBe("not_obliged");
    expect(securities.reasons).toEqual([]);
    expect(report.previous?.tax_year).toBe(2027);
    // The valuation of a Sunday keeps its own date, and the rate is the Friday.
    expect(rateDayOf(2028)).toBe("2028-12-29");
    expect(securities.items.every((item) => item.flags.length === 0)).toBe(true);
    // The accounts were never declared and are below the threshold.
    const accounts = categoryOf(report, "accounts");
    expect(cents(accounts.value_eur)).toBe("10000.00");
    expect(accounts.verdict).toBe("not_obliged");
  });

  it("2029: a cent more, measured against 2027 and not against the year before", () => {
    const report = reportOf(2029);
    const securities = categoryOf(report, "securities");
    expect(cents(securities.value_eur)).toBe("80000.01");
    expect(report.previous?.tax_year).toBe(2027);
    expect(securities.verdict).toBe("obliged");
    const rise = securities.reasons.find((reason) => reason.kind === "increase");
    expect(cents(rise?.before_eur)).toBe("60000.00");
    expect(cents(rise?.after_eur)).toBe("80000.01");
    // Against 2028 it would be one cent, and 2028 was never filed: that is the
    // mutant "compare with the year before" and this is what kills it.
    expect(rise?.against_year).toBe(2027);
    // The accounts go above the threshold for the first time: the return of
    // 2027 did not declare them.
    const accounts = categoryOf(report, "accounts");
    expect(cents(accounts.value_eur)).toBe("50000.01");
    expect(cents(accounts.q4_average_eur)).toBe("10434.78");
    expect(accounts.verdict).toBe("obliged");
    expect(accounts.reasons.map((reason) => reason.kind)).toEqual(["first_time_category"]);
  });

  it("2029: one cent less on the balance and it does not oblige", () => {
    const accounts = categoryOf(reportOf(2029, { lastDeposit: "40000" }), "accounts");
    expect(cents(accounts.value_eur)).toBe("50000.00");
    expect(accounts.verdict).toBe("not_obliged");
  });

  it("2030: it falls and obliges anyway, because a security of the list is gone", () => {
    const report = reportOf(2030);
    const securities = categoryOf(report, "securities");
    expect(cents(securities.value_eur)).toBe("54000.00");
    expect(report.previous?.tax_year).toBe(2029);
    expect(securities.verdict).toBe("obliged");
    expect(securities.reasons).toEqual([
      { kind: "extinction", account_id: "acc_ib", asset_id: "etc_b", against_year: 2029 },
    ]);
  });

  it("2030: the accounts oblige on the average while the balance falls", () => {
    const accounts = categoryOf(reportOf(2030), "accounts");
    expect(cents(accounts.value_eur)).toBe("30434.79");
    expect(cents(accounts.q4_average_eur)).toBe("30434.79");
    expect(accounts.verdict).toBe("obliged");
    // The balance at 31 December falls by 19.565,22; the average rises by
    // 20.000,01. Looking at the balance alone would say "not obliged".
    const rise = accounts.reasons.find((reason) => reason.kind === "increase_q4_average");
    expect(cents(rise?.before_eur)).toBe("10434.78");
    expect(cents(rise?.after_eur)).toBe("30434.79");
    expect(accounts.reasons.map((reason) => reason.kind)).toEqual(["increase_q4_average"]);
  });

  it("2030: one cent more withdrawn in September and the average rises 20.000,00, which does not oblige", () => {
    const accounts = categoryOf(reportOf(2030, { autumnWithdrawal: "19565.23" }), "accounts");
    expect(cents(accounts.q4_average_eur)).toBe("30434.78");
    expect(accounts.verdict).toBe("not_obliged");
  });
});

describe("an account of the last return that is closed", () => {
  it("obliges by extinction, without the return naming an asset", () => {
    // The second trigger applies to cash too: the asset of that category is
    // **the account**, and an account is extinguished when it is closed, not
    // when it empties (S7, question Q7).
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "60000" });
    b.filed({
      model: "720",
      tax_year: 2027,
      filed_at: "2028-03-15",
      declared: {
        accounts: { balance_eur: "60000.00", q4_average_eur: "60000.00" },
        items: [
          {
            category: "accounts",
            account_id: "acc_ib",
            balance_eur: "60000.00",
            q4_average_eur: "60000.00",
          },
        ],
      },
    });
    b.recordedAt("2028-07-01");
    b.accountUpdated({
      account_id: "acc_ib",
      name: "acc_ib",
      platform: "ibkr",
      book: "core",
      base_currency: "EUR",
      country: "IE",
      active: false,
    });
    const accounts = categoryOf(model720(b.build(), 2028, { today: "2029-02-01" }), "accounts");
    expect(accounts.verdict).toBe("obliged");
    expect(accounts.reasons).toEqual([
      { kind: "extinction", account_id: "acc_ib", against_year: 2027 },
    ]);
  });
});
