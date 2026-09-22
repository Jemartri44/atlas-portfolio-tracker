// Edges of the comparison with what was filed (ADR-0020). The whole thing,
// step by step and with its four causes, is the hand-computed exercise of
// `test/tax/supplementary.test.ts`; here are the cases that exercise is not
// about.

import { describe, expect, it } from "vitest";
import type { Money } from "../../src/money/money.js";
import { normalizeSettings } from "../../src/settings/settings.js";
import { taxYear } from "../../src/tax/year.js";
import { buy, HAND_SETTINGS, sell, taxBuilder } from "../tax/helpers.js";

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

  /**
   * The four causes have to **split** the difference, not merely add up to it:
   * adding up to it is an algebraic identity that any split satisfies, because
   * the last one is written as `now − R1` whatever R1 is.
   *
   * What they are worth is that each reading differs from the one before it in
   * **one** thing. R0 and R1 used to differ in two —the configuration **and**
   * the day of the query— and the subtraction was labelled with only one of
   * them.
   *
   * The case that shows it: a return of 2026 filed on 1 July 2028, which sits
   * inside the prefix of the one of 2027, whose figures were computed on 1 May
   * 2028. On that day the return of 2026 had not been filed yet, so the chain
   * of 2027 anchored on nothing and reached a base of 500,00; today it anchors
   * on the −800,00 that return declares and reaches 0,00. **Not one setting
   * was touched**, and the whole −500,00 used to be charged to
   * «configuración», which tells the user "you read a criterion the other way"
   * when what happened is that the world moved on: two different decisions
   * about filing a supplementary return.
   */
  it("charges nothing to the configuration when only the day of the query moved", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2026-02-01", "10", "100");
    // −300,00 in 2026: the buy of February is outside the two-month window.
    sell(b, "stock_s", "2026-09-01", "10", "70");
    buy(b, "stock_t", "2027-01-15", "10", "100");
    // +800,00 in 2027.
    sell(b, "stock_t", "2027-09-01", "10", "180");
    // Filed late, and declaring a bigger pending loss than the ledger computes.
    b.filed({
      tax_year: 2026,
      filed_at: "2028-07-01",
      declared: {
        savings_base_eur: "0",
        pending_losses: [{ origin_year: 2026, category: "capital_gain", amount_eur: "-800" }],
        deferred_losses_eur: "0",
      },
    });
    const figures = { savings_base_eur: "500", pending_losses: [], deferred_losses_eur: "0" };
    b.filed({
      tax_year: 2027,
      filed_at: "2028-08-01",
      declared: figures,
      computed: {
        as_of: "2028-05-01",
        settings_origin: "default",
        settings: normalizeSettings(HAND_SETTINGS),
        ...figures,
      },
    });
    const report = taxYear(b.build(), 2027, { today: TODAY });
    const base = report.filing?.figures.find((entry) => entry.figure === "savings_base");
    expect([text(base?.declared), text(base?.computed_then), text(base?.now)]).toEqual([
      "500",
      "500",
      "0",
    ]);
    expect([
      text(base?.causes?.at_filing),
      text(base?.causes?.engine),
      text(base?.causes?.settings),
      text(base?.causes?.later_events),
    ]).toEqual(["0", "0", "0", "-500"]);
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
