// The lot journal is the record of what the single FIFO engine did (feature
// 009). The tax engine walks it instead of choosing lots again, so it has to be
// **exactly** that record: replaying it must rebuild every lot's quantity, and
// the lots each gain says it disposed of must be the transmissions the journal
// shows right before it. If a function ever moves a lot without writing it
// down, this fails on the first random ledger that goes through it.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Quantity } from "../../src/money/quantity.js";
import { fiscalLots } from "../../src/projections/lots.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { taxLedgerOf, taxOpArb } from "./tax-ledgers.js";

describe("the lot journal", () => {
  it("is exercised: the generator reaches every kind of journal entry", () => {
    // A property that passes because the generator never reaches the case is a
    // property that tests nothing.
    const kinds = new Set<string>();
    const purposes = new Set<string>();
    for (const ops of fc.sample(fc.array(taxOpArb, { minLength: 20, maxLength: 40 }), {
      numRuns: 60,
      seed: 9,
    })) {
      for (const entry of projectLedger(taxLedgerOf(ops)).lotJournal) {
        kinds.add(entry.kind);
        if (entry.kind === "consume") {
          purposes.add(entry.purpose);
        }
      }
    }
    expect([...kinds].sort()).toEqual(["carve", "consume", "gain", "open", "scale"]);
    expect([...purposes].sort()).toEqual(["convert", "transfer", "transmission"]);
  });

  it("rebuilds every lot and every gain of the projection it was written by", () => {
    fc.assert(
      fc.property(fc.array(taxOpArb, { maxLength: 40 }), (ops) => {
        const state = projectLedger(taxLedgerOf(ops));
        expect(state.invalid).toEqual([]);
        const quantities = new Map<string, Quantity>();
        let pending: string[] = [];
        for (const entry of state.lotJournal) {
          switch (entry.kind) {
            case "open":
              expect(quantities.has(entry.lot_id)).toBe(false);
              quantities.set(entry.lot_id, entry.quantity);
              break;
            case "consume": {
              const before = quantities.get(entry.lot_id) as Quantity;
              expect(before.eq(entry.quantity_before)).toBe(true);
              quantities.set(entry.lot_id, before.sub(entry.quantity));
              if (entry.purpose === "transmission") {
                pending.push(`${entry.lot_id}:${entry.quantity}`);
              }
              break;
            }
            case "scale":
              quantities.set(entry.lot_id, entry.quantity_after);
              break;
            case "carve":
              expect(quantities.has(entry.into_lot_id)).toBe(true);
              break;
            case "gain": {
              const gain = state.gains[entry.gain_index];
              expect(gain?.by_lot.map((lot) => `${lot.lot_id}:${lot.quantity}`)).toEqual(pending);
              pending = [];
              break;
            }
          }
        }
        expect(pending).toEqual([]);
        const lots = fiscalLots(state);
        expect(quantities.size).toBe(lots.length);
        for (const lot of lots) {
          expect(quantities.get(lot.id)?.eq(lot.quantity)).toBe(true);
        }
        expect(
          state.lotJournal
            .filter((entry) => entry.kind === "gain")
            .map((entry) => entry.gain_index),
        ).toEqual(state.gains.map((_, index) => index));
      }),
      { numRuns: 200 },
    );
  });
});
