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
  TransferEvent,
  ValuationEvent,
} from "../schema/events.js";
import { fiscalDateOf } from "../settings/fiscal-date.js";
import { adjustCash } from "./cash.js";
import { assertSameBook, requireAccount, requireAsset } from "./catalogue.js";
import { recordGain } from "./gains.js";
import { recordIncome } from "./income.js";
import { consume, openLot, openQuantity } from "./lots.js";
import { completeRequest, fillOrder, lookupOpenOrder, lookupOpenRequest } from "./pending.js";
import { accountsHolding, adjustPosition, positionOf } from "./positions.js";
import { type Asset, addWarning, type LedgerState } from "./state.js";

interface Priced {
  id: string;
  currency: string;
  fx_rate: string;
  fx_rate_date: CivilDate;
}

const fxOf = (event: Priced): FxRate =>
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

const negative = (quantity: Quantity): Quantity => Quantity.of(quantity.value.neg());

const warnCurrency = (state: LedgerState, event: Priced, asset: Asset): void => {
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

const warnFxDate = (state: LedgerState, event: Priced, fiscalDate: CivilDate): void => {
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

const warnHolders = (state: LedgerState, assetId: AssetId, eventId: string): void => {
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

const requireAvailable = (
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

export const applyBuy = (state: LedgerState, event: BuyEvent, position: number): void => {
  const account = requireAccount(state, event.account_id, event.id);
  const asset = requireAsset(state, event.asset_id, event.id);
  assertSameBook(account, asset, event.id);
  if (account.book === "bucket") {
    throw new ProjectionError(
      "thesis_required",
      event.id,
      "a buy in the bucket needs a thesis; theses arrive with feature 002",
      { account_id: event.account_id },
    );
  }
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
  warnCurrency(state, event, asset);
  warnFxDate(state, event, fiscalDate);
  warnHolders(state, event.asset_id, event.id);
};

export const applySell = (state: LedgerState, event: SellEvent): void => {
  const account = requireAccount(state, event.account_id, event.id);
  const asset = requireAsset(state, event.asset_id, event.id);
  assertSameBook(account, asset, event.id);
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
  const slices = consume(state, event.asset_id, quantity, event.id);
  recordGain(state, {
    event_id: event.id,
    asset_id: event.asset_id,
    account_id: event.account_id,
    fiscal_date: fiscalDate,
    quantity,
    proceeds_eur: proceedsEur,
    slices,
  });
  warnCurrency(state, event, asset);
  warnFxDate(state, event, fiscalDate);
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
  const slices = consume(state, event.from_asset_id, quantityOut, event.id);
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
