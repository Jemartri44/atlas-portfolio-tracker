// Feature 016, E4 (plan §10.4; Q10; questions §13; mutant 31): the two
// warnings of January that touch the fiscal path. The income tax says it is
// ready and how many notes and criteria in dispute it carries — **no figure,
// ever** (Q10). The 720 and the 721 are decided with the function of the
// model, which reads **manual valuations only**, and said in a neutral text.

import { describe, expect, it } from "vitest";
import { informativeFacts } from "../../src/jobs/informative.js";
import { taxReturnFacts } from "../../src/jobs/tax-return.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { taxYear } from "../../src/tax/year.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

/** A year of a fund sold at a gain and a dividend: a report with figures. */
const year2026 = (): LedgerEvent[] => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.deposit({ account_id: "acc_fund", amount: "10000", value_date: "2026-01-02" });
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "6",
    unit_price: "1000",
    trade_date: "2026-01-05",
  });
  b.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "2",
    unit_price: "1200",
    trade_date: "2026-06-10",
  });
  return b.build();
};

describe("the income tax of January (Q10)", () => {
  it("says the year before is ready with its counts of notes and criteria in dispute", () => {
    const events = year2026();
    const report = taxYear(events, 2026, { today: "2027-01-01" });
    expect(taxReturnFacts({ events, year: 2026, today: "2027-01-01" })).toEqual({
      ok: true,
      year: 2026,
      notes: report.notes.length,
      disputed: report.doubtful.length,
    });
    // Pinned as well: two notes and one criterion whose reading is open.
    expect([report.notes.length, report.doubtful.length]).toEqual([2, 1]);
  });

  it("says a ledger the engine refuses by its code, never by its message", () => {
    const events = year2026();
    const broken = events.map((event) =>
      event.type === "sell" ? ({ ...event, quantity: "60" } as LedgerEvent) : event,
    );
    expect(taxReturnFacts({ events: broken, year: 2026, today: "2027-01-01" })).toEqual({
      ok: false,
      year: 2026,
      code: "tax_ledger_invalid",
    });
    // The findings of the ECB check only note lines, as `atlas tax` passes them.
    expect(
      taxReturnFacts({ events, year: 2026, today: "2027-01-01", rateFindings: [] }),
    ).toMatchObject({
      ok: true,
      notes: 2,
    });
    // A failure that is not one of the domain says no message either.
    expect(
      taxReturnFacts({ events: [null as unknown as LedgerEvent], year: 2026, today: "2027-01-01" }),
    ).toEqual({ ok: false, year: 2026, code: "tax_failed" });
    // The engine applies the regime in force since 2018: January of 2018 asks for 2017.
    expect(taxReturnFacts({ events, year: 2017, today: "2018-01-01" })).toEqual({
      ok: false,
      year: 2017,
      code: "tax_year_unsupported",
    });
  });
});

describe("the thresholds of the 720 and the 721 (mutant 31)", () => {
  it("says nothing for a ledger with nothing abroad", () => {
    expect(informativeFacts({ events: year2026(), year: 2026, today: "2027-01-01" })).toEqual({
      year: 2026,
      invalid: false,
      models: [],
    });
  });

  it("says which model to look at, from the valuations by hand at 31 December", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_etf", amount: "70000", value_date: "2026-01-02" });
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_world",
      quantity: "600",
      unit_price: "100",
      trade_date: "2026-01-05",
    });
    b.valuation({
      account_id: "acc_etf",
      asset_id: "ast_world",
      date: "2026-12-31",
      quantity: "600",
      unit_value: "100",
    });
    const facts = informativeFacts({ events: b.build(), year: 2026, today: "2027-01-01" });
    expect(facts.year).toBe(2026);
    expect(facts.invalid).toBe(false);
    expect(facts.models).toEqual(["720"]);
  });

  it("says a ledger with invalid events, which the models cannot value", () => {
    const events = year2026().map((event) =>
      event.type === "sell" ? ({ ...event, quantity: "60" } as LedgerEvent) : event,
    );
    expect(informativeFacts({ events, year: 2026, today: "2027-01-01" })).toEqual({
      year: 2026,
      invalid: true,
      models: [],
    });
  });
});

describe("the year of the warnings of January comes from their period (review of PR #109, avisos B1)", () => {
  it("computes the year it is given, never the one of the day", () => {
    const events = year2026();
    const report = taxYear(events, 2025, { today: "2027-01-01" });
    expect(taxReturnFacts({ events, year: 2025, today: "2027-01-01" })).toEqual({
      ok: true,
      year: 2025,
      notes: report.notes.length,
      disputed: report.doubtful.length,
    });
    expect(informativeFacts({ events, year: 2025, today: "2027-01-01" }).year).toBe(2025);
  });
});
