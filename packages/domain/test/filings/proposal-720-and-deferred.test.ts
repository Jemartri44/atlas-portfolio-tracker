import { describe, expect, it } from "vitest";
import { filingProposal } from "../../src/filings/proposal.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { buy, HAND_SETTINGS, sell, taxBuilder } from "../tax/helpers.js";

describe("filingProposal (filings/proposal.ts)", () => {
  it("proposes the value of a security abroad, and writes it as the value of that asset", () => {
    const b = new LedgerBuilder();
    b.settings({
      ...HAND_SETTINGS,
      model_720_threshold_eur: "50000",
      model_720_increase_eur: "20000",
      model_720_alert_threshold_eur: "45000",
    });
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.asset("etf_ie", { asset_type: "etf", transferable: false });
    b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "60000" });
    b.buy({
      account_id: "acc_ib",
      asset_id: "etf_ie",
      value_date: "2027-10-01",
      quantity: "600",
      unit_price: "100",
    });
    b.valuation({
      account_id: "acc_ib",
      asset_id: "etf_ie",
      date: "2027-12-31",
      quantity: "600",
      unit_value: "100",
    });
    const proposal = filingProposal(b.build(), "720", 2027, { today: "2028-03-01" });
    const figure = proposal.figures.find((entry) => entry.key === "item.acc_ib.etf_ie");
    expect(figure).toMatchObject({ kind: "item_value", asset_id: "etf_ie" });
    const items = (
      proposal.draft(new Map(), { filed_at: "2028-03-01", receipt_reference: "x" }).declared as {
        items: { asset_id?: string; value_eur?: string }[];
      }
    ).items;
    expect(items.find((item) => item.asset_id === "etf_ie")?.value_eur).toBeDefined();
  });
});

describe("filingProposal of a renta (filings/proposal.ts)", () => {
  it("proposes as deferred the loss a repurchase inside the window defers", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-12-20", "10", "60");
    buy(b, "stock_s", "2028-01-15", "10", "60");
    const proposal = filingProposal(b.build(), "renta", 2027, { today: "2028-03-01" });
    const deferred = proposal.figures.find((figure) => figure.key === "deferred");
    // The whole loss of the sale (10 × (60 − 100)), deferred by the repurchase
    // of the 10, with its sign: a sum turned into a difference gives +400.
    expect(deferred?.amount_eur.amount.toString()).toBe("-400");
  });
});
