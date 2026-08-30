// Invariants of the five primitives over random ledgers (prompt §3.7, ADR-0011).

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import type { Money } from "../../src/money/money.js";
import { Quantity } from "../../src/money/quantity.js";
import { integrity } from "../../src/projections/integrity.js";
import { fiscalLots, openQuantity } from "../../src/projections/lots.js";
import { accountsHolding, positionOf } from "../../src/projections/positions.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerState } from "../../src/projections/state.js";
import type { Effect, LedgerEvent } from "../../src/schema/events.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { aggregate } from "./aggregate.js";
import { ASSETS, ledgerOf, type Op, opArb } from "./ledgers.js";

const LAST_DAY = "2027-12-31";
const NEW_ASSET = "ast_fund_x";
const RATIOS = [
  "2",
  "4",
  "5",
  "8",
  "10",
  "0.5",
  "0.25",
  "0.2",
  "0.125",
  "0.1",
  "1/3",
  "4/3",
  "1.7",
  "3",
];
const INVERSES: [string, string][] = [
  ["2", "1/2"],
  ["4", "0.25"],
  ["5", "1/5"],
  ["8", "0.125"],
  ["10", "0.1"],
  ["0.5", "2"],
  ["1/4", "4"],
  ["0.2", "5"],
  ["1/8", "8"],
  ["0.1", "10"],
];

interface Scenario {
  ops: Op[];
  pick: number;
  ratio: string;
  share: string;
  tenth: number;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  ops: fc.array(opArb, { minLength: 1, maxLength: 20 }),
  pick: fc.nat(),
  ratio: fc.constantFrom(...RATIOS),
  share: fc.constantFrom("0", "0.2", "0.5", "1"),
  tenth: fc.integer({ min: 1, max: 10 }),
});

/** A held asset of the base ledger, or undefined when nothing is open. */
const heldAsset = (state: LedgerState, pick: number): string | undefined => {
  const held = ASSETS.filter((asset) => openQuantity(state, asset).isPositive());
  return held[pick % Math.max(held.length, 1)];
};

const totalCost = (state: LedgerState, asset: string): Decimal =>
  fiscalLots(state, asset)
    .filter((lot) => !lot.closed)
    .reduce((sum, lot) => sum.add(lot.cost_eur.amount), Decimal.ZERO);

const openLotsOf = (state: LedgerState, asset: string): string[] =>
  fiscalLots(state, asset)
    .filter((lot) => !lot.closed)
    .map((lot) => `${lot.id}|${lot.quantity}|${lot.cost_eur.amount}`);

const positionsOf = (state: LedgerState): string[] =>
  [...state.positions].map(([key, quantity]) => `${key}=${quantity}`).sort();

/** Extends the base ledger with a destination asset and the given corporate actions. */
const extend = (base: LedgerEvent[], build: (b: LedgerBuilder) => void): LedgerEvent[] => {
  const b = new LedgerBuilder(1000);
  b.asset(NEW_ASSET);
  build(b);
  return [...base, ...b.build()];
};

const checkInvariants = (state: LedgerState): void => {
  for (const asset of [...ASSETS, NEW_ASSET]) {
    const physical = accountsHolding(state, asset).reduce(
      (total, account) => total.add(positionOf(state, account, asset)),
      Quantity.ZERO,
    );
    expect(openQuantity(state, asset).eq(physical)).toBe(true);
  }
  expect(integrity(state)).toEqual([]);
};

describe("corporate action invariants", () => {
  it("scale and convert keep the total cost per asset, and the state stays consistent", () => {
    fc.assert(
      fc.property(scenarioArb, fc.boolean(), ({ ops, pick, ratio }, convert) => {
        const { events } = ledgerOf(ops);
        const before = projectLedger(events);
        const asset = heldAsset(before, pick);
        if (asset === undefined) {
          return;
        }
        const effect: Effect = convert
          ? { op: "convert", to_asset_id: NEW_ASSET, ratio }
          : { op: "scale", ratio };
        const after = projectLedger(
          extend(events, (b) => {
            b.corporateAction({
              kind: convert ? "fund_merger" : "split",
              asset_id: asset,
              effects: [effect],
              effective_date: LAST_DAY,
            });
          }),
        );
        const costBefore = totalCost(before, asset);
        const costAfter = totalCost(after, asset).add(totalCost(after, NEW_ASSET));
        expect(costAfter.eq(costBefore)).toBe(true);
        expect(after.gains).toHaveLength(before.gains.length);
        checkInvariants(after);
      }),
      { numRuns: 120 },
    );
  });

  it("carve_out splits exactly 100 % of the cost between origin and destination", () => {
    fc.assert(
      fc.property(scenarioArb, ({ ops, pick, ratio, share }) => {
        const { events } = ledgerOf(ops);
        const before = projectLedger(events);
        const asset = heldAsset(before, pick);
        if (asset === undefined) {
          return;
        }
        const after = projectLedger(
          extend(events, (b) => {
            b.corporateAction({
              kind: "spin_off",
              asset_id: asset,
              effects: [{ op: "carve_out", to_asset_id: NEW_ASSET, ratio, cost_share: share }],
              effective_date: LAST_DAY,
            });
          }),
        );
        expect(
          totalCost(after, asset).add(totalCost(after, NEW_ASSET)).eq(totalCost(before, asset)),
        ).toBe(true);
        expect(
          totalCost(after, NEW_ASSET).eq(totalCost(before, asset).mul(Decimal.parse(share))),
        ).toBe(true);
        checkInvariants(after);
      }),
      { numRuns: 120 },
    );
  });

  it("forced_sale in one account produces the same state as the equivalent sell", () => {
    fc.assert(
      fc.property(scenarioArb, ({ ops, pick, tenth }) => {
        const { events } = ledgerOf(ops);
        const before = projectLedger(events);
        const asset = heldAsset(before, pick);
        if (asset === undefined) {
          return;
        }
        const holders = accountsHolding(before, asset);
        const account = holders[pick % holders.length] as string;
        const quantity = Quantity.of(
          positionOf(before, account, asset)
            .value.mul(Decimal.parse(String(tenth)))
            .div(Decimal.parse("10")),
        );
        const price = {
          unit_price: "123.45",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: LAST_DAY,
        };
        const withAction = projectLedger(
          extend(events, (b) => {
            b.corporateAction({
              kind: "issuer_restructuring",
              asset_id: asset,
              effects: [
                {
                  op: "forced_sale",
                  per_account: [{ account_id: account, quantity: quantity.toString(), fee: "1.5" }],
                  ...price,
                },
              ],
              effective_date: LAST_DAY,
            });
          }),
        );
        const withSell = projectLedger(
          extend(events, (b) => {
            b.sell({
              account_id: account,
              asset_id: asset,
              quantity: quantity.toString(),
              fee: "1.5",
              value_date: LAST_DAY,
              ...price,
            });
          }),
        );
        expect(aggregate(withAction)).toEqual(aggregate(withSell));
        expect(withAction.gains.at(-1)?.gain_eur.eq(withSell.gains.at(-1)?.gain_eur as Money)).toBe(
          true,
        );
        checkInvariants(withAction);
      }),
      { numRuns: 120 },
    );
  });

  it("scale(r) followed by scale(1/r) leaves lots and positions identical", () => {
    fc.assert(
      fc.property(scenarioArb, fc.constantFrom(...INVERSES), ({ ops, pick }, [ratio, inverse]) => {
        const { events } = ledgerOf(ops);
        const before = projectLedger(events);
        const asset = heldAsset(before, pick);
        if (asset === undefined) {
          return;
        }
        const after = projectLedger(
          extend(events, (b) => {
            b.corporateAction({
              kind: "split",
              asset_id: asset,
              effects: [{ op: "scale", ratio }],
              effective_date: LAST_DAY,
            });
            b.corporateAction({
              kind: "reverse_split",
              asset_id: asset,
              effects: [{ op: "scale", ratio: inverse }],
              effective_date: LAST_DAY,
            });
          }),
        );
        expect(openLotsOf(after, asset)).toEqual(openLotsOf(before, asset));
        expect(positionsOf(after)).toEqual(positionsOf(before));
        checkInvariants(after);
      }),
      { numRuns: 120 },
    );
  });

  it("grants add lots without cash and the projection is idempotent after any action", () => {
    fc.assert(
      fc.property(scenarioArb, ({ ops, pick, tenth }) => {
        const { events } = ledgerOf(ops);
        const before = projectLedger(events);
        const asset = heldAsset(before, pick) ?? "ast_world";
        const extended = extend(events, (b) => {
          b.corporateAction({
            kind: "crypto_fork",
            asset_id: asset,
            effects: [
              {
                op: "grant",
                asset_id: NEW_ASSET,
                per_account: [{ account_id: "acc_fund", quantity: String(tenth) }],
                unit_cost: "0",
                currency: "EUR",
                fx_rate: "1",
                fx_rate_date: LAST_DAY,
                acquisition_date: LAST_DAY,
              },
            ],
            effective_date: LAST_DAY,
          });
        });
        const after = projectLedger(extended);
        expect(aggregate(after).cash).toEqual(aggregate(before).cash);
        expect(positionOf(after, "acc_fund", NEW_ASSET).toString()).toBe(String(tenth));
        expect(aggregate(projectLedger(extended))).toEqual(aggregate(after));
        checkInvariants(after);
      }),
      { numRuns: 80 },
    );
  });
});
