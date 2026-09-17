// The manual price depends on the valuation date, not on the order the
// valuations were recorded in (decision (b) of prompt 004). Only a tie on the
// same date is broken by file position.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { manualPrices } from "../../src/projections/prices.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerEvent, ValuationEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATES = ["2027-03-31", "2027-06-30", "2027-09-30", "2027-12-31"] as const;

/** A ledger whose valuations of `ast_world` are recorded in the given order. */
const ledgerWith = (order: readonly number[]): LedgerEvent[] => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
  for (const index of order) {
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: DATES[index] as string,
      unit_value: String(100 + index),
    });
  }
  return b.build();
};

const priceAt = (events: LedgerEvent[], date: string): string | undefined =>
  manualPrices(projectLedger(events), date, DEFAULT_SETTINGS)
    .get("ast_world")
    ?.unit_value.toString();

describe("manualPrices is decided by the date, not by the recording order", () => {
  it("gives the same price for any permutation of valuations of different dates", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([0, 1, 2, 3], { minLength: 4, maxLength: 4 }),
        fc.constantFrom(...DATES, "2027-01-01"),
        (order, asked) => {
          expect(priceAt(ledgerWith(order), asked)).toBe(priceAt(ledgerWith([0, 1, 2, 3]), asked));
        },
      ),
      { numRuns: 50 },
    );
  });

  it("never returns a valuation later than the date asked", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([0, 1, 2, 3], { minLength: 4, maxLength: 4 }),
        fc.integer({ min: 0, max: 3 }),
        (order, index) => {
          const asked = DATES[index] as string;
          const events = ledgerWith(order);
          const price = manualPrices(projectLedger(events), asked, DEFAULT_SETTINGS).get(
            "ast_world",
          );
          expect(price?.date).toBe(asked);
          expect(price?.age_days).toBe(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("breaks a tie on the same date by file position, whatever the values", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 999 }), { minLength: 2, maxLength: 5 }),
        (values) => {
          const b = new LedgerBuilder();
          catalogue(b);
          b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
          let last: ValuationEvent | undefined;
          for (const value of values) {
            last = b.valuation({
              account_id: "acc_fund",
              asset_id: "ast_world",
              date: "2027-12-31",
              unit_value: String(value),
            });
          }
          expect(priceAt(b.build(), "2027-12-31")).toBe(String(last?.unit_value));
        },
      ),
      { numRuns: 30 },
    );
  });
});
