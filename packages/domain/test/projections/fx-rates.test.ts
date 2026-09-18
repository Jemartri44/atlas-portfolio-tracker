import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const project = (b: LedgerBuilder) => projectLedger(b.build());

/**
 * Feature 005 §3.1: the cash of the net worth has to be converted with a rate
 * the ledger actually carries, and the view has to say how old that rate is. A
 * currency the ledger never priced has no rate, and that is a datum, not a zero.
 */
describe("fxRates: the last ECB rate the ledger knows per currency", () => {
  it("keeps the last one in chronological order, with the date the event carries", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      quantity: "4",
      currency: "USD",
      fx_rate: "1.0800",
      fx_rate_date: "2027-05-04",
      trade_date: "2027-05-04",
      value_date: "2027-05-06",
    });
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      quantity: "2",
      currency: "USD",
      fx_rate: "1.0900",
      fx_rate_date: "2027-06-04",
      trade_date: "2027-06-04",
      value_date: "2027-06-08",
    });
    const rate = project(b).fxRates.get("USD");
    expect(rate?.rate.toString()).toBe("1.09");
    expect(rate?.date).toBe("2027-06-04");
    expect(rate?.dated).toBe(true);
    // The euro is its own reference: the ECB publishes no rate for it.
    expect(project(b).fxRates.has("EUR")).toBe(false);
  });

  it("falls back to the business date when the event carries no rate date", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({
      account_id: "acc_etf",
      value_date: "2027-07-01",
      amount: "500",
      currency: "USD",
      fx_rate: "1.1",
    });
    const rate = project(b).fxRates.get("USD");
    expect(rate?.date).toBe("2027-07-01");
    expect(rate?.dated).toBe(false);
  });

  it("takes both sides of an fx exchange and leaves a third currency unpriced", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_etf", amount: "5000" });
    // The fee is paid in a currency that is neither sold nor bought: the ledger
    // moves that balance without ever learning its rate.
    b.fx({ account_id: "acc_etf", fee_currency: "CHF" });
    const state = project(b);
    expect(state.fxRates.get("USD")?.rate.toString()).toBe("1.0783");
    expect(state.fxRates.has("CHF")).toBe(false);
    expect(state.cash.get("acc_etf|CHF")?.amount.toString()).toBe("-2");
  });

  it("is cut by asOf like everything else in pass B", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({
      account_id: "acc_etf",
      value_date: "2027-07-01",
      amount: "500",
      currency: "USD",
      fx_rate: "1.1",
    });
    expect(projectLedger(b.build(), { asOf: "2027-06-30" }).fxRates.has("USD")).toBe(false);
    expect(projectLedger(b.build(), { asOf: "2027-07-01" }).fxRates.has("USD")).toBe(true);
  });
});
