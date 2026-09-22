// The average balance of the fourth quarter, and the two things that change
// its divisor (feature 010, block 3; ficha F3, question Q4).
//
// The direction that has consequences is the one that lowers the average: an
// account that opened in November and is divided by 92 days looks smaller than
// it is, and a return that should have been filed is not. The DGT says the
// period runs from the day the position opens (V0630-25), and an account closed
// inside the quarter counts with a balance of zero from its closing — its days
// are part of the period and its balance is not there to inflate anything.

import { describe, expect, it } from "vitest";
import { accountsAt } from "../../src/informative/holdings.js";
import { model720 } from "../../src/informative/m720.js";
import type { InformativeCategory, InformativeReturn } from "../../src/informative/report.js";
import type { Settings } from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { HAND_SETTINGS } from "../tax/helpers.js";

const SETTINGS: Settings = {
  ...HAND_SETTINGS,
  model_720_threshold_eur: "50000",
  model_720_increase_eur: "20000",
  model_720_alert_threshold_eur: "45000",
};

const TODAY = "2028-06-01";

const accountsOf = (report: InformativeReturn): InformativeCategory =>
  report.categories.find((entry) => entry.category === "accounts") as InformativeCategory;

const itemOf = (report: InformativeReturn, id: string) =>
  accountsOf(report).items.find((item) => item.account_id === id);

describe("the period the average covers", () => {
  it("starts at the first movement when the account appears inside the quarter", () => {
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.account("acc_new", { platform: "ibkr", country: "IE" });
    b.deposit({ account_id: "acc_new", value_date: "2027-11-16", amount: "4600" });
    const report = model720(b.build(), 2027, { today: TODAY });
    const item = itemOf(report, "acc_new");
    // The divisor is 46 days, from 16 November to 31 December, and not 92: the
    // balance is 4.600,00 on every one of them, so the average **is** 4.600,00.
    // Dividing by the whole quarter would give 2.300,00, which is the mistake
    // that makes a return look smaller than it is.
    expect(item?.balances?.[0]?.days).toBe(46);
    expect(item?.q4_average_eur?.amount.toString()).toBe("4600");
    expect(item?.value_eur?.amount.toString()).toBe("4600");
  });

  it("counts an account closed inside the quarter with zero from its closing", () => {
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "9200" });
    b.recordedAt("2027-11-01");
    b.accountUpdated({
      account_id: "acc_ib",
      name: "acc_ib",
      platform: "ibkr",
      book: "core",
      base_currency: "EUR",
      country: "IE",
      active: false,
    });
    const report = model720(b.build(), 2027, { today: TODAY });
    const item = itemOf(report, "acc_ib");
    // 31 days at 9.200 (1 to 31 October) and 61 at zero: 285.200 / 92 = 3.100.
    expect(item?.balances?.[0]?.days).toBe(92);
    expect(item?.q4_average_eur?.amount.toString()).toBe("3100");
    // The balance at 31 December is what the ledger holds: closing an account
    // in the catalogue does not move a euro.
    expect(item?.value_eur?.amount.toString()).toBe("9200");
  });

  it("leaves an account that never held anything out of the return", () => {
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.account("acc_empty", { platform: "ibkr", country: "IE" });
    const report = model720(b.build(), 2027, { today: TODAY });
    expect(accountsOf(report).items).toEqual([]);
    expect(accountsOf(report).verdict).toBe("not_obliged");
  });
});

describe("the country of an account on 31 December", () => {
  it("is the one of its last change recorded by then, not the one of today", () => {
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.recordedAt("2027-01-02");
    b.account("acc_moves", { platform: "ibkr", country: "IE" });
    b.deposit({ account_id: "acc_moves", value_date: "2027-01-04", amount: "60000" });
    // The broker moves its subsidiary to Spain, recorded in 2028: the account
    // was foreign for the whole of 2027 and the return of 2027 has to see it.
    b.recordedAt("2028-02-01");
    b.accountUpdated({
      account_id: "acc_moves",
      name: "acc_moves",
      platform: "ibkr",
      book: "core",
      base_currency: "EUR",
      country: "ES",
      active: true,
    });
    const events = b.build();
    expect(accountsAt(events, "2027-12-31").accounts.get("acc_moves")?.country).toBe("IE");
    expect(accountsAt(events, "2028-06-01").accounts.get("acc_moves")?.country).toBe("ES");
    const report = model720(events, 2027, { today: TODAY });
    expect(itemOf(report, "acc_moves")?.value_eur?.amount.toString()).toBe("60000");
    expect(accountsOf(report).verdict).toBe("obliged");
    expect(report.notes.map((note) => note.code)).toContain("informative_account_changed_country");
    // And in 2028 it is Spanish, so it is left out.
    const later = model720(events, 2028, { today: "2029-06-01" });
    expect(accountsOf(later).items).toEqual([]);
    expect(later.excluded).toEqual([{ account_id: "acc_moves", reason: "domestic_account" }]);
  });
});

describe("what moves the cash of the quarter", () => {
  it("follows a corporate action and a currency that appears in the middle of it", () => {
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.asset("stock_x", { asset_type: "stock", transferable: false });
    b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "10000" });
    b.buy({
      account_id: "acc_ib",
      asset_id: "stock_x",
      value_date: "2027-01-05",
      quantity: "100",
      unit_price: "50",
    });
    // A reverse split with cash in lieu: the cash of a foreign account moves
    // inside the quarter through the **effects** of a corporate action, which
    // names no `account_id` of its own.
    b.corporateAction({
      kind: "reverse_split",
      asset_id: "stock_x",
      effective_date: "2027-11-16",
      effects: [
        { op: "scale", ratio: "1/4" },
        {
          op: "forced_sale",
          per_account: [{ account_id: "acc_ib", quantity: "0.5" }],
          unit_price: "200",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-11-16",
        },
      ],
    });
    // And a currency that only appears in December: at the start of the
    // quarter the account holds none of it.
    b.deposit({
      account_id: "acc_ib",
      value_date: "2027-12-01",
      amount: "3100",
      currency: "USD",
      fx_rate: "1",
      fx_rate_date: "2027-12-01",
    });
    const item = itemOf(model720(b.build(), 2027, { today: TODAY }), "acc_ib");
    const dollars = item?.balances?.find((part) => part.currency === "USD");
    // 31 days of 3.100 $ out of 92: 96.100 / 92 = 1.044,5652173913.
    expect(dollars?.q4_average.amount.toString()).toBe("1044.5652173913");
    const euros = item?.balances?.find((part) => part.currency === "EUR");
    // 46 days at 5.000 and 46 at 5.100, which is the 100,00 of the fraction.
    expect(euros?.amount.amount.toString()).toBe("5100");
    expect(euros?.q4_average.amount.toString()).toBe("5050");
  });

  it("rounds the value of an account once, after adding up its currencies", () => {
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.deposit({ account_id: "acc_ib", value_date: "2027-06-01", amount: "10" });
    b.deposit({
      account_id: "acc_ib",
      value_date: "2027-06-01",
      amount: "1000",
      currency: "USD",
      fx_rate: "1.1",
      fx_rate_date: "2027-12-31",
    });
    const item = itemOf(model720(b.build(), 2027, { today: TODAY }), "acc_ib");
    // 10,00 € plus 1.000,00 $ at 1,10 = 909,0909090909… : the asset of this
    // category is the **account**, so its currencies are converted and added
    // before the single rounding of criterion #6.
    expect(item?.value_eur?.amount.toString()).toBe("919.09");
    expect(item?.q4_average_eur?.amount.toString()).toBe("919.09");
  });

  it("leaves out an account that held cash and was emptied before the quarter", () => {
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "1000" });
    b.withdrawal({ account_id: "acc_ib", value_date: "2027-09-30", amount: "1000" });
    const report = model720(b.build(), 2027, { today: TODAY });
    // Zero at 31 December and zero on average: the account is not an asset of
    // this return, and it is not listed with a zero either.
    expect(accountsOf(report).items).toEqual([]);
  });
});
