// The two invariants the wash-sale rule promised (feature 009, plan §7), on
// random ledgers with transfers, conversions, carve-outs, splits, reverse
// splits with cash in lieu, swaps and grants:
//
// - **conservation**: every euro deferred is, at the end, either released by a
//   later transmission or still pending on a lot or on a repurchase. Nothing
//   is lost and nothing is created on the way;
// - **each repurchased unit defers once** (#19): the units an acquisition lends
//   to deferrals never add up to more than it bought.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { CorporateActionEvent, LedgerEvent } from "../../src/schema/events.js";
import { walkWashSales } from "../../src/tax/wash-sale.js";
import { taxLedgerOf, taxOpArb } from "./tax-ledgers.js";

const total = (amounts: readonly { amount: Decimal }[]): Decimal =>
  amounts.reduce((sum, money) => sum.add(money.amount), Decimal.ZERO);

const walkOf = (events: readonly LedgerEvent[]) => {
  const state = projectLedger(events);
  const types = new Map(events.map((event) => [event.id, event.type]));
  return { state, walk: walkWashSales(state, "2040-01-01", types) };
};

describe("the wash-sale rule on random ledgers", () => {
  it("defers only what it later releases or still has pending, to the last decimal", () => {
    let deferring = 0;
    fc.assert(
      fc.property(fc.array(taxOpArb, { minLength: 10, maxLength: 45 }), (ops) => {
        const { walk } = walkOf(taxLedgerOf(ops));
        const deferred = total(walk.deferrals.map((d) => d.amount_eur));
        const released = total(
          walk.outcomes.flatMap((o) =>
            [...o.released, ...o.foreign_released].map((r) => r.amount_eur),
          ),
        );
        const pending = total(walk.pending.map((p) => p.amount_eur));
        // Shares are split pro rata with ten decimals: equal to the 10th decimal.
        expect(deferred.sub(released.add(pending)).abs().lt(Decimal.parse("0.0000000001"))).toBe(
          true,
        );
        for (const outcome of walk.outcomes) {
          // Negative or zero, and never more than the loss the rule looked at.
          expect(outcome.deferred_eur.amount.isPositive()).toBe(false);
          const floor = outcome.total_eur.amount.isNegative()
            ? outcome.total_eur.amount
            : Decimal.ZERO;
          expect(outcome.deferred_eur.amount.lt(floor)).toBe(false);
        }
        if (walk.deferrals.length > 0) {
          deferring += 1;
        }
      }),
      { numRuns: 300, seed: 42 },
    );
    // A property that never meets a deferral proves nothing.
    expect(deferring).toBeGreaterThan(30);
  });

  it("lends each repurchased unit to one deferral only", () => {
    fc.assert(
      fc.property(fc.array(taxOpArb, { minLength: 10, maxLength: 45 }), (ops) => {
        const events = taxLedgerOf(ops);
        const { state, walk } = walkOf(events);
        // What each acquisition bought, and how many times a split doubled it
        // afterwards: the most units it can ever hold (reverse splits only shrink).
        const bound = new Map<string, Decimal>();
        for (const [assetId, list] of state.acquisitions) {
          for (const acquisition of list) {
            const splits = events.filter(
              (event): event is CorporateActionEvent =>
                event.type === "corporate_action" &&
                event.asset_id === assetId &&
                event.effective_date >= acquisition.fiscal_date &&
                event.effects.some((effect) => effect.op === "scale" && effect.ratio === "2"),
            ).length;
            const key = `${acquisition.event_id}|${assetId}`;
            const most = acquisition.quantity.value.mul(Decimal.parse(String(2 ** splits)));
            bound.set(key, (bound.get(key) ?? Decimal.ZERO).add(most));
          }
        }
        const lent = new Map<string, Decimal>();
        for (const deferral of walk.deferrals) {
          expect(deferral.units.gt(deferral.sold)).toBe(false);
          for (const candidate of deferral.candidates) {
            const key = `${candidate.event_id}|${candidate.asset_id}`;
            lent.set(key, (lent.get(key) ?? Decimal.ZERO).add(candidate.units.value));
          }
        }
        // The used share of a lot is kept as a fraction rounded to ten decimals
        // (ADR-0005), and a lot shared by two losses reads it back multiplied by
        // what it holds: the units lent can pass what was bought by a few
        // billionths of it (a random ledger found 25.607 bought and
        // 25.6070000006 lent), which is millionths of a cent once shared out.
        // Never by anything a rounding to cents could see, and never by a unit.
        const relative = Decimal.parse("0.000000001");
        for (const [key, units] of lent) {
          const most = bound.get(key) as Decimal;
          expect(units.sub(most).gt(most.mul(relative))).toBe(false);
        }
      }),
      { numRuns: 300, seed: 7 },
    );
  });
});
