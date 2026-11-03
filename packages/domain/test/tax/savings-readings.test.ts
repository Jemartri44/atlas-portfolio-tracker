// One walk for many years: `savingsReadings` gives, year by year, exactly what `taxYear` gives
// without what compares readings (stakes, settings difference, filing comparison, notes). The
// full report is built on the same function, so this holds the shared chain (`chainAt`) to the
// chain asked for each year, figure by figure.

import { describe, expect, it } from "vitest";
import { decodeLine } from "../../src/schema/line.js";
import { savingsQuota } from "../../src/tax/quota.js";
import type { SavingsReading, TaxYearReport } from "../../src/tax/report.js";
import { savingsReadings, taxYear } from "../../src/tax/year.js";
import { fixtureLines } from "../fixtures-path.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { LONG_LEDGER_END, longLedger } from "./long-ledger.js";

const fixture = (name: string) => fixtureLines(name).map((line) => decodeLine(line).event);

const withoutComparisons = (report: TaxYearReport): SavingsReading => {
  const { filing, doubtful, settled, notes, settings_diff, ...reading } = report;
  return reading;
};

/** A loss of 2027 the return declared smaller (−60 for −100), offset in 2028 (ADR-0020). */
const anchored = () => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2027-01-11" });
  b.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "10",
    unit_price: "90",
    value_date: "2027-06-01",
  });
  b.buy({ account_id: "acc_fund", asset_id: "ast_bonds", trade_date: "2028-01-10" });
  b.sell({
    account_id: "acc_fund",
    asset_id: "ast_bonds",
    quantity: "10",
    unit_price: "120",
    value_date: "2028-06-01",
  });
  b.filed({
    tax_year: 2027,
    filed_at: "2028-06-18",
    declared: {
      savings_base_eur: "0",
      pending_losses: [{ origin_year: 2027, category: "capital_gain", amount_eur: "-60" }],
      deferred_losses_eur: "0",
    },
  });
  return b.build();
};

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("savingsReadings", () => {
  it.each([
    ["the golden ledger", () => fixture("synthetic-v1.jsonl"), "2029-06-01", range(2018, 2028)],
    [
      "the hand-checked ledger",
      () => fixture("tax-hand-v1.jsonl"),
      "2026-09-18",
      range(2018, 2026),
    ],
    ["twenty years, with income from outside", longLedger, LONG_LEDGER_END, range(2018, 2037)],
    ["a filed return replacing what it carries", anchored, "2035-01-01", range(2025, 2030)],
  ])(
    "is what taxYear gives, year by year: %s",
    (_, ledger, today, years) => {
      const events = ledger();
      for (const external of [false, true]) {
        const options = { today, external };
        const readings = savingsReadings(events, years, options);
        for (const year of years) {
          const full = taxYear(events, year, options);
          const light = readings.get(year) as SavingsReading;
          expect(light).toEqual(withoutComparisons(full));
          expect(savingsQuota(light)).toEqual(savingsQuota(full));
        }
      }
      // The full reports it compares against cost about 125 ms a year each.
    },
    60_000,
  );

  it("says which years the engine does not read, and reads nothing for no year", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    // A sale of 2017 starts the chain before the regime: no year after it can be read either.
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2017-05-02" });
    b.sell({ account_id: "acc_fund", asset_id: "ast_world", value_date: "2017-06-02" });
    b.sell({ account_id: "acc_fund", asset_id: "ast_world", value_date: "2019-05-02" });
    expect(() => taxYear(b.build(), 2019, { today: "2020-01-01" })).toThrow(
      expect.objectContaining({ code: "tax_year_unsupported" }),
    );
    const readings = savingsReadings(b.build(), [2019], { today: "2020-01-01" });
    expect(readings.get(2019)).toEqual({ unsupported: { year: 2017, first_supported: 2018 } });
    expect(savingsReadings(b.build(), [], { today: "2020-01-01" }).size).toBe(0);
    const recent = new LedgerBuilder();
    catalogue(recent);
    expect(savingsReadings(recent.build(), [2017], { today: "2020-01-01" }).get(2017)).toEqual({
      unsupported: { year: 2017, first_supported: 2018 },
    });
  });

  it("refuses a ledger with invalid events, as taxYear does", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.sell({ account_id: "acc_fund", asset_id: "ast_world", value_date: "2027-05-02" });
    expect(() => savingsReadings(b.build(), [2027], { today: "2028-01-01" })).toThrow(
      expect.objectContaining({ code: "tax_ledger_invalid" }),
    );
  });
});
