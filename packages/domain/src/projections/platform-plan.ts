// What to do on each platform (feature 028): the purchases of a plan grouped by
// the account that holds the asset, with the cash that account already has and
// the commission the owner has actually been paying.
//
// Nothing here is configured and nothing is invented. The account of an asset is
// where its position is; the commission is read from the ledger (the last
// equivalent trade) and, when there is none, it is said to be unknown — never
// zero. It proposes and never writes: the orders are placed by hand.

import type { CivilDate } from "../dates/civil-date.js";
import { Decimal } from "../money/decimal.js";
import { EUR, Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type { AccountId, AssetId, BuyEvent, LedgerEvent, SellEvent } from "../schema/events.js";
import { feeEurOf } from "./costs.js";
import { businessDateOf, liveOperations } from "./project-ledger.js";
import { type Account, cashKey, type LedgerState } from "./state.js";

const HUNDRED = Decimal.parse("100");

export type TradeSide = "buy" | "sell";

/** A trade to be placed: how much, in euros, of which asset. */
export interface Order {
  asset_id: AssetId;
  amount_eur: Money;
}

/** What a trade is expected to cost, and where the figure comes from. */
export interface FeeEstimate {
  fee_eur: Money;
  /** The last trade of the same asset in the account, or of the same type of asset when there is none. */
  basis: "same_asset" | "same_asset_type";
  /** Business date of the trade the figure was read from. */
  as_of: CivilDate;
}

export interface PlatformLine extends Order {
  /** Absent when the ledger has no equivalent trade: unknown, never zero. */
  fee?: FeeEstimate;
  /** `fee / amount × 100`, not rounded; absent with no fee or no amount. */
  fee_pct?: Decimal;
}

export interface PlatformRow {
  account_id: AccountId;
  platform: string;
  lines: PlatformLine[];
  buy_eur: Money;
  /** Sum of the fees that are known. */
  fees_eur: Money;
  /** Lines whose fee is unknown, so `fees_eur` and `deposit_eur` may fall short. */
  unknown_fee_assets: AssetId[];
  /** Cash the account holds in euros; absent in an account kept in another currency. */
  cash_eur?: Money;
  /** The account is kept in another currency: the exchange is not calculated. */
  foreign_currency: boolean;
  /**
   * The ledger shows less than nothing in the account: deposits were not
   * recorded (ADR-0004). It is not asked to be refilled; only what is bought
   * is asked for.
   */
  cash_negative: boolean;
  /** `max(0, purchases + known fees − max(0, cash))`. */
  deposit_eur: Money;
  /** The line with the highest fee over its amount, when any fee is above zero. */
  costliest_asset_id?: AssetId;
}

/** An order whose asset sits in no account: the owner picks one. */
export interface UnassignedOrder extends Order {
  /** The active accounts of the core it could go to. */
  candidates: AccountId[];
}

export interface PlatformPlan {
  rows: PlatformRow[];
  unassigned: UnassignedOrder[];
}

type Trade = BuyEvent | SellEvent;

/** The active accounts of the core book, by id. */
const openAccounts = (state: LedgerState): AccountId[] =>
  [...state.accounts.values()]
    .filter((account) => account.book === "core" && account.active)
    .map((account) => account.account_id)
    .sort();

/** The active core accounts that hold the asset, largest position first and, on a tie, by id. */
export const holdersOf = (
  state: LedgerState,
  assetId: AssetId,
): { account_id: AccountId; quantity: Quantity }[] => {
  const open = new Set(openAccounts(state));
  const holders: { account_id: AccountId; quantity: Quantity }[] = [];
  for (const [key, quantity] of state.positions) {
    const [account, asset] = key.split("|") as [AccountId, AssetId];
    if (asset === assetId && open.has(account) && quantity.isPositive()) {
      holders.push({ account_id: account, quantity });
    }
  }
  return holders.sort(
    (a, b) => b.quantity.cmp(a.quantity) || a.account_id.localeCompare(b.account_id),
  );
};

/**
 * The account that holds the asset: the one with the largest position among the
 * active accounts of the core. Undefined when none holds it.
 */
export const accountHolding = (state: LedgerState, assetId: AssetId): AccountId | undefined =>
  holdersOf(state, assetId)[0]?.account_id;

/**
 * What the last equivalent trade cost: same side, same account and same asset;
 * failing that, the same type of asset. Undefined when the ledger has neither.
 */
export const feeEstimate = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  date: CivilDate,
  query: { side: TradeSide; account_id: AccountId; asset_id: AssetId },
): FeeEstimate | undefined => {
  const type = state.assets.get(query.asset_id)?.asset_type;
  const operations = liveOperations(state, events);
  let sameType: FeeEstimate | undefined;
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    const operation = operations[index] as (typeof operations)[number];
    if (operation.type !== query.side || operation.account_id !== query.account_id) {
      continue;
    }
    const trade = operation as Trade;
    const when = businessDateOf(state, trade);
    if (when > date) {
      continue;
    }
    if (trade.asset_id === query.asset_id) {
      return { fee_eur: feeEurOf(trade), basis: "same_asset", as_of: when };
    }
    if (sameType === undefined && state.assets.get(trade.asset_id)?.asset_type === type) {
      sameType = { fee_eur: feeEurOf(trade), basis: "same_asset_type", as_of: when };
    }
  }
  return sameType;
};

const lineOf = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  date: CivilDate,
  accountId: AccountId,
  order: Order,
): PlatformLine => {
  const fee = feeEstimate(state, events, date, {
    side: "buy",
    account_id: accountId,
    asset_id: order.asset_id,
  });
  // The caller skips orders of zero euros, so the amount here is positive.
  const pct =
    fee === undefined ? undefined : fee.fee_eur.amount.div(order.amount_eur.amount).mul(HUNDRED);
  return {
    ...order,
    ...(fee === undefined ? {} : { fee }),
    ...(pct === undefined ? {} : { fee_pct: pct }),
  };
};

const rowOf = (state: LedgerState, accountId: AccountId, lines: PlatformLine[]): PlatformRow => {
  // An account reaches here because it holds a position or was picked among the catalogue's.
  const account = state.accounts.get(accountId) as Account;
  const foreign = account.base_currency !== EUR;
  const buy = lines.reduce((sum, line) => sum.add(line.amount_eur), Money.zero(EUR));
  const fees = lines.reduce(
    (sum, line) => sum.add(line.fee?.fee_eur ?? Money.zero(EUR)),
    Money.zero(EUR),
  );
  const cash = foreign ? undefined : (state.cash.get(cashKey(accountId, EUR)) ?? Money.zero(EUR));
  const negative = cash?.isNegative() === true;
  const usable = cash === undefined || negative ? Money.zero(EUR) : cash;
  const need = buy.add(fees).sub(usable);
  const costliest = lines
    .filter((line) => line.fee_pct?.isPositive())
    .sort((a, b) => (b.fee_pct as Decimal).cmp(a.fee_pct as Decimal))[0];
  return {
    account_id: accountId,
    platform: account.platform,
    lines,
    buy_eur: buy,
    fees_eur: fees,
    unknown_fee_assets: lines.filter((line) => line.fee === undefined).map((line) => line.asset_id),
    ...(cash === undefined ? {} : { cash_eur: cash }),
    foreign_currency: foreign,
    cash_negative: negative,
    deposit_eur: need.isNegative() ? Money.zero(EUR) : need,
    ...(costliest === undefined ? {} : { costliest_asset_id: costliest.asset_id }),
  };
};

/**
 * Groups purchases by the account that holds each asset. `choose` carries the
 * account the owner picked for an asset that sits nowhere; a choice that is not
 * an active core account is ignored, so the order stays unassigned.
 */
export const platformPlan = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  date: CivilDate,
  orders: readonly Order[],
  choose: ReadonlyMap<AssetId, AccountId> = new Map(),
): PlatformPlan => {
  const open = openAccounts(state);
  const byAccount = new Map<AccountId, PlatformLine[]>();
  const unassigned: UnassignedOrder[] = [];
  for (const order of orders) {
    if (order.amount_eur.isZero()) {
      continue;
    }
    const picked = choose.get(order.asset_id);
    const account =
      accountHolding(state, order.asset_id) ??
      (picked !== undefined && open.includes(picked) ? picked : undefined);
    if (account === undefined) {
      unassigned.push({ ...order, candidates: open });
      continue;
    }
    const lines = byAccount.get(account) ?? [];
    lines.push(lineOf(state, events, date, account, order));
    byAccount.set(account, lines);
  }
  return {
    rows: [...byAccount.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([account, lines]) => rowOf(state, account, lines)),
    unassigned,
  };
};
