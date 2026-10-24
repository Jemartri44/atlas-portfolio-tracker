// A restructuring can sell the same asset in the same account more than once.
// The comparisons between two readings of the ledger (the warning of a settings
// change, the stakes of a criterion) must see each of those sales, not only
// the last one.

import { describe, expect, it } from "vitest";
import { buy, HAND_SETTINGS, reportOf, taxBuilder } from "./helpers.js";

const forcedSale = (quantity: string, price: string, currency = "EUR", rate = "1") => ({
  op: "forced_sale" as const,
  per_account: [{ account_id: "acc_a", quantity, fee: "0", withholding: "0" }],
  unit_price: price,
  currency,
  fx_rate: rate,
  fx_rate_date: "2027-03-01",
});

const window = (stock: "2m" | "1y") => ({
  ...HAND_SETTINGS,
  wash_sale_window: { ...HAND_SETTINGS.wash_sale_window, stock },
});

describe("two sales of one event in one account", () => {
  it("the warning of a settings change sees a change in the first of them", () => {
    const b = taxBuilder(null);
    b.settings(window("2m"));
    b.settings(window("1y"));
    // Bought outside the two months before the sale and again five months
    // after it: only the one-year window defers the loss of the first sale.
    // The second is a gain.
    buy(b, "stock_s", "2026-09-01", "10", "100");
    b.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      effects: [forcedSale("3", "90"), forcedSale("2", "120")],
    });
    buy(b, "stock_s", "2027-08-02", "3", "100");
    const diff = reportOf(b.build(), 2027, "2028-03-01").settings_diff;
    expect(diff?.base_before_eur?.amount.toString()).toBe("10");
    expect(diff?.base_after_eur.amount.toString()).toBe("40");
    expect(diff?.changes.map((change) => change.what)).toEqual(["computable"]);
  });

  it("a criterion names the event once", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      effects: [forcedSale("3", "110", "USD", "1.1"), forcedSale("2", "120", "USD", "1.1")],
    });
    const report = reportOf(b.build(), 2027, "2028-03-01");
    const stake = [...report.doubtful, ...report.settled].find((entry) => entry.criterion === "4");
    expect(stake?.event_ids).toHaveLength(1);
  });
});
