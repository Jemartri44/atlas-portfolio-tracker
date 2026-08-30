// Invariants of the projection over random ledgers (constitution VII).

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { Quantity } from "../../src/money/quantity.js";
import { integrity } from "../../src/projections/integrity.js";
import { fiscalLots, openQuantity } from "../../src/projections/lots.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { aggregate } from "./aggregate.js";
import { ACCOUNTS, ASSETS, isCatalogue, ledgerOf, opArb } from "./ledgers.js";

describe("projection invariants", () => {
  it("open lots equal physical positions per asset and integrity is clean", () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 30 }), (ops) => {
        const { events } = ledgerOf(ops);
        const state = projectLedger(events);
        for (const asset of ASSETS) {
          const physical = ACCOUNTS.reduce(
            (total, account) =>
              total.add(state.positions.get(`${account}|${asset}`) ?? Quantity.ZERO),
            Quantity.ZERO,
          );
          expect(openQuantity(state, asset).eq(physical)).toBe(true);
        }
        expect(integrity(state)).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });

  it("projecting twice gives the same result", () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 30 }), (ops) => {
        const { events } = ledgerOf(ops);
        expect(aggregate(projectLedger(events))).toEqual(aggregate(projectLedger(events)));
      }),
      { numRuns: 100 },
    );
  });

  it("only sells produce gains, transfers never do, and every sell adds up lot by lot", () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 30 }), (ops) => {
        const { events, sells } = ledgerOf(ops);
        const state = projectLedger(events);
        expect(state.gains).toHaveLength(sells);
        for (const gain of state.gains) {
          const quantity = gain.by_lot.reduce(
            (total, lot) => total.add(lot.quantity),
            Quantity.ZERO,
          );
          expect(quantity.eq(gain.quantity)).toBe(true);
          const proceeds = gain.by_lot.reduce(
            (total, lot) => total.add(lot.proceeds_eur.amount),
            Decimal.ZERO,
          );
          expect(proceeds.eq(gain.proceeds_eur.amount)).toBe(true);
          expect(gain.gain_eur.eq(gain.proceeds_eur.sub(gain.cost_eur))).toBe(true);
        }
        for (const lot of fiscalLots(state)) {
          if (lot.source_lot_id !== undefined) {
            expect(lot.consumptions.every((c) => c.event_id !== lot.source_event_id)).toBe(true);
          }
        }
      }),
      { numRuns: 150 },
    );
  });

  it("does not depend on the order of registration when business dates are unique (Q1)", () => {
    // Fund transfers are excluded: their destination lots inherit the origin date, and two lots
    // with the same date are consumed by file position (data-schema.md §8.1), which is exactly
    // the order this property shuffles.
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 25 }), fc.infiniteStream(fc.nat()), (ops, seeds) => {
        const { events } = ledgerOf(ops.filter((op) => op.kind !== "transfer"));
        const head = events.filter(isCatalogue);
        const tail = events.filter((event) => !isCatalogue(event));
        const iterator = seeds[Symbol.iterator]();
        for (let i = tail.length - 1; i > 0; i -= 1) {
          const j = (iterator.next().value as number) % (i + 1);
          [tail[i], tail[j]] = [tail[j] as LedgerEvent, tail[i] as LedgerEvent];
        }
        expect(aggregate(projectLedger([...head, ...tail]))).toEqual(
          aggregate(projectLedger(events)),
        );
      }),
      { numRuns: 100 },
    );
  });
});
