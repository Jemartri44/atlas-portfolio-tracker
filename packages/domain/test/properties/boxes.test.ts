// The layout by box moves figures between rows and **never creates or loses
// one** (feature 010, ficha F5), on random ledgers with transfers, conversions,
// carve-outs, splits, reverse splits with cash in lieu, swaps and grants.
//
// The engine folds what a repurchase released into the disposal that releases
// it; the form wants every operation with its own result and what comes back
// from an earlier year in a section of its own. The reordering is where a euro
// could go missing without any total noticing, because every total would still
// be internally consistent. So the two sides are added up: the rows of the form
// and what the engine put into the balance of capital gains, to the last
// decimal and before any rounding.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { rowsAddUpToTheEngine } from "../tax/helpers.js";
import { taxLedgerOf, taxOpArb } from "./tax-ledgers.js";

/** Generous, like the other property suites: a loaded machine must not turn the suite red. */
const BUDGET_MS = 120_000;

describe("the rows of the form on random ledgers", () => {
  it(
    "adds every row up to the balance the engine computed, to the last decimal",
    () => {
      let years = 0;
      fc.assert(
        fc.property(
          fc.array(taxOpArb, { minLength: 5, maxLength: 30 }),
          fc.integer({ min: 0, max: 3 }),
          (ops, offset) => {
            const events = taxLedgerOf(ops);
            const year = 2027 + offset;
            const totals = rowsAddUpToTheEngine(events, year, "2040-01-01");
            years += 1;
            expect(totals.rows).toBe(totals.engine);
          },
        ),
        { numRuns: 200 },
      );
      // The property itself: if the generator stopped producing ledgers, it
      // would pass without checking anything.
      expect(years).toBeGreaterThan(150);
    },
    BUDGET_MS,
  );
});
