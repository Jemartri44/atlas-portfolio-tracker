// Lots of foreign currency (spec 029, fiscal criterion #4). The currency held
// is an asset with a cost in euros, and its exchange difference is imputed when
// it is realized (art. 14.2.e LIRPF): on conversion to euros, on a payment made
// with it, or when an inflow covers currency spent without having it. One FIFO
// per currency **across all accounts**, in the order of pass B, like the lots of
// securities (criterion `4:currency_fifo`). A projection: nothing is stored.
//
// Every inflow and outflow mirrors one movement of `state.cash`, so the open
// lots of a currency always add up to its balance in all accounts, except for
// what the broker converted itself (`broker_settled_eur`, `autoConversion`),
// which never touches them.

import { type CivilDate, yearOf } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { EUR, Money } from "../money/money.js";
import type { AccountId } from "../schema/events.js";
import type { LedgerState } from "./state.js";

export interface CurrencyLot {
  /** `<source_event_id>$<n>`. */
  id: string;
  currency: string;
  account_id: AccountId;
  acquisition_date: CivilDate;
  source_event_id: Ulid;
  /**
   * Remaining amount and cost, exact. Both negative for currency **spent
   * without having it** (a negative balance): the cost is then the value in
   * euros of what was spent, and the next inflow covers it first.
   */
  amount: Money;
  cost_eur: Money;
  original_amount: Money;
  original_cost_eur: Money;
  closed: boolean;
}

export interface CurrencyLots {
  open: CurrencyLot[];
  closed: CurrencyLot[];
}

/**
 * What an exchange difference was imputed on: a conversion to euros, a payment
 * (a fee) made with the currency, an inflow that covers currency spent without
 * having it, a conversion the broker made itself, and the currency invested in
 * a lot computed leg by leg, imputed on its sale (`gains.ts`).
 */
export type CurrencyGainKind = "conversion" | "payment" | "cover" | "auto_conversion" | "invested";

export interface CurrencySlice {
  lot_id: string;
  amount: Money;
  cost_eur: Money;
}

export interface CurrencyGain {
  event_id: Ulid;
  kind: CurrencyGainKind;
  account_id: AccountId;
  currency: string;
  fiscal_date: CivilDate;
  year: number;
  /** Currency disposed of (or covered), positive. */
  amount: Money;
  proceeds_eur: Money;
  cost_eur: Money;
  gain_eur: Money;
  /** Rounded half-up to cents, once per operation (ADR-0005). */
  gain_eur_rounded: Money;
  by_lot: CurrencySlice[];
}

/** One movement of a foreign currency, as `state.cash` sees it. */
export interface CurrencyFlow {
  event_id: Ulid;
  account_id: AccountId;
  /** Positive, in the foreign currency. */
  amount: Money;
  date: CivilDate;
}

/** What currency leaving does: only a conversion and a payment impute a difference. */
export type CurrencyUse = "invest" | "conversion" | "payment" | "exchange" | "withdrawal";

/**
 * The currency lots, as the wash-sale rule reads them (`tax/currency-wash-sale.ts`):
 * a lot of currency held was opened, an inflow covered currency spent without
 * having it (an acquisition that opens no lot), or an outflow took from the
 * lots held. Negative lots are not in it.
 */
export type CurrencyJournalEntry =
  | {
      kind: "open";
      lot_id: string;
      currency: string;
      event_id: Ulid;
      date: CivilDate;
      amount: Money;
    }
  | {
      kind: "cover";
      currency: string;
      event_id: Ulid;
      date: CivilDate;
      amount: Money;
    }
  | {
      kind: "take";
      currency: string;
      event_id: Ulid;
      date: CivilDate;
      slices: CurrencySlice[];
      /** Index in `state.currencyGains` of the difference it imputed, if any. */
      gain_index?: number;
    };

const lotsOf = (state: LedgerState, currency: string): CurrencyLots => {
  let entry = state.currencyLots.get(currency);
  if (entry === undefined) {
    entry = { open: [], closed: [] };
    state.currencyLots.set(currency, entry);
  }
  return entry;
};

const open = (state: LedgerState, flow: CurrencyFlow, amount: Money, cost: Money): void => {
  const sequence = state.currencyLotCounts.get(flow.event_id) ?? 0;
  state.currencyLotCounts.set(flow.event_id, sequence + 1);
  const id = `${flow.event_id}$${sequence}`;
  if (!amount.isNegative()) {
    state.currencyJournal.push({
      kind: "open",
      lot_id: id,
      currency: amount.currency,
      event_id: flow.event_id,
      date: flow.date,
      amount,
    });
  }
  lotsOf(state, amount.currency).open.push({
    id,
    currency: amount.currency,
    account_id: flow.account_id,
    acquisition_date: flow.date,
    source_event_id: flow.event_id,
    amount,
    cost_eur: cost,
    original_amount: amount,
    original_cost_eur: cost,
    closed: false,
  });
};

/**
 * Takes up to `wanted` (positive) from the open lots of one sign, oldest
 * first. Returns the slices, in absolute amounts and costs, and what is left.
 */
const take = (
  state: LedgerState,
  currency: string,
  wanted: Money,
  shorts: boolean,
): { slices: CurrencySlice[]; left: Money } => {
  const entry = lotsOf(state, currency);
  const slices: CurrencySlice[] = [];
  let left = wanted;
  while (!left.isZero()) {
    const lot = entry.open[0];
    if (lot === undefined || lot.amount.isNegative() !== shorts) {
      break;
    }
    const held = shorts ? lot.amount.neg() : lot.amount;
    const whole = held.cmp(left) <= 0;
    const amount = whole ? held : left;
    const cost = whole ? lot.cost_eur : lot.cost_eur.mul(amount.amount).div(held.amount);
    const signed = shorts ? amount.neg() : amount;
    lot.amount = lot.amount.sub(signed);
    lot.cost_eur = lot.cost_eur.sub(cost);
    slices.push({ lot_id: lot.id, amount, cost_eur: shorts ? cost.neg() : cost });
    if (whole) {
      lot.closed = true;
      entry.open.shift();
      entry.closed.push(lot);
    }
    left = left.sub(amount);
  }
  return { slices, left };
};

const total = (slices: readonly CurrencySlice[]): Money =>
  slices.reduce((sum, slice) => sum.add(slice.cost_eur), Money.zero(EUR));

const record = (
  state: LedgerState,
  flow: CurrencyFlow,
  kind: CurrencyGainKind,
  amount: Money,
  proceedsEur: Money,
  costEur: Money,
  slices: CurrencySlice[],
): void => {
  const gain = proceedsEur.sub(costEur);
  state.currencyGains.push({
    event_id: flow.event_id,
    kind,
    account_id: flow.account_id,
    currency: amount.currency,
    fiscal_date: flow.date,
    year: yearOf(flow.date),
    amount,
    proceeds_eur: proceedsEur,
    cost_eur: costEur,
    gain_eur: gain,
    gain_eur_rounded: gain.roundToCents(),
    by_lot: slices,
  });
};

/**
 * Currency comes in at a cost in euros. It covers first what was spent without
 * having it: the value those units had when spent against what these cost is
 * an exchange difference, imputed today (`cover`).
 */
export const currencyIn = (state: LedgerState, flow: CurrencyFlow, costEur: Money): void => {
  if (flow.amount.currency === EUR || flow.amount.isZero()) {
    return;
  }
  const { slices, left } = take(state, flow.amount.currency, flow.amount, true);
  const covered = flow.amount.sub(left);
  if (!covered.isZero()) {
    const coveredCost = costEur.mul(covered.amount).div(flow.amount.amount);
    record(state, flow, "cover", covered, total(slices), coveredCost, slices);
    state.currencyJournal.push({
      kind: "cover",
      currency: covered.currency,
      event_id: flow.event_id,
      date: flow.date,
      amount: covered,
    });
  }
  if (!left.isZero()) {
    open(state, flow, left, costEur.mul(left.amount).div(flow.amount.amount));
  }
};

/**
 * Currency goes out; `valueEur` is what it is worth in euros on the day (what
 * a conversion received, a payment's value at the rate of its day). Returns
 * what it cost in euros. What the lots do not cover is spent without having it:
 * it opens a negative lot at its share of `valueEur`, so it imputes nothing
 * now. A conversion and a payment impute the difference between value and cost.
 */
export const currencyOut = (
  state: LedgerState,
  flow: CurrencyFlow,
  valueEur: Money,
  use: CurrencyUse,
): Money => {
  if (flow.amount.currency === EUR || flow.amount.isZero()) {
    return valueEur;
  }
  const { slices, left } = take(state, flow.amount.currency, flow.amount, false);
  const uncovered = valueEur.mul(left.amount).div(flow.amount.amount);
  if (!left.isZero()) {
    open(state, flow, left.neg(), uncovered.neg());
  }
  const cost = total(slices).add(uncovered);
  const spent = flow.amount.sub(left);
  const imputes = (use === "conversion" || use === "payment") && !spent.isZero();
  if (imputes) {
    const value = valueEur.sub(uncovered);
    record(state, flow, use, spent, value, total(slices), slices);
  }
  if (slices.length > 0) {
    state.currencyJournal.push({
      kind: "take",
      currency: flow.amount.currency,
      event_id: flow.event_id,
      date: flow.date,
      slices,
      ...(imputes ? { gain_index: state.currencyGains.length - 1 } : {}),
    });
  }
  return cost;
};

/**
 * A conversion the broker made itself (`broker_settled_eur`, ADR-0030): the
 * currency of the operation was never held, so the lots are not touched, and
 * the difference between what the currency was worth and what it cost is
 * imputed today. A sale or an income came in as currency costing `costEur` and
 * was credited as `proceedsEur` euros; a fee went out as currency worth
 * `proceedsEur` and was charged as `costEur` euros. Whether this is how a
 * converted operation is taxed stays open until a real IBKR statement is seen
 * (criterion `4:auto_conversion`).
 */
export const autoConversion = (
  state: LedgerState,
  flow: CurrencyFlow,
  proceedsEur: Money,
  costEur: Money,
): void => {
  record(state, flow, "auto_conversion", flow.amount, proceedsEur, costEur, []);
};

/**
 * The euros the broker settled for an operation in currency (ADR-0030), the
 * one read of the field a figure depends on: they fund a purchase the broker
 * converted, and value the conversion of a sale, an income or a fee.
 */
export const settledEurOf = (event: { broker_settled_eur?: string }): Money | undefined =>
  event.broker_settled_eur === undefined ? undefined : Money.parse(event.broker_settled_eur, EUR);

/** Every currency lot, open and closed. */
export const currencyLots = (state: LedgerState): CurrencyLot[] =>
  [...state.currencyLots.values()].flatMap((entry) => [...entry.open, ...entry.closed]);
