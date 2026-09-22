// The verdict of a category of the Modelo 720, edge by edge (feature 010,
// block 3; decision (h) of the prompt).
//
// The rule that governs all of it: **never "not obliged" with incomplete
// data**. Saying there is nothing to file when there is has consequences;
// "this cannot be determined yet", with what is missing as an action, is the
// fail-safe reading of constitution V.
//
// And every threshold is crossed **strictly**: the law says "superior a", so
// 50.000,00 does not oblige and 50.000,01 does.

import { describe, expect, it } from "vitest";
import type { DomainError } from "../../src/errors.js";
import { model720 } from "../../src/informative/m720.js";
import type { InformativeCategory, InformativeReturn } from "../../src/informative/report.js";
import { cashValueAt, toEurAt } from "../../src/informative/valuation.js";
import { Money } from "../../src/money/money.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
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

const text = (money: Money | undefined): string =>
  money === undefined ? "—" : money.amount.toString();

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return (error as DomainError).code;
  }
  return "no error";
};

const categoryOf = (report: InformativeReturn, name: string): InformativeCategory =>
  report.categories.find((entry) => entry.category === name) as InformativeCategory;

interface Options {
  /** Unit value of the ETF at 31/12/2027; absent means no valuation at all. */
  unit?: string;
  /** Date of that valuation; the rule asks for 31 December. */
  date?: string;
  /** A second security, to make the category incomplete without emptying it. */
  second?: string;
  /** Dollars in the account, which need a rate the ledger knows. */
  dollars?: string;
  today?: string;
  year?: number;
}

const report = (options: Options = {}): InformativeReturn => {
  const b = new LedgerBuilder();
  b.settings(SETTINGS);
  b.account("acc_ib", { platform: "ibkr", country: "IE" });
  b.asset("etf_a", { asset_type: "etf", transferable: false });
  b.asset("etf_b", { asset_type: "etf", transferable: false });
  b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "200000" });
  b.buy({
    account_id: "acc_ib",
    asset_id: "etf_a",
    value_date: "2027-01-05",
    quantity: "100",
    unit_price: "100",
  });
  if (options.second !== undefined) {
    b.buy({
      account_id: "acc_ib",
      asset_id: "etf_b",
      value_date: "2027-01-05",
      quantity: "100",
      unit_price: "100",
    });
    b.valuation({
      account_id: "acc_ib",
      asset_id: "etf_b",
      date: "2027-12-31",
      quantity: "100",
      unit_value: options.second,
    });
  }
  if (options.dollars !== undefined) {
    b.deposit({
      account_id: "acc_ib",
      value_date: "2027-06-01",
      amount: options.dollars,
      currency: "USD",
      fx_rate: "1.1",
      fx_rate_date: "2027-06-01",
    });
  }
  if (options.unit !== undefined) {
    b.valuation({
      account_id: "acc_ib",
      asset_id: "etf_a",
      date: options.date ?? "2027-12-31",
      quantity: "100",
      unit_value: options.unit,
    });
  }
  return model720(b.build(), options.year ?? 2027, { today: options.today ?? TODAY });
};

describe("the edges of the threshold", () => {
  it("does not oblige at 50.000,00 and obliges at 50.000,01", () => {
    const below = categoryOf(report({ unit: "500" }), "securities");
    expect(text(below.value_eur)).toBe("50000");
    expect(below.verdict).toBe("not_obliged");
    const above = categoryOf(report({ unit: "500.0001" }), "securities");
    expect(text(above.value_eur)).toBe("50000.01");
    expect(above.verdict).toBe("obliged");
    expect(above.reasons.map((reason) => reason.kind)).toEqual(["threshold"]);
  });

  it("warns at exactly the amount the user set, and not a cent below it", () => {
    const warned = categoryOf(report({ unit: "450" }), "securities");
    expect(text(warned.value_eur)).toBe("45000");
    expect(warned.verdict).toBe("not_obliged");
    expect(warned.reasons.map((reason) => reason.kind)).toEqual(["alert"]);
    const quiet = categoryOf(report({ unit: "449.9999" }), "securities");
    expect(text(quiet.value_eur)).toBe("44999.99");
    expect(quiet.reasons).toEqual([]);
  });
});

describe("what happens when a value is not there", () => {
  it("never says 'not obliged' with a price missing: it says it cannot tell", () => {
    const category = categoryOf(report(), "securities");
    expect(category.items[0]?.value_eur).toBeUndefined();
    expect(category.items[0]?.flags).toEqual(["price_missing"]);
    expect(category.complete).toBe(false);
    expect(category.verdict).toBe("undetermined");
    expect(category.missing).toEqual([
      { account_id: "acc_ib", asset_id: "etf_a", flag: "price_missing" },
    ]);
  });

  it("obliges anyway when what is known is already above the threshold", () => {
    // One security has no valuation; the other alone is above 50.000.
    const category = categoryOf(report({ second: "600" }), "securities");
    expect(text(category.value_eur)).toBe("60000");
    expect(category.complete).toBe(false);
    expect(category.verdict).toBe("obliged");
    // Nothing marked decided it: what decided it is a value that is not in
    // doubt, and the missing one could only add to it.
    expect(category.decided_with).toEqual([]);
  });

  it("marks a valuation that is not of 31 December and refuses to say no with it", () => {
    const category = categoryOf(report({ unit: "300", date: "2027-12-30" }), "securities");
    expect(category.items[0]?.flags).toEqual(["valuation_not_year_end"]);
    expect(category.items[0]?.valuation_date).toBe("2027-12-30");
    expect(text(category.value_eur)).toBe("30000");
    // Well below the threshold, and still not a "no": the value is not the one
    // the rule asks for.
    expect(category.verdict).toBe("undetermined");
  });

  it("does not blame a marked value for a verdict that did not need it", () => {
    // 30.000,00 dated the 30th, and 60.000,00 of a security valued on the 31st:
    // the category obliges on the second alone, so the marked one decided
    // nothing and the output must not say it did (S16).
    const category = categoryOf(
      report({ unit: "300", date: "2027-12-30", second: "600" }),
      "securities",
    );
    expect(text(category.value_eur)).toBe("90000");
    expect(category.complete).toBe(false);
    expect(category.verdict).toBe("obliged");
    expect(category.decided_with).toEqual([]);
  });

  it("marks a rate that is not the last weekday on or before 31 December", () => {
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.asset("etf_a", { asset_type: "etf", currency: "USD", transferable: false });
    b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "200000" });
    b.buy({
      account_id: "acc_ib",
      asset_id: "etf_a",
      value_date: "2027-01-05",
      quantity: "100",
      unit_price: "100",
      currency: "USD",
      fx_rate: "1.1",
      fx_rate_date: "2027-01-05",
    });
    b.valuation({
      account_id: "acc_ib",
      asset_id: "etf_a",
      date: "2027-12-31",
      quantity: "100",
      unit_value: "110",
      currency: "USD",
      fx_rate: "1.1",
      // 31 December 2027 is a Friday, so the rate of the 30th is not the one.
      fx_rate_date: "2027-12-30",
    });
    const category = categoryOf(model720(b.build(), 2027, { today: TODAY }), "securities");
    expect(category.items[0]?.flags).toEqual(["rate_not_year_end"]);
    expect(category.verdict).toBe("undetermined");
  });

  it("marks a balance whose only rate is of another month", () => {
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.deposit({
      account_id: "acc_ib",
      value_date: "2027-06-01",
      amount: "1000",
      currency: "GBP",
      fx_rate: "0.85",
      fx_rate_date: "2027-06-01",
    });
    // The rate the ledger knows is of June, not of 31 December: the balance
    // has a value and it is marked, which is not the same as having none.
    const category = categoryOf(model720(b.build(), 2027, { today: TODAY }), "accounts");
    expect(category.items[0]?.flags).toEqual(["rate_not_year_end"]);
    expect(category.verdict).toBe("undetermined");
  });
});

describe("a year with no verdict to give", () => {
  it("shows the current year as a state on the day of the query", () => {
    const current = report({ unit: "900", year: 2028, today: "2028-06-01" });
    expect(current.period).toBe("current_year");
    expect(current.categories.every((entry) => entry.verdict === "not_applicable")).toBe(true);
    expect(current.categories.every((entry) => entry.reasons.length === 0)).toBe(true);
    expect(current.notes.map((note) => note.code)).toContain("informative_current_year");
  });

  it("says a year before the model existed has nothing to file", () => {
    const early = report({ unit: "900", year: 2011, today: "2028-06-01" });
    expect(early.period).toBe("before_model");
    expect(early.categories.every((entry) => entry.verdict === "not_applicable")).toBe(true);
    expect(early.notes.map((note) => note.code)).toContain("informative_model_did_not_exist");
  });
});

describe("the invariant behind the conversion of a balance", () => {
  it("throws where the fault is instead of valuing a balance short", () => {
    // A balance in a currency implies an operation in that currency, and every
    // operation carries its ECB rate (ADR-0013), so the ledger cannot hold
    // dollars and know no rate for the dollar. The invariant is checked and not
    // assumed: broken by hand, it stops the calculation with the currency in
    // the error instead of producing a plausible figure one conversion short.
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.deposit({
      account_id: "acc_ib",
      value_date: "2027-06-01",
      amount: "1000",
      currency: "USD",
      fx_rate: "1.1",
      fx_rate_date: "2027-06-01",
    });
    const events = b.build();
    const state = projectLedger(events, { asOf: "2027-12-31" });
    const amount = Money.parse("1000", "USD");
    expect(cashValueAt(state, "USD", amount, 2027).value_eur?.amount.toString()).toBe("909.09");
    state.fxRates.delete("USD");
    expect(() => cashValueAt(state, "USD", amount, 2027)).toThrowError(/USD/);
    expect(() => toEurAt(state, "USD", amount)).toThrowError(/USD/);
    expect(codeOf(() => toEurAt(state, "USD", amount))).toBe("fx_rate_unknown");
  });
});
