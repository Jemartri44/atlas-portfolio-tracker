// The warning of a closed tax year (ADR-0020, amended; prompt 010, P4).
//
// It warns in the two ways, and the second is the one that is easy to get
// wrong: an event whose own date belongs to another year, but which moves a
// figure of a year already filed.

import { describe, expect, it } from "vitest";
import {
  type ClosedYearImpact,
  closedYearImpact,
  type MovedFigure,
} from "../../src/filings/closed-years.js";
import { unfiledPastYears } from "../../src/filings/touched.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import type { LedgerBuilder } from "../ledger-builder.js";
import { buy, sell, taxBuilder } from "../tax/helpers.js";

const TODAY = "2030-06-01";

/** What a comparison that **was** made says moved; it fails loudly if it was not made. */
const movesOf = (impact: ClosedYearImpact | undefined): readonly MovedFigure[] => {
  const comparison = impact?.comparison;
  if (comparison?.status !== "compared") {
    throw new Error(`expected a comparison, got ${JSON.stringify(comparison)}`);
  }
  return comparison.moves;
};

/** The return of `year`, declaring what the ledger itself computes for it. */
const fileReturn = (b: LedgerBuilder, year: number, base: string, deferred = "0") =>
  b.filed({
    tax_year: year,
    filed_at: `${year + 1}-06-18`,
    declared: {
      savings_base_eur: base,
      pending_losses: [],
      deferred_losses_eur: deferred,
    },
  });

describe("what a change does to a year already filed", () => {
  it("says nothing at all when nothing was filed: the fast path", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const before = b.build();
    sell(b, "stock_s", "2027-06-01", "10", "120");
    expect(closedYearImpact({ events: before }, { events: b.build() }, TODAY)).toEqual([]);
  });

  it("warns by date: what is recorded falls in a year with a return in force", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    const filing = fileReturn(b, 2027, "200");
    const before = b.build();
    // A fee of 2027, recorded in 2030: its year is closed.
    b.fee({ account_id: "acc_a", value_date: "2027-09-01", amount: "10" });
    const [impact] = closedYearImpact({ events: before }, { events: b.build() }, TODAY);
    expect(impact?.model).toBe("renta");
    expect(impact?.year).toBe(2027);
    expect(impact?.filing_id).toBe(filing.id);
    expect(impact?.filed_at).toBe("2028-06-18");
    expect(impact?.by_date).toBe(true);
    expect(impact?.comparison).toEqual({ status: "compared", moves: [] });
  });

  /**
   * The case the amendment of ADR-0020 exists for: the repurchase is dated in
   * January and the loss it defers is of the December before, so the rule by
   * date alone would say nothing while the base of a filed year moves.
   */
  it("warns by figure: a repurchase in January moves the base of the December filed", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    buy(b, "stock_t", "2027-01-11", "10", "100");
    sell(b, "stock_t", "2027-06-01", "10", "200");
    // A loss of December 2027, computable while nothing is repurchased.
    sell(b, "stock_s", "2027-12-20", "10", "60");
    fileReturn(b, 2027, "600");
    const before = b.build();
    // Bought again in January 2028, inside the two-month window: the loss of
    // 2027 stops being computable and the base of 2027 goes up.
    buy(b, "stock_s", "2028-01-15", "10", "60");
    const [impact] = closedYearImpact({ events: before }, { events: b.build() }, TODAY);
    expect(impact?.year).toBe(2027);
    // Its own date is 2028, not 2027.
    expect(impact?.by_date).toBe(false);
    expect(movesOf(impact).map((move) => [move.figure, move.before, move.after])).toEqual([
      ["savings_base", "600", "1000"],
      ["deferred", "0", "-400"],
    ]);
  });

  it("warns for a settings change that moves a filed year, with no event at all", () => {
    const b = taxBuilder();
    buy(b, "etc_e", "2027-01-11", "10", "100");
    sell(b, "etc_e", "2027-06-01", "10", "80");
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-09-01", "10", "150");
    fileReturn(b, 2027, "375");
    const events = b.build();
    const asGain = { ...DEFAULT_SETTINGS, income_category: { etc: "capital_gain" as const } };
    const [impact] = closedYearImpact(
      { events, settings: asGain },
      { events, settings: DEFAULT_SETTINGS },
      TODAY,
    );
    expect(impact?.year).toBe(2027);
    expect(impact?.by_date).toBe(false);
    expect(movesOf(impact).map((move) => [move.figure, move.before, move.after])).toEqual([
      ["savings_base", "300", "375"],
      ["pending:2027:movable_capital", "0", "-75"],
    ]);
  });

  it("compares the pending balances the return declares, one by one", () => {
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
    const before = b.build();
    // A gain of 2027 recorded late: it absorbs the whole balance, which stops
    // being pending at all — the figure the return declares disappears.
    buy(b, "stock_t", "2027-02-01", "10", "100");
    sell(b, "stock_t", "2027-09-01", "10", "150");
    const [impact] = closedYearImpact({ events: before }, { events: b.build() }, TODAY);
    expect(movesOf(impact).map((move) => [move.figure, move.before, move.after])).toEqual([
      ["savings_base", "0", "100"],
      ["pending:2027:capital_gain", "-400", "0"],
    ]);
  });

  it("names a 720 by date alone: its assets are valued at market, outside the chain", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.filed({ tax_year: 2027, model: "720", filed_at: "2028-03-20" });
    const before = b.build();
    sell(b, "stock_s", "2027-06-01", "10", "120");
    const [impact] = closedYearImpact({ events: before }, { events: b.build() }, TODAY);
    expect(impact?.model).toBe("720");
    expect(impact?.by_date).toBe(true);
    expect(impact?.comparison).toEqual({ status: "not_compared", reason: "by_design" });
  });

  it("compares nothing when either reading has invalid events (ADR-0015)", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    fileReturn(b, 2027, "200");
    const before = b.build();
    // A sale of what is not there: the reading cannot be computed.
    sell(b, "stock_t", "2027-07-01", "10", "120");
    const [impact] = closedYearImpact({ events: before }, { events: b.build() }, TODAY);
    expect(impact?.by_date).toBe(true);
    // It falls by date, and what it does to the declared figures is **not
    // known** — which is not the same as knowing it moves nothing.
    expect(impact?.comparison).toEqual({ status: "not_compared", reason: "invalid_reading" });
  });

  /**
   * **The hole the header of this module used to deny**, and the worse half of
   * it (feature 011, block 5).
   *
   * If the earlier reading cannot be computed there is nothing to compare, and
   * if the change does not fall **by date** inside the filed year either,
   * nothing was pushed at all: the warning that promises "never in silence"
   * was silent. It is the example the header itself uses — the repurchase of
   * January that defers the loss of December.
   */
  it("says it could not compare, instead of staying silent", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    buy(b, "stock_t", "2027-01-11", "10", "100");
    sell(b, "stock_t", "2027-06-01", "10", "200");
    sell(b, "stock_s", "2027-12-20", "10", "60");
    fileReturn(b, 2027, "600");
    // A sale of what is not there: **both** readings are invalid from here on.
    sell(b, "stock_u", "2027-07-01", "10", "120");
    const before = b.build();
    // Bought again in January 2028: outside the filed year by date, and it
    // would move the base of 2027 if the reading could be computed.
    buy(b, "stock_s", "2028-01-15", "10", "60");
    const [impact] = closedYearImpact({ events: before }, { events: b.build() }, TODAY);
    expect(impact).toBeDefined();
    expect(impact?.year).toBe(2027);
    expect(impact?.by_date).toBe(false);
    expect(impact?.comparison).toEqual({ status: "not_compared", reason: "invalid_reading" });
  });

  /**
   * And the third cause, which is not a failure at all: the figures of a 720
   * are market values that live in another module, so the chain **does not
   * compare them by design**. Saying "it moves nothing" of them would be
   * affirming what was never checked.
   */
  it("tells apart a model whose figures it does not compare by design", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.filed({ tax_year: 2027, model: "720", filed_at: "2028-03-20" });
    const before = b.build();
    sell(b, "stock_s", "2027-06-01", "10", "120");
    const [impact] = closedYearImpact({ events: before }, { events: b.build() }, TODAY);
    expect(impact?.model).toBe("720");
    expect(impact?.comparison).toEqual({ status: "not_compared", reason: "by_design" });
  });

  /**
   * **When a write can affect an informative return, and only then** (review of
   * feature 011, blocking 3). With a 720 of 2027 on record, a purchase of 2029
   * or a plain `asset_created` said «Puede que toque una complementaria»: a
   * warning that fires always is learnt to be ignored, and with it the one of
   * the Renta, which is the one that matters.
   *
   * The horizon is derived from how the 720 and the 721 are really valued:
   * the holdings and the cash **on 31 December**, and the daily balances of
   * the fourth quarter, all of them projected with `asOf` = 31/12, which cuts by
   * **business date**. So what can move them is what has a business date **on
   * or before the close** of that year — not only inside it: a purchase of 2025
   * still in the portfolio moves the 720 of 2027.
   */
  describe("an informative return, and the writes that can reach it", () => {
    const with720 = () => {
      const b = taxBuilder();
      buy(b, "stock_s", "2025-03-10", "10", "100");
      b.filed({ tax_year: 2027, model: "720", filed_at: "2028-03-20" });
      return b;
    };

    it("stays silent for an operation dated after the close of its year", () => {
      const b = with720();
      const before = b.build();
      buy(b, "stock_t", "2029-02-05", "10", "100");
      expect(closedYearImpact({ events: before }, { events: b.build() }, TODAY)).toEqual([]);
    });

    it("stays silent for an event with no business date, like a new asset", () => {
      const b = with720();
      const before = b.build();
      b.asset("fund_new");
      expect(closedYearImpact({ events: before }, { events: b.build() }, TODAY)).toEqual([]);
    });

    it("stays silent for a tracking event, which moves neither holdings nor cash", () => {
      const b = with720();
      const before = b.build();
      b.orderPlaced({ account_id: "acc_a", asset_id: "stock_s", requested_date: "2026-05-04" });
      expect(closedYearImpact({ events: before }, { events: b.build() }, TODAY)).toEqual([]);
    });

    it("warns for an operation dated before the year, which is still in the holdings", () => {
      const b = with720();
      const before = b.build();
      buy(b, "stock_t", "2026-06-01", "10", "100");
      const [impact] = closedYearImpact({ events: before }, { events: b.build() }, TODAY);
      expect(impact?.model).toBe("720");
      expect(impact?.by_date).toBe(false);
      expect(impact?.comparison).toEqual({ status: "not_compared", reason: "by_design" });
    });

    it("warns for the reversal of something dated on or before the close", () => {
      const b = with720();
      const bought = buy(b, "stock_t", "2026-06-01", "10", "100");
      const before = b.build();
      b.reversal(bought.id, "duplicada");
      expect(closedYearImpact({ events: before }, { events: b.build() }, TODAY)).toHaveLength(1);
    });

    /**
     * The one event with no business date that **can** move them: a change of
     * the fiscal date rule moves operations across 31 December, and the
     * holdings on that day with them. A change of anything else —a threshold,
     * a target weight— moves no figure of a return that was filed.
     */
    it("warns for a change of the fiscal date rule, and not for any other setting", () => {
      const events = with720().build();
      const byValueDate = {
        ...DEFAULT_SETTINGS,
        fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, stock: "value_date" as const },
      };
      expect(closedYearImpact({ events }, { events, settings: byValueDate }, TODAY)).toHaveLength(
        1,
      );
      const otherThreshold = { ...DEFAULT_SETTINGS, deviation_threshold_pp: "9" };
      expect(closedYearImpact({ events }, { events, settings: otherThreshold }, TODAY)).toEqual([]);
    });

    /**
     * Annulling a change of the fiscal date rule moves it back, and moves the
     * operations back across 31 December with it: the warning must compare
     * the settings **in force** on each side, not the last line written, which
     * after a reversal is still the annulled change (second review of 011).
     */
    it("warns for the reversal of a change of the fiscal date rule", () => {
      const b = with720();
      const change = b.settings({
        ...DEFAULT_SETTINGS,
        fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, stock: "value_date" as const },
      });
      const before = b.build();
      b.reversal(change.id, "me equivoqué de regla");
      const [impact] = closedYearImpact({ events: before }, { events: b.build() }, TODAY);
      expect(impact?.model).toBe("720");
    });

    it("stays silent for the reversal of a change that did not touch the rule", () => {
      const b = with720();
      const change = b.settings({ ...DEFAULT_SETTINGS, deviation_threshold_pp: "9" });
      const before = b.build();
      b.reversal(change.id, "umbral equivocado");
      expect(closedYearImpact({ events: before }, { events: b.build() }, TODAY)).toEqual([]);
    });
  });

  it("says nothing of an event with no business date, like a change of the catalogue", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    fileReturn(b, 2027, "200");
    const before = b.build();
    b.asset("fund_z");
    expect(closedYearImpact({ events: before }, { events: b.build() }, TODAY)).toEqual([]);
  });

  it("does not see a return filed after the day asked", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    fileReturn(b, 2027, "200");
    const before = b.build();
    b.fee({ account_id: "acc_a", value_date: "2027-09-01", amount: "10" });
    const after: LedgerEvent[] = b.build();
    expect(closedYearImpact({ events: before }, { events: after }, "2028-06-17")).toEqual([]);
    expect(closedYearImpact({ events: before }, { events: after }, "2028-06-18")).toHaveLength(1);
  });

  it("names the year of what a reversal annuls, not the year it is recorded in", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const sale = sell(b, "stock_s", "2027-06-01", "10", "120");
    fileReturn(b, 2027, "200");
    const before = b.build();
    b.reversal(sale.id, "el precio estaba mal");
    const [impact] = closedYearImpact({ events: before }, { events: b.build() }, TODAY);
    expect(impact?.year).toBe(2027);
    expect(impact?.by_date).toBe(true);
    expect(movesOf(impact).map((move) => move.figure)).toEqual(["savings_base"]);
  });
});

const unfiled = (events: readonly LedgerEvent[], today: string): number[] =>
  unfiledPastYears(today, projectLedger(events, { collectErrors: true }));

describe("past years with nothing filed", () => {
  it("lists them, and stops listing one once its return is recorded", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    // Income alone is enough to make a year worth filing.
    b.interest({ account_id: "acc_a", value_date: "2028-03-01", gross: "40" });
    expect(unfiled(b.build(), TODAY)).toEqual([2027, 2028]);
    fileReturn(b, 2027, "200");
    expect(unfiled(b.build(), TODAY)).toEqual([2028]);
    // On 1 June 2028 the return of 2027 had not been filed yet (it was on the
    // 18th), and 2028 is the current year, which nobody files yet.
    expect(unfiled(b.build(), "2028-06-01")).toEqual([2027]);
    expect(unfiled(b.build(), "2028-06-18")).toEqual([]);
  });
});
