// Operations with effect on positions, cash or lots (data-model.md §2.3).
// Every handler validates first and mutates afterwards, so a rejected event
// leaves no trace when errors are collected instead of thrown.

import { type CivilDate, compareCivilDates } from "../dates/civil-date.js";
import { ProjectionError } from "../errors.js";
import { Decimal } from "../money/decimal.js";
import { FxRate } from "../money/fx-rate.js";
import { Money } from "../money/money.js";
import { Price } from "../money/price.js";
import { Quantity } from "../money/quantity.js";
import type {
  AssetId,
  BuyEvent,
  CashDepositEvent,
  CashWithdrawalEvent,
  DividendEvent,
  FxExchangeEvent,
  InterestEvent,
  SellEvent,
  StandaloneFeeEvent,
  SwapEvent,
  TransferEvent,
  ValuationEvent,
} from "../schema/events.js";
import { fiscalDateOf } from "../settings/fiscal-date.js";
import { washSaleTransferCounts } from "../settings/wash-sale.js";
import { adjustCash } from "./cash.js";
import { assertSameBook, requireAccount, requireAsset } from "./catalogue.js";
import { recordGain } from "./gains.js";
import { recordIncome } from "./income.js";
import { consume, openLot, openQuantity } from "./lots.js";
import { completeRequest, fillOrder, lookupOpenOrder, lookupOpenRequest } from "./pending.js";
import { accountsHolding, adjustPosition, positionOf } from "./positions.js";
import { type Account, type Asset, addWarning, type LedgerState, type Thesis } from "./state.js";
import { linkBuy, linkSell, requireOpenThesis } from "./theses.js";
import { noteAcquisition, warnPriorBuys, warnRepurchase } from "./wash-sale.js";

export interface Priced {
  id: string;
  currency: string;
  fx_rate: string;
  fx_rate_date: CivilDate;
}

export const fxOf = (event: Priced): FxRate =>
  FxRate.of(Decimal.parse(event.fx_rate), event.currency, event.fx_rate_date);

const money = (amount: string, currency: string): Money => Money.parse(amount, currency);

/** Cost or proceeds basis: `amount` when present, else `quantity × unit_price` (ADR-0012). */
const basisOf = (event: {
  id: string;
  type: string;
  amount?: string;
  quantity: string;
  unit_price?: string;
  currency: string;
}): Money => {
  if (event.amount !== undefined) {
    return money(event.amount, event.currency);
  }
  if (event.unit_price === undefined) {
    throw new ProjectionError(
      "missing_basis",
      event.id,
      `${event.type} carries neither amount nor unit_price`,
    );
  }
  return Price.parse(event.unit_price, event.currency).times(Quantity.parse(event.quantity));
};

export const negative = (quantity: Quantity): Quantity => Quantity.of(quantity.value.neg());

export const warnCurrency = (state: LedgerState, event: Priced, asset: Asset): void => {
  if (asset.currency !== event.currency) {
    addWarning(
      state,
      "currency_mismatch",
      event.id,
      `the event is in ${event.currency} but asset ${asset.asset_id} is in ${asset.currency}`,
      { asset_id: asset.asset_id, asset_currency: asset.currency, currency: event.currency },
    );
  }
};

export const warnFxDate = (state: LedgerState, event: Priced, fiscalDate: CivilDate): void => {
  if (compareCivilDates(event.fx_rate_date, fiscalDate) > 0) {
    addWarning(
      state,
      "fx_rate_date_after_fiscal_date",
      event.id,
      `fx_rate_date ${event.fx_rate_date} is later than the fiscal date ${fiscalDate}`,
      { fx_rate_date: event.fx_rate_date, fiscal_date: fiscalDate },
    );
  }
};

export const warnHolders = (state: LedgerState, assetId: AssetId, eventId: string): void => {
  const holders = accountsHolding(state, assetId);
  if (holders.length > 1) {
    addWarning(
      state,
      "same_asset_two_accounts",
      eventId,
      `asset ${assetId} is now held in ${holders.length} accounts; FIFO stays global`,
      { asset_id: assetId, accounts: holders },
    );
  }
};

export const requireAvailable = (
  state: LedgerState,
  accountId: string,
  assetId: AssetId,
  quantity: Quantity,
  eventId: string,
): void => {
  const available = positionOf(state, accountId, assetId);
  if (quantity.gt(available)) {
    throw new ProjectionError(
      "insufficient_position",
      eventId,
      `account ${accountId} holds ${available.toString()} of ${assetId}, less than ${quantity.toString()}`,
      { account_id: accountId, asset_id: assetId, available: available.toString() },
    );
  }
  if (quantity.gt(openQuantity(state, assetId))) {
    throw new ProjectionError(
      "insufficient_lots",
      eventId,
      `open lots of ${assetId} do not cover ${quantity.toString()}`,
      { asset_id: assetId, open: openQuantity(state, assetId).toString() },
    );
  }
};

/** File position that decides "before in the file" for theses: a correction inherits the position of the event it corrects (spec A6). */
const logicalPositionOf = (
  state: LedgerState,
  event: { corrects_id?: string },
  position: number,
): number =>
  event.corrects_id === undefined ? position : (state.positionOf.get(event.corrects_id) as number);

/** The thesis a bucket operation links to; `undefined` outside the bucket or for an unlinked sell. */
const thesisOf = (
  state: LedgerState,
  event: BuyEvent | SellEvent,
  account: Account,
  position: number,
): Thesis | undefined => {
  if (account.book !== "bucket") {
    if (event.thesis_id !== undefined) {
      throw new ProjectionError(
        "thesis_not_allowed",
        event.id,
        `thesis_id only applies to the bucket; ${event.account_id} is a core account`,
        { account_id: event.account_id, thesis_id: event.thesis_id },
      );
    }
    return undefined;
  }
  if (event.thesis_id === undefined) {
    if (event.type === "buy") {
      throw new ProjectionError(
        "thesis_required",
        event.id,
        "a buy in the bucket needs the thesis_id of an open thesis recorded earlier (rule 15)",
        { account_id: event.account_id, asset_id: event.asset_id },
      );
    }
    addWarning(
      state,
      "sell_without_thesis",
      event.id,
      `the sale of ${event.asset_id} in ${event.account_id} is not linked to a thesis`,
      { account_id: event.account_id, asset_id: event.asset_id },
    );
    return undefined;
  }
  return requireOpenThesis(
    state,
    event.thesis_id,
    event.account_id,
    event.asset_id,
    logicalPositionOf(state, event, position),
    event.id,
  );
};

/**
 * The thesis a swap links to. Rule 15 says a purchase in the bucket needs a
 * thesis opened first, and the leg **in** of a swap is a purchase: it is the
 * position that opens and the one that will have to be defended. The leg out is
 * handled like a sale — a warning if it closes a position with no thesis behind
 * it — without asking for a second id, which would be one more field to fill in
 * for no decision.
 */
const swapThesisOf = (
  state: LedgerState,
  event: SwapEvent,
  account: Account,
  position: number,
): Thesis | undefined => {
  if (account.book !== "bucket") {
    if (event.thesis_id !== undefined) {
      throw new ProjectionError(
        "thesis_not_allowed",
        event.id,
        `thesis_id only applies to the bucket; ${event.account_id} is a core account`,
        { account_id: event.account_id, thesis_id: event.thesis_id },
      );
    }
    return undefined;
  }
  if (event.thesis_id === undefined) {
    throw new ProjectionError(
      "thesis_required",
      event.id,
      "a swap in the bucket needs the thesis_id of an open thesis recorded earlier (rule 15)",
      { account_id: event.account_id, asset_id: event.to_asset_id },
    );
  }
  return requireOpenThesis(
    state,
    event.thesis_id,
    event.account_id,
    event.to_asset_id,
    logicalPositionOf(state, event, position),
    event.id,
  );
};

export const applyBuy = (state: LedgerState, event: BuyEvent, position: number): void => {
  const account = requireAccount(state, event.account_id, event.id);
  const asset = requireAsset(state, event.asset_id, event.id);
  assertSameBook(account, asset, event.id);
  const thesis = thesisOf(state, event, account, position);
  const order =
    event.order_id === undefined ? undefined : lookupOpenOrder(state, event.order_id, event, "buy");
  const fiscalDate = fiscalDateOf(event, asset.asset_type, state.fiscalSettings);
  const quantity = Quantity.parse(event.quantity);
  const total = basisOf(event).add(money(event.fee, event.currency));
  const costEur = fxOf(event).toEur(total);

  if (order !== undefined) {
    fillOrder(order, event.id, fiscalDate);
  }
  adjustCash(state, event.account_id, total.neg());
  adjustPosition(state, event.account_id, event.asset_id, quantity, event.id);
  openLot(state, {
    asset_id: event.asset_id,
    acquisition_date: fiscalDate,
    quantity,
    cost_eur: costEur,
    source_event_id: event.id,
    position,
  });
  if (thesis !== undefined) {
    linkBuy(
      state,
      thesis,
      event.id,
      fiscalDate,
      quantity,
      costEur,
      fxOf(event).toEur(money(event.fee, event.currency)),
    );
  }
  noteAcquisition(state, {
    event_id: event.id,
    asset_id: event.asset_id,
    fiscal_date: fiscalDate,
    quantity,
  });
  warnRepurchase(state, event.id, event.asset_id, asset.asset_type, fiscalDate, quantity);
  warnCurrency(state, event, asset);
  warnFxDate(state, event, fiscalDate);
  warnHolders(state, event.asset_id, event.id);
};

export const applySell = (state: LedgerState, event: SellEvent, position: number): void => {
  const account = requireAccount(state, event.account_id, event.id);
  const asset = requireAsset(state, event.asset_id, event.id);
  assertSameBook(account, asset, event.id);
  const thesis = thesisOf(state, event, account, position);
  const order =
    event.order_id === undefined
      ? undefined
      : lookupOpenOrder(state, event.order_id, event, "sell");
  const fiscalDate = fiscalDateOf(event, asset.asset_type, state.fiscalSettings);
  const quantity = Quantity.parse(event.quantity);
  requireAvailable(state, event.account_id, event.asset_id, quantity, event.id);
  const proceeds = basisOf(event).sub(money(event.fee, event.currency));
  const proceedsEur = fxOf(event).toEur(proceeds);
  const withholding =
    event.withholding === undefined
      ? Money.zero(event.currency)
      : money(event.withholding, event.currency);

  if (order !== undefined) {
    fillOrder(order, event.id, fiscalDate);
  }
  adjustCash(state, event.account_id, proceeds.sub(withholding));
  adjustPosition(state, event.account_id, event.asset_id, negative(quantity), event.id);
  const slices = consume(state, event.asset_id, quantity, event.id, "transmission");
  const gain = recordGain(state, {
    event_id: event.id,
    asset_id: event.asset_id,
    account_id: event.account_id,
    fiscal_date: fiscalDate,
    quantity,
    proceeds_eur: proceedsEur,
    slices,
  });
  if (thesis !== undefined) {
    linkSell(
      thesis,
      event.id,
      fiscalDate,
      quantity,
      proceedsEur,
      gain.gain_eur,
      fxOf(event).toEur(money(event.fee, event.currency)),
    );
  }
  if (gain.gain_eur.amount.isNegative()) {
    warnPriorBuys(state, event.id, event.asset_id, asset.asset_type, fiscalDate, gain.gain_eur);
  }
  warnCurrency(state, event, asset);
  warnFxDate(state, event, fiscalDate);
};

/**
 * Valuation of a swap under article 37.1.h LIRPF: **the greater** of the market
 * value of what is handed over and of what is received.
 *
 * Exported and tested on its own because it is the whole fiscal content of the
 * event: a rule of three lines that decides a taxable figure, and the kind of
 * thing that gets "simplified" into "use what was received" by somebody in five
 * years. It is symmetric by construction — swapping the two arguments cannot
 * change the answer — and that is a property the tests assert.
 */
export const swapValuation = (event: SwapEvent): Money => {
  const out = money(event.market_value_out, event.currency);
  const received = money(event.market_value_in, event.currency);
  return out.amount.gt(received.amount) ? out : received;
};

/**
 * A swap: one disposal and one acquisition, in the same fact.
 *
 * The leg out has to be **indistinguishable from a `sell`** — it consumes lots
 * by global FIFO and books a gain — and the leg in from a `buy`, except that
 * the lot it opens is born on the day of the swap with the value of article
 * 37.1.h. It inherits **no antiquity and no cost**: a swap is neither a
 * transfer nor an exchange covered by the neutrality regime, and modelling it
 * as one would omit the whole gain (`docs/fiscal-questions.md` #7).
 *
 * The wash-sale rule is wired in **all four directions**, which is the gap the
 * PR #40 had to fix for transfers and that is not repeated here: what is
 * received is an acquisition (so it is warned about after an earlier loss, and
 * it is remembered for a later loss), and what is handed over is a disposal (so
 * a loss is warned about against earlier purchases, and it is remembered for a
 * later repurchase).
 */
export const applySwap = (state: LedgerState, event: SwapEvent, position: number): void => {
  const account = requireAccount(state, event.account_id, event.id);
  const from = requireAsset(state, event.from_asset_id, event.id);
  const to = requireAsset(state, event.to_asset_id, event.id);
  assertSameBook(account, from, event.id);
  assertSameBook(account, to, event.id);
  const thesis = swapThesisOf(state, event, account, position);
  const dateOut = fiscalDateOf(event, from.asset_type, state.fiscalSettings);
  const dateIn = fiscalDateOf(event, to.asset_type, state.fiscalSettings);
  const quantityOut = Quantity.parse(event.quantity_out);
  const quantityIn = Quantity.parse(event.quantity_in);
  requireAvailable(state, event.account_id, event.from_asset_id, quantityOut, event.id);
  const fee = money(event.fee, event.currency);
  const value = swapValuation(event);
  const fx = fxOf(event);
  // The fee is inherent to the disposal and subtracts from it, as in a `sell`;
  // it does **not** also add to the cost of what is received, because the same
  // fee counted on both legs would be counted twice. It is a new fiscal
  // criterion and its direction of risk is written down in the feature's
  // `questions.md`; verify with an adviser.
  const proceedsEur = fx.toEur(value.sub(fee));
  const costEur = fx.toEur(value);

  adjustCash(state, event.account_id, fee.neg());
  adjustPosition(state, event.account_id, event.from_asset_id, negative(quantityOut), event.id);
  adjustPosition(state, event.account_id, event.to_asset_id, quantityIn, event.id);
  const slices = consume(state, event.from_asset_id, quantityOut, event.id, "transmission");
  const gain = recordGain(state, {
    event_id: event.id,
    asset_id: event.from_asset_id,
    account_id: event.account_id,
    fiscal_date: dateOut,
    quantity: quantityOut,
    proceeds_eur: proceedsEur,
    slices,
  });
  openLot(state, {
    asset_id: event.to_asset_id,
    acquisition_date: dateIn,
    quantity: quantityIn,
    cost_eur: costEur,
    source_event_id: event.id,
    position,
  });
  if (thesis !== undefined) {
    linkBuy(state, thesis, event.id, dateIn, quantityIn, costEur, Money.zero("EUR"));
  }
  noteAcquisition(state, {
    event_id: event.id,
    asset_id: event.to_asset_id,
    fiscal_date: dateIn,
    quantity: quantityIn,
  });
  warnRepurchase(state, event.id, event.to_asset_id, to.asset_type, dateIn, quantityIn);
  if (gain.gain_eur.amount.isNegative()) {
    warnPriorBuys(state, event.id, event.from_asset_id, from.asset_type, dateOut, gain.gain_eur);
  }
  if (dateOut !== dateIn) {
    addWarning(
      state,
      "swap_fiscal_dates_differ",
      event.id,
      `the leg out of ${event.from_asset_id} is fiscally dated ${dateOut} and the leg in of ${event.to_asset_id} ${dateIn}`,
      {
        from_asset_id: event.from_asset_id,
        to_asset_id: event.to_asset_id,
        fiscal_date_out: dateOut,
        fiscal_date_in: dateIn,
      },
    );
  }
  warnCurrency(state, event, from);
  warnFxDate(state, event, dateOut);
  warnHolders(state, event.to_asset_id, event.id);
};

export const applyTransfer = (state: LedgerState, event: TransferEvent): void => {
  const fromAccount = requireAccount(state, event.from_account_id, event.id);
  const fromAsset = requireAsset(state, event.from_asset_id, event.id);
  const toAccount = requireAccount(state, event.to_account_id, event.id);
  const toAsset = requireAsset(state, event.to_asset_id, event.id);
  assertSameBook(fromAccount, fromAsset, event.id);
  assertSameBook(toAccount, toAsset, event.id);
  if (fromAsset.book !== toAsset.book) {
    throw new ProjectionError("book_mismatch", event.id, "a transfer cannot cross books", {
      from_asset_id: event.from_asset_id,
      to_asset_id: event.to_asset_id,
    });
  }
  const custody = event.from_asset_id === event.to_asset_id;
  const quantityOut = Quantity.parse(event.quantity_out);
  const quantityIn = Quantity.parse(event.quantity_in);
  const request =
    event.request_id === undefined ? undefined : lookupOpenRequest(state, event.request_id, event);
  if (!custody && !(fromAsset.transferable && toAsset.transferable)) {
    throw new ProjectionError(
      "not_transferable",
      event.id,
      "fund transfers require both assets to be transferable",
      { from_asset_id: event.from_asset_id, to_asset_id: event.to_asset_id },
    );
  }
  requireAvailable(state, event.from_account_id, event.from_asset_id, quantityOut, event.id);

  if (request !== undefined) {
    completeRequest(request, event.id, event.value_date_in);
  }
  adjustPosition(
    state,
    event.from_account_id,
    event.from_asset_id,
    negative(quantityOut),
    event.id,
  );
  adjustPosition(state, event.to_account_id, event.to_asset_id, quantityIn, event.id);
  if (custody) {
    warnHolders(state, event.to_asset_id, event.id);
    return;
  }
  const slices = consume(state, event.from_asset_id, quantityOut, event.id, "transfer");
  let assigned = Quantity.ZERO;
  slices.forEach((slice, index) => {
    const quantity =
      index === slices.length - 1
        ? quantityIn.sub(assigned)
        : Quantity.of(quantityIn.value.mul(slice.quantity.value).div(quantityOut.value));
    assigned = assigned.add(quantity);
    openLot(state, {
      asset_id: event.to_asset_id,
      acquisition_date: slice.acquisition_date,
      quantity,
      cost_eur: slice.cost_eur,
      source_event_id: event.id,
      // FIFO tie-break on equal dates keeps the position of the origin event of the consumed lot (data-schema.md §8.1).
      position: slice.position,
      source_lot_id: slice.lot_id,
    });
  });
  // The destination leg acquires homogeneous securities, so it counts for the
  // wash-sale rule unless the criterion is switched off (business-rules.md
  // §5.4, data-schema.md §8.4, fiscal question #2b). It counts on the date the
  // units are subscribed (`value_date_in`, the fiscal date of a fund), which is
  // **not** the acquisition date of the lots: those keep the original one
  // (data-schema.md §8.1), and mixing the two would break the antiquity.
  // A custody transfer returned above: moving the same asset between accounts
  // acquires nothing.
  if (washSaleTransferCounts(state.fiscalSettings)) {
    noteAcquisition(state, {
      event_id: event.id,
      asset_id: event.to_asset_id,
      fiscal_date: event.value_date_in,
      quantity: quantityIn,
    });
    warnRepurchase(
      state,
      event.id,
      event.to_asset_id,
      toAsset.asset_type,
      event.value_date_in,
      quantityIn,
    );
  }
};

export const applyDividend = (state: LedgerState, event: DividendEvent): void => {
  const account = requireAccount(state, event.account_id, event.id);
  const asset = requireAsset(state, event.asset_id, event.id);
  assertSameBook(account, asset, event.id);
  const net = recordIncome(state, {
    event_id: event.id,
    kind: "dividend",
    account_id: event.account_id,
    asset_id: event.asset_id,
    value_date: event.value_date,
    gross: money(event.gross, event.currency),
    withholding_origin: money(event.withholding_origin, event.currency),
    withholding_spain: money(event.withholding_spain, event.currency),
    fx: fxOf(event),
  });
  adjustCash(state, event.account_id, net);
};

export const applyInterest = (state: LedgerState, event: InterestEvent): void => {
  requireAccount(state, event.account_id, event.id);
  const net = recordIncome(state, {
    event_id: event.id,
    kind: "interest",
    account_id: event.account_id,
    value_date: event.value_date,
    gross: money(event.gross, event.currency),
    withholding_origin: Money.zero(event.currency),
    withholding_spain: money(event.withholding_spain, event.currency),
    fx: fxOf(event),
  });
  adjustCash(state, event.account_id, net);
};

export const applyFxExchange = (state: LedgerState, event: FxExchangeEvent): void => {
  requireAccount(state, event.account_id, event.id);
  adjustCash(state, event.account_id, money(event.sold_amount, event.sold_currency).neg());
  adjustCash(state, event.account_id, money(event.bought_amount, event.bought_currency));
  adjustCash(state, event.account_id, money(event.fee, event.fee_currency).neg());
};

export const applyCashDeposit = (state: LedgerState, event: CashDepositEvent): void => {
  requireAccount(state, event.account_id, event.id);
  adjustCash(state, event.account_id, money(event.amount, event.currency));
};

export const applyCashWithdrawal = (state: LedgerState, event: CashWithdrawalEvent): void => {
  requireAccount(state, event.account_id, event.id);
  adjustCash(state, event.account_id, money(event.amount, event.currency).neg());
};

export const applyStandaloneFee = (state: LedgerState, event: StandaloneFeeEvent): void => {
  requireAccount(state, event.account_id, event.id);
  adjustCash(state, event.account_id, money(event.amount, event.currency).neg());
};

export const applyValuation = (state: LedgerState, event: ValuationEvent): void => {
  const account = requireAccount(state, event.account_id, event.id);
  const asset = requireAsset(state, event.asset_id, event.id);
  assertSameBook(account, asset, event.id);
  state.valuations.push(event);
};
