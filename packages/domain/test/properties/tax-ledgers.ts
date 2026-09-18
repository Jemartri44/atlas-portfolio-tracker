// Random valid ledgers for the lot journal and the tax engine (feature 009).
//
// Richer than `ledgers.ts` on purpose: the wash-sale rule lives in the gaps
// between dates (two months, one year), and a deferral travels through
// transfers, conversions, carve-outs and splits. So the dates advance by random
// gaps instead of one day at a time, and corporate actions are interleaved with
// the trades instead of appended at the end. Every event is valid: sells and
// transfers are capped to the running position, which is tracked through the
// corporate actions too.
//
// It also carries what a price could leak through (feature 009 review): a
// security in dollars at a rate that moves, valuations in both currencies,
// swaps with and without a fee, grants with a cost and without one, forced
// sales in several accounts and reverse splits with cash in lieu.

import fc from "fast-check";
import { addDays, lastWorkingDay } from "../../src/dates/civil-date.js";
import { Decimal } from "../../src/money/decimal.js";
import { Quantity } from "../../src/money/quantity.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";

export const TAX_ACCOUNTS = ["acc_a", "acc_b"] as const;
/**
 * Two transferable funds, a listed ETC, the destination of conversions and
 * carve-outs, a stock in dollars and two crypto assets to swap and to grant.
 */
export const TAX_ASSETS = [
  "ast_fund1",
  "ast_fund2",
  "ast_etc",
  "ast_new",
  "ast_usd",
  "ast_coin1",
  "ast_coin2",
] as const;
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
    | "dividend"
    | "swap"
    | "grant"
    | "rsplit";
  account: Account;
  asset: Asset;
  quantity: string;
  price: string;
  /** Dollars per euro, for what is in dollars. */
  rate: string;
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
    "valuation",
    "dividend",
    "swap",
    "grant",
    "rsplit",
  ),
  account: fc.constantFrom(...TAX_ACCOUNTS),
  asset: fc.constantFrom(...TAX_ASSETS),
  quantity: fc
    .integer({ min: 1, max: 40_000 })
    .map((n) => Decimal.parse(String(n)).div(Decimal.parse("1000")).toString()),
  price: fc
    .integer({ min: 100, max: 20_000 })
    .map((n) => Decimal.parse(String(n)).div(Decimal.parse("100")).toString()),
  rate: fc
    .integer({ min: 80, max: 160 })
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
  b.asset("ast_usd", {
    asset_type: "stock",
    currency: "USD",
    transferable: false,
    market: "XNAS",
  });
  b.asset("ast_coin1", { asset_type: "crypto", asset_class: "crypto", transferable: false });
  b.asset("ast_coin2", { asset_type: "crypto", asset_class: "crypto", transferable: false });
};

/** The currency of an operation on the asset: dollars at the op's rate, or nothing to say. */
const moneyOf = (op: TaxOp): { currency: string; fx_rate: string } =>
  op.asset === "ast_usd"
    ? { currency: "USD", fx_rate: op.rate }
    : { currency: "EUR", fx_rate: "1" };

const COINS = new Set<Asset>(["ast_coin1", "ast_coin2"]);
/** The corporate actions that transform lots, restricted to the assets they make sense for. */
const CARVABLE = new Set<Asset>(["ast_fund1", "ast_fund2", "ast_etc"]);

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
          ...moneyOf(op),
          fee: op.gap % 3 === 0 ? "0.5" : "0",
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
            ...moneyOf(op),
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
        if (CARVABLE.has(op.asset) && total(op.asset).isPositive()) {
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
      case "forced": {
        // Every account that holds the asset takes part: a forced sale in several
        // accounts is one transmission per account. An asset both accounts hold
        // goes first, so that the case is not rare.
        const asset =
          [op.asset, ...TAX_ASSETS].find((candidate) =>
            TAX_ACCOUNTS.every((account) => get(account, candidate).isPositive()),
          ) ?? op.asset;
        const entries = TAX_ACCOUNTS.map((account) => {
          const own = get(account, asset);
          return { account_id: account, quantity: requested.gt(own) ? own : requested };
        }).filter((entry) => entry.quantity.isPositive());
        if (entries.length > 0) {
          b.corporateAction({
            kind: "issuer_restructuring",
            asset_id: asset,
            effective_date: date,
            effects: [
              {
                op: "forced_sale",
                per_account: entries.map((entry) => ({
                  account_id: entry.account_id,
                  quantity: entry.quantity.toString(),
                })),
                unit_price: op.price,
                ...moneyOf({ ...op, asset }),
                fx_rate_date: lastWorkingDay(date),
              },
            ],
          });
          for (const entry of entries) {
            add(entry.account_id, asset, neg(entry.quantity));
          }
        }
        break;
      }
      case "valuation": {
        // The first position held, starting from the op's own: a valuation of
        // nothing would leave most ledgers without a single price.
        const held = [op.asset, ...TAX_ASSETS]
          .flatMap((asset) => [op.account, ...TAX_ACCOUNTS].map((account) => ({ account, asset })))
          .find((entry) => get(entry.account, entry.asset).isPositive());
        if (held !== undefined) {
          b.valuation({
            account_id: held.account,
            asset_id: held.asset,
            date,
            quantity: get(held.account, held.asset).toString(),
            unit_value: op.price,
            ...moneyOf({ ...op, asset: held.asset }),
          });
        }
        break;
      }
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
            ...moneyOf(op),
            per_unit: op.price,
          });
        }
        break;
      case "swap": {
        // Crypto for crypto (art. 37.1.h): valued at market, with a fee now and
        // then. Whichever coin an account holds, so that swaps are not rare.
        const from = [op.account, ...TAX_ACCOUNTS]
          .flatMap((account) => [...COINS].map((asset) => ({ account, asset })))
          .find((entry) => get(entry.account, entry.asset).isPositive());
        if (from !== undefined) {
          const own = get(from.account, from.asset);
          const out = requested.gt(own) ? own : requested;
          const to = from.asset === "ast_coin1" ? "ast_coin2" : "ast_coin1";
          const value = out.value.mul(Decimal.parse(op.price));
          const received = Quantity.of(out.value.mul(Decimal.parse("3")));
          b.swap({
            account_id: from.account,
            from_asset_id: from.asset,
            to_asset_id: to,
            value_date: date,
            quantity_out: out.toString(),
            market_value_out: value.toString(),
            quantity_in: received.toString(),
            market_value_in: value.toString(),
            fee: value.gt(Decimal.ONE) && op.gap % 2 === 1 ? "0.5" : "0",
          });
          add(from.account, from.asset, neg(out));
          add(from.account, to, received);
        }
        break;
      }
      case "grant": {
        // A fork of coin1 hands over coin2, one for one: with a cost (an
        // acquisition) or free with the income it declares on receipt.
        const entries = TAX_ACCOUNTS.map((account) => ({
          account_id: account,
          quantity: get(account, "ast_coin1"),
        })).filter((entry) => entry.quantity.isPositive());
        if (entries.length > 0) {
          const free = op.gap % 2 === 1;
          b.corporateAction({
            kind: "crypto_fork",
            asset_id: "ast_coin1",
            effective_date: date,
            effects: [
              {
                op: "grant",
                asset_id: "ast_coin2",
                per_account: entries.map((entry) => ({
                  account_id: entry.account_id,
                  quantity: entry.quantity.toString(),
                })),
                unit_cost: free ? "0" : op.price,
                currency: "EUR",
                fx_rate: "1",
                fx_rate_date: lastWorkingDay(date),
                acquisition_date: date,
                ...(free ? { income_eur: op.price, income_base: "general" as const } : {}),
              },
            ],
          });
          for (const entry of entries) {
            add(entry.account_id, "ast_coin2", entry.quantity);
          }
        }
        break;
      }
      case "rsplit":
        // 2:1 reverse split; the fraction left in each account is paid in cash.
        if (total(op.asset).isPositive()) {
          const half = Decimal.parse("0.5");
          const fractions = TAX_ACCOUNTS.map((account) => {
            const after = get(account, op.asset).value.mul(half);
            const whole = after.sub(half).round(0);
            return {
              account_id: account,
              after,
              fraction: after.sub(whole.isNegative() ? Decimal.ZERO : whole),
            };
          });
          const cash = fractions.filter((entry) => entry.fraction.isPositive());
          b.corporateAction({
            kind: "reverse_split",
            asset_id: op.asset,
            effective_date: date,
            effects: [
              { op: "scale", ratio: "0.5" },
              ...(cash.length === 0
                ? []
                : [
                    {
                      op: "forced_sale" as const,
                      per_account: cash.map((entry) => ({
                        account_id: entry.account_id,
                        quantity: entry.fraction.toString(),
                      })),
                      unit_price: op.price,
                      ...moneyOf(op),
                      fx_rate_date: lastWorkingDay(date),
                    },
                  ]),
            ],
          });
          for (const entry of fractions) {
            held.set(key(entry.account_id, op.asset), Quantity.of(entry.after.sub(entry.fraction)));
          }
        }
        break;
    }
  }
  return b.build();
};
