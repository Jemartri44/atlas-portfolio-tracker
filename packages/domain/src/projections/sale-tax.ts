// The tax a sale would bring, estimated before it is placed (feature 028).
//
// The sale is added to a **copy of the ledger in memory** and the engine reads
// the year with and without it, so the FIFO across accounts, the compensation
// and the repurchase rule come out of the same code that will compute the real
// one. Nothing is written and the copy is thrown away. The estimated quota of
// both years (`savingsQuota`, criterion #27: the scale of the law of the year,
// or `savings_tax_brackets` when set) gives the tax of the sale as the
// difference of the two cuotas íntegras: marginal, because the scale is
// progressive. It is the same estimate the "what if I sell" query of the
// fiscal screen and the sales of the rebalance show.
//
// It is an estimate at today's informative price, labelled as such. It never
// feeds a tax output: the real sale, when it is recorded, is computed from the
// ledger like any other (constitution II).

import type { CivilDate } from "../dates/civil-date.js";
import { yearOf } from "../dates/civil-date.js";
import { asDomainError, type DomainError, ValidationError } from "../errors.js";
import { systemUlid } from "../ids/ulid.js";
import { Decimal, HUNDRED } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import { CURRENT_SCHEMA_VERSION } from "../schema/envelope.js";
import type { AccountId, AssetId, Book, LedgerEvent, SellEvent } from "../schema/events.js";
import { fingerprintOf } from "../schema/fingerprint.js";
import type { Settings, TaxBracket } from "../settings/defaults.js";
import { type SavingsQuota, savingsQuota } from "../tax/quota.js";
import type { TransmissionLine, TransmissionLot } from "../tax/report.js";
import { taxYear } from "../tax/year.js";
import { type FeeEstimate, feeEstimate, holdersOf } from "./platform-plan.js";
import { type ExternalPrices, type PriceLookup, positionValueOf, priceAt } from "./prices.js";
import type { LedgerState } from "./state.js";

/** What is sold: the quantity and what the market pays for it at the informative price. */
export interface HypotheticalSale {
  account_id: AccountId;
  asset_id: AssetId;
  quantity: Quantity;
  /** Currency the price is quoted in, with the ECB rate of the price (units per EUR). */
  currency: string;
  fx_rate: Decimal;
  fx_rate_date: CivilDate;
  /** Gross amount, in `currency`. */
  amount: string;
  /** Commission, in `currency`. */
  fee: string;
}

export interface SaleEstimate {
  /** Gain (negative: loss) of the sale itself, before any deferral. */
  gain_eur: Money;
  cost_eur: Money;
  /** The lots it consumes, oldest first. */
  lots: TransmissionLot[];
  /** Part of a loss the repurchase rule defers, as a positive amount, and where its window ends. */
  deferred_eur: Money;
  deferral_window_end?: CivilDate;
  /**
   * For a loss: the last day on which buying the asset back would still defer
   * what is left of it (criteria #2 and #14). Absent for a gain.
   */
  repurchase_until?: CivilDate;
  /** The savings base of the year with the sale, and what it added to it. */
  base_after_eur: Money;
  base_added_eur: Money;
  /** The estimated quota of the year without and with the sale. */
  quota_before: SavingsQuota;
  quota_after: SavingsQuota;
  /** `quota_after − quota_before`: negative when a loss saves tax. Always an estimate. */
  tax_eur: Money;
  /** The synthetic event, so that the next estimate can build on it. */
  event: LedgerEvent;
}

const sellOf = (date: CivilDate, sale: HypotheticalSale, sequence: number): SellEvent => {
  const draft: Omit<SellEvent, "fingerprint"> = {
    schema_version: CURRENT_SCHEMA_VERSION,
    id: systemUlid(new Date(`${date}T12:00:00.000Z`), sequence),
    recorded_at: `${date}T12:00:00.000Z`,
    type: "sell",
    account_id: sale.account_id,
    asset_id: sale.asset_id,
    trade_date: date,
    value_date: date,
    quantity: sale.quantity.toString(),
    amount: sale.amount,
    currency: sale.currency,
    fx_rate: sale.fx_rate.toString(),
    fx_rate_date: sale.fx_rate_date,
    fee: sale.fee,
    source: "manual",
  };
  // A sell is always fingerprinted.
  return { ...draft, fingerprint: fingerprintOf(draft) as string };
};

const lineOf = (events: readonly LedgerEvent[], year: number, date: CivilDate, id: string) => {
  const report = taxYear(events, year, { today: date });
  const line: TransmissionLine | undefined = [
    ...report.capital_gains.lines,
    ...report.movable_capital.transmissions,
  ].find((entry) => entry.event_id === id);
  return { report, line };
};

/**
 * Estimates `sale` on top of the ledger and of the hypothetical sales already
 * planned (`before`), which count as done: the estimate of the second sale of a
 * plan sees the gain of the first in the same year's base.
 */
export const estimateSale = (
  events: readonly LedgerEvent[],
  before: readonly LedgerEvent[],
  date: CivilDate,
  sale: HypotheticalSale,
  brackets: readonly TaxBracket[] | undefined,
): SaleEstimate => {
  const year = yearOf(date);
  const event = sellOf(date, sale, before.length + 1);
  const base = [...events, ...before];
  const without = taxYear(base, year, { today: date });
  // The engine refuses a ledger it cannot project (a sale larger than the
  // lots, say), so a report that reaches here always holds the line of the sale.
  const { report, line: found } = lineOf([...base, event], year, date, event.id);
  const own = found as TransmissionLine;
  const added = report.base_eur.sub(without.base_eur);
  const quotaBefore = savingsQuota(without, brackets);
  const quotaAfter = savingsQuota(report, brackets);
  // What the rule would still defer with a repurchase: what it looks at —the
  // own loss, never a gain, plus the losses the sale releases (#21)— minus what
  // is deferred already.
  const ownLoss = own.own_eur.isNegative() ? own.own_eur : Money.zero("EUR");
  const open = ownLoss.add(own.released_eur).sub(own.deferred_eur).isNegative();
  return {
    gain_eur: own.own_eur,
    cost_eur: own.cost_eur,
    lots: own.lots,
    // The engine keeps a deferred loss with the sign of the loss; here it is an amount.
    deferred_eur: own.deferred_eur.isNegative() ? own.deferred_eur.neg() : own.deferred_eur,
    ...(own.deferral === undefined ? {} : { deferral_window_end: own.deferral.window_end }),
    // A loss priced on `date` has its window open on `date`: the engine always marks it.
    ...(open ? { repurchase_until: own.provisional_until as CivilDate } : {}),
    base_after_eur: report.base_eur,
    base_added_eur: added,
    quota_before: quotaBefore,
    quota_after: quotaAfter,
    // The scales start at the first year the engine computes (`savings-scale.ts`), so both have a quota.
    tax_eur: (quotaAfter.quota_eur as Money).sub(quotaBefore.quota_eur as Money),
    event,
  };
};

/** An order the engine refused: its code, and the error itself with its details. */
export interface RefusedOrder {
  code: string;
  error: DomainError;
}

/** One order of a sale: an order is placed in one account, even though the FIFO is across all (ADR-0009). */
export interface SaleOrder {
  account_id: AccountId;
  quantity: Quantity;
  amount_eur: Money;
  /** Absent when the ledger has no equivalent sale: unknown, never zero. */
  fee?: FeeEstimate;
  fee_pct?: Decimal;
}

/**
 * Splits `quantity` of an asset across the accounts that hold it, largest
 * position first, and estimates each order on top of `hypothetical`, which
 * collects them so each one sees the ones before it. `total_eur`, when given,
 * is what the orders add up to exactly: the last one takes the rest, so the
 * rounding of each never makes the sum drift. An order the engine refuses
 * carries its code instead of an estimate.
 */
export const estimateOrders = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  input: {
    date: CivilDate;
    brackets: readonly TaxBracket[] | undefined;
    asset_id: AssetId;
    quantity: Quantity;
    price: PriceLookup;
    book: Book;
    total_eur?: Money;
  },
  hypothetical: LedgerEvent[],
): { orders: SaleOrder[]; estimates: (SaleEstimate | RefusedOrder)[] } => {
  const { date, asset_id: assetId, price } = input;
  // A held asset has a price in euros, so its rate to the euro is there.
  const rate = price.fx_rate as Decimal;
  const holders = holdersOf(state, assetId, input.book);
  let remaining = input.quantity;
  let amountLeft = input.total_eur;
  const orders: SaleOrder[] = [];
  const estimates: (SaleEstimate | RefusedOrder)[] = [];
  holders.forEach((holder, index) => {
    if (!remaining.isPositive()) {
      return;
    }
    const quantity = remaining.lt(holder.quantity) ? remaining : holder.quantity;
    const last = index === holders.length - 1 || !remaining.gt(holder.quantity);
    const value = (positionValueOf(price, quantity) as Money).roundToCents();
    const amount = last && amountLeft !== undefined ? amountLeft : value;
    const fee = feeEstimate(state, events, date, {
      side: "sell",
      account_id: holder.account_id,
      asset_id: assetId,
    });
    orders.push({
      account_id: holder.account_id,
      quantity,
      amount_eur: amount,
      ...(fee === undefined
        ? {}
        : { fee, fee_pct: fee.fee_eur.amount.div(amount.amount).mul(HUNDRED) }),
    });
    remaining = remaining.sub(quantity);
    amountLeft = amountLeft?.sub(amount);
    const sale: HypotheticalSale = {
      account_id: holder.account_id,
      asset_id: assetId,
      quantity,
      currency: price.currency,
      fx_rate: rate,
      fx_rate_date: date,
      amount: quantity.value.mul(price.unit_value).toString(),
      fee: (fee?.fee_eur.amount ?? Decimal.ZERO).mul(rate).toString(),
    };
    try {
      const estimate = estimateSale(events, hypothetical, date, sale, input.brackets);
      hypothetical.push(estimate.event);
      estimates.push(estimate);
    } catch (error) {
      // The engine only refuses with a domain error (an invalid ledger, a year it does not cover).
      const refused = asDomainError(error);
      estimates.push({ code: refused.code, error: refused });
    }
  });
  return { orders, estimates };
};

/** "What if I sell this?": the orders, the gain lot by lot and the tax, never written. */
export interface SaleSimulation {
  asset_id: AssetId;
  /** The informative price it is valued at, with its date and origin: always shown. */
  price: PriceLookup;
  quantity: Quantity;
  orders: SaleOrder[];
  gain_eur: Money;
  cost_eur: Money;
  lots: TransmissionLot[];
  deferred_eur: Money;
  deferral_window_end?: CivilDate;
  repurchase_until?: CivilDate;
  /** The year's estimated quota before the first order and after the last. */
  quota_before: SavingsQuota;
  quota_after: SavingsQuota;
  tax_eur: Money;
}

const refuse = (code: string, message: string, details: Record<string, unknown>): never => {
  throw new ValidationError(code, message, details);
};

/**
 * Sells `quantity` of an asset (all of it when absent) on `date` at its
 * informative price, across the accounts that hold it, on a copy of the ledger.
 * Either book: the bucket's sales are taxed like any other.
 */
export const simulateSale = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  query: {
    asset_id: AssetId;
    quantity?: Quantity;
    date: CivilDate;
    settings: Settings;
    external?: ExternalPrices;
  },
): SaleSimulation => {
  const { asset_id: assetId, date } = query;
  const book = state.assets.get(assetId)?.book ?? "core";
  const held = holdersOf(state, assetId, book).reduce(
    (sum, holder) => sum.add(holder.quantity),
    Quantity.ZERO,
  );
  if (!held.isPositive()) {
    refuse("sale_asset_not_held", "no active account holds the asset", { asset_id: assetId });
  }
  const quantity = query.quantity ?? held;
  if (!quantity.isPositive() || quantity.gt(held)) {
    refuse("sale_exceeds_holding", "the quantity is not positive or exceeds what is held", {
      asset_id: assetId,
      held: held.toString(),
    });
  }
  const price = priceAt(state, assetId, date, query.settings, query.external);
  if (price?.unit_value_eur === undefined || price.fx_rate === undefined) {
    refuse("sale_missing_price", "the asset has no price in euros on the date", {
      asset_id: assetId,
      date,
    });
  }
  const priced = price as PriceLookup;
  const hypothetical: LedgerEvent[] = [];
  const { orders, estimates } = estimateOrders(
    state,
    events,
    {
      date,
      brackets: query.settings.savings_tax_brackets,
      asset_id: assetId,
      quantity,
      price: priced,
      book,
    },
    hypothetical,
  );
  const failed = estimates.find((entry): entry is RefusedOrder => "code" in entry);
  if (failed !== undefined) {
    // The engine's own error, with its details: what to repair is in them.
    throw failed.error;
  }
  const done = estimates as SaleEstimate[];
  const summary = summariseEstimates(done);
  const until = done
    .map((estimate) => estimate.repurchase_until)
    .filter((end): end is CivilDate => end !== undefined)
    .sort()
    .pop();
  return {
    asset_id: assetId,
    price: priced,
    quantity,
    orders,
    ...summary,
    ...(until === undefined ? {} : { repurchase_until: until }),
    quota_before: (done[0] as SaleEstimate).quota_before,
    quota_after: (done.at(-1) as SaleEstimate).quota_after,
  };
};

const sumOf = (values: readonly Money[]): Money =>
  values.reduce((sum, value) => sum.add(value), Money.zero("EUR"));

/** Several estimates of one sale, added up: what the screen says of the sale as a whole. */
export const summariseEstimates = (estimates: readonly SaleEstimate[]) => {
  const windowEnd = estimates
    .map((estimate) => estimate.deferral_window_end)
    .filter((end): end is CivilDate => end !== undefined)
    .sort()
    .pop();
  return {
    tax_eur: sumOf(estimates.map((estimate) => estimate.tax_eur)),
    gain_eur: sumOf(estimates.map((estimate) => estimate.gain_eur)),
    cost_eur: sumOf(estimates.map((estimate) => estimate.cost_eur)),
    lots: estimates.flatMap((estimate) => estimate.lots),
    deferred_eur: sumOf(estimates.map((estimate) => estimate.deferred_eur)),
    ...(windowEnd === undefined ? {} : { deferral_window_end: windowEnd }),
  };
};
