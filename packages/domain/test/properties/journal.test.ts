// The lot journal is the record of what the single FIFO engine did (feature
// 009). The tax engine walks it instead of choosing lots again, so it has to be
// **exactly** that record: replaying it must rebuild every lot's quantity, and
// the lots each gain says it disposed of must be the transmissions the journal
// shows right before it. If a function ever moves a lot without writing it
// down, this fails on the first random ledger that goes through it.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Money } from "../../src/money/money.js";
import type { Quantity } from "../../src/money/quantity.js";
import { fiscalLots } from "../../src/projections/lots.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { FiscalLot } from "../../src/projections/state.js";
import type { CorporateActionEvent, LedgerEvent } from "../../src/schema/events.js";
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

  it("is exercised by every operation that moves lots: swaps, grants, cash in lieu, several accounts", () => {
    const seen = new Set<string>();
    for (const ops of fc.sample(fc.array(taxOpArb, { minLength: 20, maxLength: 40 }), {
      numRuns: 60,
      seed: 9,
    })) {
      const events = taxLedgerOf(ops);
      const byId = new Map(events.map((event) => [event.id, event]));
      for (const entry of projectLedger(events).lotJournal) {
        if (entry.kind === "open" || entry.kind === "consume") {
          const event = byId.get(entry.event_id) as LedgerEvent;
          const what =
            event.type === "corporate_action"
              ? `${event.kind}:${event.effects.map((effect) => effect.op).join("+")}`
              : event.type;
          seen.add(`${entry.kind} ${what}`);
        }
      }
      for (const event of events) {
        if (event.type === "corporate_action") {
          for (const effect of event.effects) {
            if (effect.op === "forced_sale" && effect.per_account.length > 1) {
              seen.add("forced sale in several accounts");
            }
          }
        }
      }
    }
    expect([...seen]).toEqual(
      expect.arrayContaining([
        "open buy",
        "open transfer",
        "open swap",
        "consume swap",
        "consume sell",
        "open crypto_fork:grant",
        "consume reverse_split:scale+forced_sale",
        "consume issuer_restructuring:forced_sale",
        "open spin_off:carve_out",
        "open fund_merger:convert",
        "forced sale in several accounts",
      ]),
    );
  });

  it("rebuilds every lot and every gain of the projection it was written by", () => {
    fc.assert(
      fc.property(fc.array(taxOpArb, { maxLength: 40 }), (ops) => {
        const events = taxLedgerOf(ops);
        const byId = new Map(events.map((event) => [event.id, event]));
        const state = projectLedger(events);
        expect(state.invalid).toEqual([]);
        const lotOf = new Map(fiscalLots(state).map((lot) => [lot.id, lot]));
        const quantities = new Map<string, Quantity>();
        // Cost too, so that a carve that moved another share than it says is seen.
        const costs = new Map<string, Money>();
        const consumed = new Map<string, number>();
        let pending: string[] = [];
        for (const entry of state.lotJournal) {
          switch (entry.kind) {
            case "open": {
              expect(quantities.has(entry.lot_id)).toBe(false);
              const lot = lotOf.get(entry.lot_id) as FiscalLot;
              // The lot it names, of the asset, event and origin it says.
              expect([entry.asset_id, entry.event_id, entry.source_lot_id]).toEqual([
                lot.asset_id,
                lot.source_event_id,
                lot.source_lot_id,
              ]);
              expect(entry.quantity.eq(lot.original_quantity)).toBe(true);
              quantities.set(entry.lot_id, entry.quantity);
              costs.set(entry.lot_id, lot.original_cost_eur);
              break;
            }
            case "consume": {
              const before = quantities.get(entry.lot_id) as Quantity;
              expect(before.eq(entry.quantity_before)).toBe(true);
              quantities.set(entry.lot_id, before.sub(entry.quantity));
              // The same consumption the lot keeps, event and quantity, in order.
              const index = consumed.get(entry.lot_id) ?? 0;
              consumed.set(entry.lot_id, index + 1);
              const consumption = (lotOf.get(entry.lot_id) as FiscalLot).consumptions[index];
              expect(consumption?.event_id).toBe(entry.event_id);
              expect(consumption?.quantity.eq(entry.quantity)).toBe(true);
              costs.set(
                entry.lot_id,
                (costs.get(entry.lot_id) as Money).sub(consumption?.cost_eur as Money),
              );
              if (entry.purpose === "transmission") {
                pending.push(`${entry.lot_id}:${entry.quantity}`);
              }
              break;
            }
            case "scale": {
              // Written by a corporate action that scales the lot's own asset.
              const event = byId.get(entry.event_id) as CorporateActionEvent;
              expect(event.type).toBe("corporate_action");
              expect(event.asset_id).toBe((lotOf.get(entry.lot_id) as FiscalLot).asset_id);
              expect(event.effects.some((effect) => effect.op === "scale")).toBe(true);
              quantities.set(entry.lot_id, entry.quantity_after);
              break;
            }
            case "carve": {
              expect(quantities.has(entry.into_lot_id)).toBe(true);
              const into = lotOf.get(entry.into_lot_id) as FiscalLot;
              expect(into.source_lot_id).toBe(entry.lot_id);
              expect(into.source_event_id).toBe(entry.event_id);
              // Exactly the share it says of the origin's cost, and no more.
              const cost = costs.get(entry.lot_id) as Money;
              const carved = cost.mul(entry.cost_share);
              expect(carved.eq(into.original_cost_eur)).toBe(true);
              costs.set(entry.lot_id, cost.sub(carved));
              break;
            }
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
          expect(costs.get(lot.id)?.eq(lot.cost_eur)).toBe(true);
          expect(consumed.get(lot.id) ?? 0).toBe(lot.consumptions.length);
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
