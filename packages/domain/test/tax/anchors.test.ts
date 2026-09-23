// What the engine **substitutes**, the engine says — and it says **all** of it
// (ADR-0020, ADR-0024; feature 011, block 6).
//
// When a return is on record the chain replaces the pending losses it computed
// with the ones that return declared, and carries on from there. That is the
// decision and it is right. What was wrong is that the report kept **one**
// anchor: a single `let` overwritten at every year of the chain that had a
// filing, so with two returns filed only the last one survived and the first
// substitution disappeared without a trace — no interface could tell the user
// about it, because it never reached them.

import { describe, expect, it } from "vitest";
import { taxYear } from "../../src/tax/year.js";
import { buy, sell, taxBuilder } from "./helpers.js";

const TODAY = "2031-06-01";

/**
 * A loss of 2027 and a loss of 2028, each one filed declaring something
 * **different** from what the ledger computes, and a gain of 2029 that the
 * chain has to reach through both anchors.
 */
const twoFiled = () => {
  const b = taxBuilder();
  buy(b, "stock_s", "2027-01-11", "10", "100");
  sell(b, "stock_s", "2027-06-01", "10", "60");
  b.filed({
    tax_year: 2027,
    filed_at: "2028-06-18",
    declared: {
      savings_base_eur: "0",
      // The ledger computes −400; the return declared −300.
      pending_losses: [{ origin_year: 2027, category: "capital_gain", amount_eur: "-300" }],
      deferred_losses_eur: "0",
    },
  });
  buy(b, "stock_t", "2028-01-11", "10", "100");
  sell(b, "stock_t", "2028-06-01", "10", "80");
  b.filed({
    tax_year: 2028,
    filed_at: "2029-06-18",
    declared: {
      savings_base_eur: "0",
      // And here −450 where the chain would carry −500.
      pending_losses: [
        { origin_year: 2027, category: "capital_gain", amount_eur: "-300" },
        { origin_year: 2028, category: "capital_gain", amount_eur: "-150" },
      ],
      deferred_losses_eur: "0",
    },
  });
  buy(b, "fund_f", "2029-01-11", "10", "100");
  sell(b, "fund_f", "2029-06-01", "10", "200");
  return b.build();
};

describe("the anchors of what was filed", () => {
  it("keeps every substitution the chain applied, not the last one", () => {
    const report = taxYear(twoFiled(), 2029, { today: TODAY });
    expect(report.anchors.map((anchor) => anchor.year)).toEqual([2027, 2028]);
  });

  it("carries what it computed and what was declared, for each one", () => {
    const report = taxYear(twoFiled(), 2029, { today: TODAY });
    const [first, second] = report.anchors;
    expect(first?.computed.map((entry) => entry.amount_eur.amount.toString())).toEqual(["-400"]);
    expect(first?.declared.map((entry) => entry.amount_eur.amount.toString())).toEqual(["-300"]);
    expect(second?.declared.map((entry) => entry.amount_eur.amount.toString())).toEqual([
      "-300",
      "-150",
    ]);
  });

  /**
   * **A cause that cannot be sustained is not attributed in silence**
   * (ADR-0024, ADR-0025). The four causes of the comparison include "the
   * engine computes differently than it did then", and that one only holds if
   * everything else is equal — which can only be said of a **verified**
   * prefix. Omitting the causes is what the code already did; saying why is
   * what it did not.
   */
  it("warns as a note of the report when the prefix it read is not verified", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    const filing = b.filed({
      tax_year: 2027,
      filed_at: "2028-06-18",
      declared: { savings_base_eur: "200", pending_losses: [], deferred_losses_eur: "0" },
    });
    // The user accepted that this fingerprint could never be verified, so that
    // the ledger could be compacted at all.
    b.raw({
      ...b.nextEnvelope("filing_fingerprint_waived"),
      type: "filing_fingerprint_waived",
      filing_id: filing.id,
      reason: "digest",
      declared_schema_version: 1,
      declared_lines: 9,
    } as never);
    const report = taxYear(b.build(), 2027, { today: TODAY });
    expect(report.filing?.unverified_prefix).toBe("waived");
    expect(report.filing?.fingerprint_ok).toBe(false);
    expect(report.filing?.figures.every((figure) => figure.causes === undefined)).toBe(true);
    const note = report.notes.find((entry) => entry.code === "tax_filing_prefix_unverified");
    expect(note?.details.reason).toBe("waived");
    expect(note?.event_id).toBe(filing.id);
  });

  it("is an empty list, not a missing field, when nothing was filed", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    expect(taxYear(b.build(), 2027, { today: TODAY }).anchors).toEqual([]);
  });
});
