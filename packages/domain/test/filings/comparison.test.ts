// Edges of the comparison with what was filed (ADR-0020). The whole thing,
// step by step and with its four causes, is the hand-computed exercise of
// `test/tax/supplementary.test.ts`; here are the cases that exercise is not
// about.

import { describe, expect, it } from "vitest";
import type { Money } from "../../src/money/money.js";
import { taxYear } from "../../src/tax/year.js";
import { buy, sell, taxBuilder } from "../tax/helpers.js";

const TODAY = "2030-01-10";

const text = (money: Money | undefined): string =>
  money === undefined ? "—" : money.amount.toString();

describe("comparing what was filed", () => {
  it("says nothing at all for a year with no return in force", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    expect(taxYear(b.build(), 2027, { today: TODAY }).filing).toBeUndefined();
    // A return of another year does not make this one comparable either.
    b.filed({ tax_year: 2026, filed_at: "2027-06-18" });
    expect(taxYear(b.build(), 2027, { today: TODAY }).filing).toBeUndefined();
  });

  /**
   * A figure the return declares that the ledger no longer computes at all: a
   * pending balance that a later gain absorbed. Comparing it against nothing
   * would hide it; it is compared against zero, which is what it now is.
   */
  it("compares a declared figure the ledger no longer has against zero", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "60");
    b.filed({
      tax_year: 2027,
      filed_at: "2028-06-18",
      declared: {
        savings_base_eur: "0",
        pending_losses: [{ origin_year: 2027, category: "capital_gain", amount_eur: "-400" }],
        deferred_losses_eur: "0",
      },
    });
    // Recorded late: a gain of 2027 that absorbs the whole pending balance.
    buy(b, "stock_t", "2027-02-01", "10", "100");
    sell(b, "stock_t", "2027-09-01", "10", "150");
    const report = taxYear(b.build(), 2027, { today: TODAY });
    const pending = report.filing?.figures.find(
      (entry) => entry.figure === "pending:2027:capital_gain",
    );
    expect([text(pending?.declared), text(pending?.computed_then), text(pending?.now)]).toEqual([
      "-400",
      "-400",
      "0",
    ]);
    expect(text(pending?.causes?.later_events)).toBe("400");
    expect(text(pending?.causes?.at_filing)).toBe("0");
    // And the base, which the return declared at zero, is now the gain left.
    const base = report.filing?.figures.find((entry) => entry.figure === "savings_base");
    expect([text(base?.declared), text(base?.now)]).toEqual(["0", "100"]);
  });

  /**
   * The other direction: a figure the ledger computes now that the return
   * never declared. A loss recorded late leaves a balance pending that was not
   * in the return, and it has to show up as a difference against zero.
   */
  it("compares a figure the ledger now has that the return never declared against zero", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    b.filed({ tax_year: 2027, filed_at: "2028-06-18" });
    // Recorded late: a loss of 2027 bigger than its gain.
    buy(b, "stock_t", "2027-02-01", "10", "100");
    sell(b, "stock_t", "2027-09-01", "10", "50");
    const report = taxYear(b.build(), 2027, { today: TODAY });
    const pending = report.filing?.figures.find(
      (entry) => entry.figure === "pending:2027:capital_gain",
    );
    expect([text(pending?.declared), text(pending?.computed_then), text(pending?.now)]).toEqual([
      "0",
      "0",
      "-300",
    ]);
    expect(text(pending?.causes?.later_events)).toBe("-300");
  });

  it("orders two returns filed the same day by the line they were written on", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    const first = b.filed({ tax_year: 2027, filed_at: "2028-06-18" });
    const second = b.filed({ tax_year: 2027, filed_at: "2028-06-18", supersedes: first.id });
    const report = taxYear(b.build(), 2027, { today: TODAY });
    expect(report.filing?.chain).toEqual([first.id, second.id]);
    expect(report.filing?.filing_id).toBe(second.id);
  });

  it("names the chain and the receipt of the return in force", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    const first = b.filed({ tax_year: 2027, filed_at: "2028-06-18" });
    const second = b.filed({
      tax_year: 2027,
      filed_at: "2028-09-01",
      supersedes: first.id,
    });
    const report = taxYear(b.build(), 2027, { today: TODAY });
    expect(report.filing?.filing_id).toBe(second.id);
    expect(report.filing?.chain).toEqual([first.id, second.id]);
    expect(report.filing?.receipt_reference).toBe("renta-2027-000000000000");
  });
});
