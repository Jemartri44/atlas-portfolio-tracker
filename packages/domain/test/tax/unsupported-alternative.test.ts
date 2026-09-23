// A reading the engine cannot compute is information **about that reading**,
// not a reason to deny the report that can be computed (feature 011, block 4).
//
// `taxChain` throws `tax_year_unsupported` when the chain would have to start
// before the first supported year, and the chain starts at the earliest of
// three: the year asked, the first year with figures and the first filed
// return. An **alternative** reading —another configuration— can reach a year
// the good one does not, because `fiscal_date_rule` moves an operation from
// one year to the next.
//
// Before this feature, four alternative readings had no guard at all and the
// report of a supported, computable year simply died. The ledger below is the
// smallest one that does it: one sale whose trade date is the year before the
// first supported one and whose value date is inside it.

import { describe, expect, it } from "vitest";
import { DomainError } from "../../src/errors.js";
import { closedYearImpact } from "../../src/filings/closed-years.js";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.js";
import { FIRST_SUPPORTED_YEAR, isUnsupported, tryReading } from "../../src/tax/chain.js";
import { taxYear } from "../../src/tax/year.js";
import { LedgerBuilder } from "../ledger-builder.js";

const TODAY = "2026-09-01";
const YEAR = FIRST_SUPPORTED_YEAR;

/** Explicit on the one parameter that decides the year of the sale. */
const withRule = (fund: "trade_date" | "value_date"): Settings => ({
  ...DEFAULT_SETTINGS,
  fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, fund },
});

/**
 * A sale agreed on 28 December of the year **before** the first supported one
 * and settled on 3 January of it. Read by value date it is a gain of the first
 * supported year and the report comes out; read by trade date the chain has to
 * start a year earlier than the engine knows how to compute.
 */
const straddling = (options: { previous?: boolean; filed?: boolean } = {}) => {
  const b = new LedgerBuilder();
  b.recordedAt(`${YEAR - 1}-01-02`);
  b.account("acc_fund");
  b.asset("ast_world");
  if (options.previous === true) {
    b.settings(withRule("trade_date"));
  }
  b.settings(withRule("value_date"));
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    trade_date: `${YEAR - 1}-06-01`,
    value_date: `${YEAR - 1}-06-01`,
  });
  b.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    trade_date: `${YEAR - 1}-12-28`,
    value_date: `${YEAR}-01-03`,
    quantity: "1",
    unit_price: "150",
  });
  if (options.filed === true) {
    const figures = { savings_base_eur: "50", pending_losses: [], deferred_losses_eur: "0" };
    b.filed({
      tax_year: YEAR,
      declared: figures,
      computed: {
        as_of: `${YEAR + 1}-06-18`,
        settings_origin: "default",
        // The filing was computed under the **other** reading, which is what
        // makes the re-reading of the prefix reach too far back.
        settings: withRule("trade_date"),
        ...figures,
      } as never,
    });
  }
  return b.build();
};

describe("an alternative reading that predates the supported regime", () => {
  it("does not take the report of the year with it", () => {
    const report = taxYear(straddling(), YEAR, { today: TODAY });
    expect(report.year).toBe(YEAR);
    expect(report.base_eur.amount.toString()).toBe("50");
  });

  it("says of the criterion that its other reading cannot be measured, and why", () => {
    const report = taxYear(straddling(), YEAR, { today: TODAY });
    const stake = [...report.doubtful, ...report.settled].find((entry) => entry.criterion === "1");
    expect(stake?.measure).toBe("not_quantifiable");
    // Told apart from "the other reading leaves invalid events": one is
    // repaired by fixing the ledger, the other cannot be repaired at all.
    expect(stake?.reason).toBe("unsupported_under_alternative");
    expect(stake?.invalid_count).toBeUndefined();
  });

  it("says the same of the difference with the previous settings", () => {
    const report = taxYear(straddling({ previous: true }), YEAR, { today: TODAY });
    expect(report.settings_diff?.unsupported_before).toBe(true);
    expect(report.settings_diff?.base_before_eur).toBeUndefined();
    expect(report.settings_diff?.invalid_before).toBeUndefined();
  });

  it("keeps the comparison with what was filed, without splitting it into causes", () => {
    const report = taxYear(straddling({ filed: true }), YEAR, { today: TODAY });
    expect(report.filing).toBeDefined();
    expect(report.filing?.figures.length).toBeGreaterThan(0);
    // The prefix could not be re-read, so nothing is attributed with certainty.
    expect(report.filing?.figures.every((figure) => figure.causes === undefined)).toBe(true);
  });

  /**
   * And it stays out of a year **no figure of which applies it**, which is the
   * one reason a criterion is left out of the list: not being measurable is
   * not the same as not being applied, and a year with nothing in it has
   * nothing to say about either.
   */
  it("says nothing of a criterion no figure of the year applies", () => {
    // 2019: no transmission of its own, and the other reading of the fiscal
    // date still drags the chain below the first supported year.
    const report = taxYear(straddling(), YEAR + 1, { today: TODAY });
    expect(report.capital_gains.lines).toEqual([]);
    expect([...report.doubtful, ...report.settled].map((entry) => entry.criterion)).not.toContain(
      "1",
    );
  });

  /**
   * The warning of a closed year is reached with **two different settings** by
   * `atlas settings set`, which is the one place the user is writing and not
   * consulting: there it did not lose a report, it killed the command before
   * it could ask. Here it only has to stop throwing — **saying** that it could
   * not compare is the third outcome of block 5.
   */
  it("lets the warning of a closed year through instead of killing the caller", () => {
    const events = straddling({ filed: true });
    expect(() =>
      closedYearImpact(
        { events, settings: withRule("value_date") },
        { events, settings: withRule("trade_date") },
        TODAY,
      ),
    ).not.toThrow();
  });
});

describe("the guard of an alternative reading", () => {
  it("turns only that code into a value", () => {
    const result = tryReading(() => {
      throw new DomainError("tax_year_unsupported", "too early", {
        year: 2017,
        first_supported: 2018,
      });
    });
    expect(isUnsupported(result)).toBe(true);
    expect(result).toEqual({ unsupported: { year: 2017, first_supported: 2018 } });
  });

  /**
   * Swallowing every error would hide real defects for years, which is the
   * kind of comfort that costs a decade. Told apart by the **code**, never by
   * the text of the message.
   */
  it("re-raises anything else", () => {
    expect(() =>
      tryReading(() => {
        throw new DomainError("tax_ledger_invalid", "tax_year_unsupported in the message", {});
      }),
    ).toThrow(DomainError);
    expect(() =>
      tryReading(() => {
        throw new TypeError("not a domain error at all");
      }),
    ).toThrow(TypeError);
  });

  it("gives back what the reading returned when nothing is wrong", () => {
    const result = tryReading(() => ({ value: 1 }));
    expect(isUnsupported(result)).toBe(false);
    expect(result).toEqual({ value: 1 });
  });
});
