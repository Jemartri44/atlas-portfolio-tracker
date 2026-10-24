// A rate in doubt is told once per event, however many lines the event has: a
// restructuring can sell the same asset in the same account more than once.

import { describe, expect, it } from "vitest";
import { taxYear } from "../../src/tax/year.js";
import { buy, taxBuilder } from "./helpers.js";

const forcedSale = (quantity: string, price: string) => ({
  op: "forced_sale" as const,
  per_account: [{ account_id: "acc_a", quantity, fee: "0", withholding: "0" }],
  unit_price: price,
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-03-01",
});

describe("the notes about an ECB rate", () => {
  it.each([
    ["fx_rate_mismatch", "tax_fx_rate_finding"],
    ["fx_rate_unverifiable", "tax_fx_rate_unverified"],
  ])("%s on an event with two sales gives one %s", (code, note) => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const action = b.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      effects: [forcedSale("3", "110"), forcedSale("2", "120")],
    });
    const report = taxYear(b.build(), 2027, {
      today: "2028-03-01",
      rateFindings: [{ event_id: action.id, code }],
    });
    expect(report.capital_gains.lines).toHaveLength(2);
    expect(report.notes.filter((entry) => entry.code === note)).toHaveLength(1);
  });
});
