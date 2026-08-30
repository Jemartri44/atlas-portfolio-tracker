// Random valid ledgers for property tests: dates strictly increasing in file
// order, sells and transfers capped to the running position.

import fc from "fast-check";
import { Decimal } from "../../src/money/decimal.js";
import { Quantity } from "../../src/money/quantity.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

export const ACCOUNTS = ["acc_fund", "acc_etf"] as const;
export const ASSETS = ["ast_world", "ast_bonds"] as const;

export interface Op {
  kind: "buy" | "sell" | "transfer" | "custody";
  account: (typeof ACCOUNTS)[number];
  asset: (typeof ASSETS)[number];
  quantity: string;
  price: string;
  ratio: string;
}

export const opArb: fc.Arbitrary<Op> = fc.record({
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
export const ledgerOf = (ops: Op[]): { events: LedgerEvent[]; sells: number } => {
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

export const isCatalogue = (event: LedgerEvent): boolean =>
  event.type === "account_created" || event.type === "asset_created";
