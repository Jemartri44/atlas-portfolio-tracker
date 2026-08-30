// Invariants of the projection over random ledgers (constitution VII).

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { Quantity } from "../../src/money/quantity.js";
import { integrity } from "../../src/projections/integrity.js";
import { fiscalLots, openQuantity } from "../../src/projections/lots.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerState } from "../../src/projections/state.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const ACCOUNTS = ["acc_fund", "acc_etf"] as const;
const ASSETS = ["ast_world", "ast_bonds"] as const;

interface Op {
  kind: "buy" | "sell" | "transfer" | "custody";
  account: (typeof ACCOUNTS)[number];
  asset: (typeof ASSETS)[number];
  quantity: string;
  price: string;
  ratio: string;
}

const opArb: fc.Arbitrary<Op> = fc.record({
  kind: fc.constantFrom("buy", "buy", "sell", "transfer", "custody"),
  account: fc.constantFrom(...ACCOUNTS),
  asset: fc.constantFrom(...ASSETS),
  quantity: fc
    .integer({ min: 1, max: 500_000 })
    .map((n) => Decimal.parse(String(n)).div(Decimal.parse("1000")).toString()),
  price: fc
    .integer({ min: 1, max: 30_000 })
    .map((n) => Decimal.parse(String(n)).div(Decimal.parse("100")).toString()),
  ratio: fc.constantFrom("0.5", "1", "1.25", "2"),
});

const dateAt = (index: number): string => {
  const date = new Date(Date.UTC(2027, 0, 1 + index));
  return date.toISOString().slice(0, 10);
};

/** Builds a valid ledger: dates strictly increasing in file order, sells and transfers capped to the position. */
const ledgerOf = (ops: Op[]): { events: LedgerEvent[]; sells: number } => {
  const b = new LedgerBuilder();
  catalogue(b);
  const held = new Map<string, Quantity>();
  const key = (account: string, asset: string): string => `${account}|${asset}`;
  const get = (account: string, asset: string): Quantity =>
    held.get(key(account, asset)) ?? Quantity.ZERO;
  const add = (account: string, asset: string, delta: Quantity): void => {
    held.set(key(account, asset), get(account, asset).add(delta));
  };
  let sells = 0;
  ops.forEach((op, index) => {
    const date = dateAt(index);
    const requested = Quantity.parse(op.quantity);
    if (op.kind === "buy") {
      b.buy({
        account_id: op.account,
        asset_id: op.asset,
        value_date: date,
        quantity: op.quantity,
        unit_price: op.price,
      });
      add(op.account, op.asset, requested);
      return;
    }
    const available = get(op.account, op.asset);
    if (available.isZero()) {
      return;
    }
    const quantity = requested.gt(available) ? available : requested;
    if (op.kind === "sell") {
      b.sell({
        account_id: op.account,
        asset_id: op.asset,
        value_date: date,
        quantity: quantity.toString(),
        unit_price: op.price,
      });
      add(op.account, op.asset, Quantity.of(quantity.value.neg()));
      sells += 1;
      return;
    }
    const toAsset =
      op.kind === "custody" ? op.asset : op.asset === "ast_world" ? "ast_bonds" : "ast_world";
    const toAccount =
      op.kind === "custody" ? (op.account === "acc_fund" ? "acc_etf" : "acc_fund") : op.account;
    const quantityIn =
      op.kind === "custody" ? quantity : Quantity.of(quantity.value.mul(Decimal.parse(op.ratio)));
    b.transfer({
      from_account_id: op.account,
      from_asset_id: op.asset,
      quantity_out: quantity.toString(),
      ...(op.kind === "custody" ? {} : { nav_out: op.price, nav_in: op.price }),
      value_date_out: date,
      to_account_id: toAccount,
      to_asset_id: toAsset,
      quantity_in: quantityIn.toString(),
      value_date_in: date,
    });
    add(op.account, op.asset, Quantity.of(quantity.value.neg()));
    add(toAccount, toAsset, quantityIn);
  });
  return { events: b.build(), sells };
};

const aggregate = (state: LedgerState): Record<string, unknown> => ({
  positions: [...state.positions].map(([k, q]) => [k, q.toString()]).sort(),
  cash: [...state.cash].map(([k, m]) => [k, m.amount.toString()]).sort(),
  gains: state.gains
    .map((g) => [
      g.event_id,
      g.proceeds_eur.amount.toString(),
      g.cost_eur.amount.toString(),
      g.gain_eur_rounded.amount.toString(),
    ])
    .sort(),
  lots: [...state.lots].map(([asset, lots]) => [
    asset,
    lots.open.reduce((total, lot) => total.add(lot.quantity), Quantity.ZERO).toString(),
    lots.open.reduce((total, lot) => total.add(lot.cost_eur.amount), Decimal.ZERO).toString(),
  ]),
});

const isCatalogue = (event: LedgerEvent): boolean =>
  event.type === "account_created" || event.type === "asset_created";

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
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 25 }), fc.infiniteStream(fc.nat()), (ops, seeds) => {
        const { events } = ledgerOf(ops);
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
