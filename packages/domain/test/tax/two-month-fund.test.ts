// The **default** repurchase window of a fund: two months (criterion #2,
// `2:fund_2m`), worked out by hand in §6.5 of
// `specs/010-tax-output/questions.md` and committed there before this file
// existed.
//
// Why it exists: the seven hand calculations of features 009 and 010 all fix
// the window of funds at **one year**, which was the default when they were
// written. On 2026-09-22 the document changed the reading and the default of
// the product became two months — and from that day no hand calculation backed
// the value the application actually applies. This is the smallest ledger that
// tells the two readings apart: a loss on a fund, one subscription **inside**
// the two months and another **outside**.
//
// The literals below are copied from that document. Any discrepancy is
// investigated and written down there, and the literal is not touched until it
// is clear who was right.

import { describe, expect, it } from "vitest";
import type { LedgerEvent } from "../../src/schema/events.js";
import type { Settings } from "../../src/settings/settings.js";
import { taxYear } from "../../src/tax/year.js";
import { buy, HAND_SETTINGS, sell, taxBuilder, text } from "./helpers.js";

/** Nothing rides a default: the window under test is written down. */
const TWO_MONTHS: Settings = {
  ...HAND_SETTINGS,
  wash_sale_window: { ...HAND_SETTINGS.wash_sale_window, fund: "2m" },
};

const ONE_YEAR: Settings = {
  ...TWO_MONTHS,
  wash_sale_window: { ...TWO_MONTHS.wash_sale_window, fund: "1y" },
};

const TODAY = "2028-01-01";

/** The ledger of §6.5, event by event. */
const ledger = (settings: Settings): LedgerEvent[] => {
  const b = taxBuilder(settings);
  b.deposit({ account_id: "acc_a", value_date: "2026-01-04", amount: "2000" });
  buy(b, "fund_f", "2026-01-05", "100", "10");
  sell(b, "fund_f", "2026-03-10", "100", "6");
  // Inside the window [10/01/2026, 10/05/2026]: 40 units.
  buy(b, "fund_f", "2026-04-20", "40", "6.50");
  // Outside it by 36 days: nothing is deferred on these.
  buy(b, "fund_f", "2026-06-15", "60", "7");
  return b.build();
};

describe("§6.5 — the default two-month window of a fund", () => {
  const report = taxYear(ledger(TWO_MONTHS), 2026, { today: TODAY });
  const line = report.capital_gains.lines[0];

  it("defers only the subscription inside the two months", () => {
    expect(report.capital_gains.lines).toHaveLength(1);
    expect(text(line?.own_eur)).toBe("-400");
    expect(text(line?.deferred_eur)).toBe("-160");
    expect(text(line?.computable_eur_rounded)).toBe("-240");
    const deferral = line?.deferral;
    expect(deferral?.window).toBe("2m");
    expect(deferral?.window_start).toBe("2026-01-10");
    expect(deferral?.window_end).toBe("2026-05-10");
    // Only the subscription of 20/04 is named, with its 40 units.
    expect(
      deferral?.acquisitions.map((entry) => [entry.fiscal_date, entry.units.toString()]),
    ).toEqual([["2026-04-20", "40"]]);
  });

  it("leaves the base at zero and 240,00 pending until 2030", () => {
    expect(text(report.base_eur)).toBe("0");
    expect(
      report.compensation.pending.map((entry) => [
        entry.origin_year,
        entry.category,
        text(entry.amount_eur),
        entry.expires_after,
      ]),
    ).toEqual([[2026, "capital_gain", "-240", 2030]]);
    expect(
      report.wash_sale.pending.map((entry) => [entry.asset_id, text(entry.amount_eur)]),
    ).toEqual([["fund_f", "-160"]]);
  });

  it("would defer the whole loss with the one-year reading, and says so", () => {
    const other = taxYear(ledger(ONE_YEAR), 2026, { today: TODAY });
    expect(text(other.capital_gains.lines[0]?.deferred_eur)).toBe("-400");
    expect(text(other.capital_gains.lines[0]?.computable_eur_rounded)).toBe("0");
    expect(text(other.base_eur)).toBe("0");
    expect(other.compensation.pending).toEqual([]);
    // The whole loss stays deferred, spread over the **two** repurchases that
    // now carry it: 40 units of April and 60 of June. The hand calculation
    // gives the total, and the engine keeps it lot by lot.
    expect(other.wash_sale.pending.map((entry) => text(entry.amount_eur))).toEqual([
      "-160",
      "-240",
    ]);
  });

  it("puts the other reading in the doubtful section, with what it moves", () => {
    const stake = report.doubtful.find((entry) => entry.criterion === "2:fund_2m");
    expect(stake).toBeDefined();
    expect(stake?.certainty).toBe("medium");
    // The base is the same under both readings —a negative balance is not a
    // base— and that is exactly why the other two figures are carried: a
    // comparison that only looked at the base would call them identical.
    expect(text(stake?.base_difference_eur)).toBe("0");
    expect(text(stake?.pending_difference_eur)).toBe("240");
    expect(text(stake?.deferred_difference_eur)).toBe("-240");
  });
});
