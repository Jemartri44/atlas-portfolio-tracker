import { describe, expect, it } from "vitest";
import { closedYearImpact } from "../../src/filings/closed-years.js";
import { buy, sell, taxBuilder } from "../tax/helpers.js";

describe("closedYearImpact (filings/closed-years.ts)", () => {
  it("reads the rule of the fiscal date by default when no settings were ever recorded", () => {
    const b = taxBuilder(null);
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    b.filed({
      tax_year: 2027,
      filed_at: "2028-06-18",
      declared: { savings_base_eur: "200", pending_losses: [], deferred_losses_eur: "0" },
    });
    const before = b.build();
    b.fee({ account_id: "acc_a", value_date: "2027-09-01", amount: "10" });
    const [impact] = closedYearImpact({ events: before }, { events: b.build() }, "2030-06-01");
    expect(impact?.year).toBe(2027);
    expect(impact?.by_date).toBe(true);
  });
});
