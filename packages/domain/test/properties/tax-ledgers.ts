// Random valid ledgers for the lot journal and the tax engine (feature 009).
//
// Richer than `ledgers.ts` on purpose: the wash-sale rule lives in the gaps
// between dates (two months, one year), and a deferral travels through
// transfers, conversions, carve-outs and splits. So the dates advance by random
// gaps instead of one day at a time, and corporate actions are interleaved with
// the trades instead of appended at the end. Every event is valid: sells and
// transfers are capped to the running position, which is tracked through the
// corporate actions too.

import fc from "fast-check";
import { addDays, lastWorkingDay } from "../../src/dates/civil-date.js";
import { Decimal } from "../../src/money/decimal.js";
import { Quantity } from "../../src/money/quantity.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";

export const TAX_ACCOUNTS = ["acc_a", "acc_b"] as const;
/** Two transferable funds, a listed ETC and the destination of conversions and carve-outs. */
export const TAX_ASSETS = ["ast_fund1", "ast_fund2", "ast_etc", "ast_new"] as const;
type Account = (typeof TAX_ACCOUNTS)[number];
type Asset = (typeof TAX_ASSETS)[number];

export interface TaxOp {
  kind:
    | "buy"
    | "sell"
    | "transfer"
    | "custody"
    | "split"
    | "convert"
    | "carve"
    | "forced"
    | "valuation"
    | "dividend";
  account: Account;
  asset: Asset;
  quantity: string;
  price: string;
  gap: number;
}

export const taxOpArb: fc.Arbitrary<TaxOp> = fc.record({
  kind: fc.constantFrom(
    "buy",
    "buy",
    "buy",
    "sell",
    "sell",
    "transfer",
    "custody",
    "split",
    "convert",
    "carve",
    "forced",
    "valuation",
    "dividend",
  ),
  account: fc.constantFrom(...TAX_ACCOUNTS),
  asset: fc.constantFrom(...TAX_ASSETS),
  quantity: fc
    .integer({ min: 1, max: 40_000 })
    .map((n) => Decimal.parse(String(n)).div(Decimal.parse("1000")).toString()),
  price: fc
    .integer({ min: 100, max: 20_000 })
    .map((n) => Decimal.parse(String(n)).div(Decimal.parse("100")).toString()),
  gap: fc.integer({ min: 1, max: 75 }),
});

const TRANSFERABLE = new Set<Asset>(["ast_fund1", "ast_fund2", "ast_new"]);

/** The catalogue every generated ledger starts with, settings included. */
export const taxCatalogue = (b: LedgerBuilder): void => {
  b.settings(DEFAULT_SETTINGS);
  b.account("acc_a");
  b.account("acc_b", { platform: "ibkr", country: "IE" });
  b.asset("ast_fund1");
  b.asset("ast_fund2");
  b.asset("ast_new");
  b.asset("ast_etc", {
    asset_type: "etc",
    asset_class: "gold",
    transferable: false,
    market: "XETR",
  });
};

/** A valid ledger from the ops: positions are tracked so nothing is ever oversold. */
export const taxLedgerOf = (ops: readonly TaxOp[]): LedgerEvent[] => {
  const b = new LedgerBuilder();
  taxCatalogue(b);
  const held = new Map<string, Quantity>();
  const key = (account: string, asset: string): string => `${account}|${asset}`;
  const get = (account: string, asset: string): Quantity =>
    held.get(key(account, asset)) ?? Quantity.ZERO;
  const add = (account: string, asset: string, delta: Quantity): void => {
    held.set(key(account, asset), get(account, asset).add(delta));
  };
  const total = (asset: string): Quantity =>
    TAX_ACCOUNTS.reduce((sum, account) => sum.add(get(account, asset)), Quantity.ZERO);
  const neg = (quantity: Quantity): Quantity => Quantity.of(quantity.value.neg());
  let date = "2027-01-04";
  for (const op of ops) {
    date = addDays(date, op.gap);
    const requested = Quantity.parse(op.quantity);
    const available = get(op.account, op.asset);
    const capped = requested.gt(available) ? available : requested;
    switch (op.kind) {
      case "buy":
        b.buy({
          account_id: op.account,
          asset_id: op.asset,
          value_date: date,
          quantity: op.quantity,
          unit_price: op.price,
        });
        add(op.account, op.asset, requested);
        break;
      case "sell":
        if (capped.isPositive()) {
          b.sell({
            account_id: op.account,
            asset_id: op.asset,
            value_date: date,
            quantity: capped.toString(),
            unit_price: op.price,
          });
          add(op.account, op.asset, neg(capped));
        }
        break;
      case "transfer": {
        const to = op.asset === "ast_fund1" ? "ast_fund2" : "ast_fund1";
        if (capped.isPositive() && TRANSFERABLE.has(op.asset)) {
          b.transfer({
            from_account_id: op.account,
            from_asset_id: op.asset,
            quantity_out: capped.toString(),
            nav_out: op.price,
            value_date_out: date,
            to_account_id: op.account,
            to_asset_id: to,
            quantity_in: capped.toString(),
            nav_in: op.price,
            value_date_in: date,
          });
          add(op.account, op.asset, neg(capped));
          add(op.account, to, capped);
        }
        break;
      }
      case "custody": {
        const to = op.account === "acc_a" ? "acc_b" : "acc_a";
        if (capped.isPositive()) {
          b.transfer({
            from_account_id: op.account,
            from_asset_id: op.asset,
            quantity_out: capped.toString(),
            value_date_out: date,
            to_account_id: to,
            to_asset_id: op.asset,
            quantity_in: capped.toString(),
            value_date_in: date,
          });
          add(op.account, op.asset, neg(capped));
          add(to, op.asset, capped);
        }
        break;
      }
      case "split":
        if (total(op.asset).isPositive()) {
          b.corporateAction({
            kind: "split",
            asset_id: op.asset,
            effective_date: date,
            effects: [{ op: "scale", ratio: "2" }],
          });
          for (const account of TAX_ACCOUNTS) {
            add(account, op.asset, get(account, op.asset));
          }
        }
        break;
      case "convert":
        if (op.asset !== "ast_new" && TRANSFERABLE.has(op.asset) && total(op.asset).isPositive()) {
          b.corporateAction({
            kind: "fund_merger",
            asset_id: op.asset,
            effective_date: date,
            effects: [{ op: "convert", to_asset_id: "ast_new", ratio: "2" }],
          });
          for (const account of TAX_ACCOUNTS) {
            const quantity = get(account, op.asset);
            add(account, "ast_new", Quantity.of(quantity.value.mul(Decimal.parse("2"))));
            add(account, op.asset, neg(quantity));
          }
        }
        break;
      case "carve":
        if (op.asset !== "ast_new" && total(op.asset).isPositive()) {
          b.corporateAction({
            kind: "spin_off",
            asset_id: op.asset,
            effective_date: date,
            effects: [{ op: "carve_out", to_asset_id: "ast_new", ratio: "1", cost_share: "0.25" }],
          });
          for (const account of TAX_ACCOUNTS) {
            add(account, "ast_new", get(account, op.asset));
          }
        }
        break;
      case "forced":
        if (capped.isPositive()) {
          b.corporateAction({
            kind: "issuer_restructuring",
            asset_id: op.asset,
            effective_date: date,
            effects: [
              {
                op: "forced_sale",
                per_account: [{ account_id: op.account, quantity: capped.toString() }],
                unit_price: op.price,
                currency: "EUR",
                fx_rate: "1",
                fx_rate_date: lastWorkingDay(date),
              },
            ],
          });
          add(op.account, op.asset, neg(capped));
        }
        break;
      case "valuation":
        if (available.isPositive()) {
          b.valuation({
            account_id: op.account,
            asset_id: op.asset,
            date,
            quantity: available.toString(),
            unit_value: op.price,
          });
        }
        break;
      case "dividend":
        if (available.isPositive()) {
          b.dividend({
            account_id: op.account,
            asset_id: op.asset,
            value_date: date,
            fx_rate_date: lastWorkingDay(date),
            gross: op.price,
            withholding_origin: "0",
            withholding_spain: "0",
          });
        }
        break;
    }
  }
  return b.build();
};
