// The operations that touch cash, income or valuations only: no lots are
// opened or consumed.

import { Decimal } from "../money/decimal.js";
import { EUR, Money } from "../money/money.js";
import type {
  CashDepositEvent,
  CashWithdrawalEvent,
  DividendEvent,
  FxExchangeEvent,
  InterestEvent,
  StandaloneFeeEvent,
} from "../schema/events.js";
import { adjustCash } from "./cash.js";
import { assertSameBook, requireAccount, requireAsset } from "./catalogue.js";
import {
  autoConversion,
  type CurrencyFlow,
  currencyIn,
  currencyOut,
  settledEurOf,
} from "./currency-lots.js";
import { recordIncome } from "./income.js";
import { fxOf, money, receiveProceeds } from "./operations.js";
import type { LedgerState } from "./state.js";

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
  receiveIncome(state, event, net);
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
  receiveIncome(state, event, net);
};

const flowOf = (
  event: { id: string; account_id: string; value_date: string },
  amount: Money,
): CurrencyFlow => ({
  event_id: event.id,
  account_id: event.account_id,
  amount,
  date: event.value_date,
});

/** The net of an income comes in as currency at the rate it was taxed at. */
const receiveIncome = (
  state: LedgerState,
  event: DividendEvent | InterestEvent,
  net: Money,
): void => {
  receiveProceeds(state, flowOf(event, net), fxOf(event).toEur(net), settledEurOf(event));
};

/**
 * A change of currency. What is sold leaves at its cost; what is bought comes in
 * at that cost (V2466-08: changing one currency for another imputes nothing),
 * unless it is the euro: then the euros received against that cost are imputed
 * today (art. 14.2.e LIRPF, V1877-10). A fee joins the side of its currency; in
 * euros between two foreign currencies, it adds to the cost; in a third
 * currency, which has no rate here, it is spent at what it cost and adds too.
 */
const exchangeCurrency = (state: LedgerState, event: FxExchangeEvent): void => {
  const sold = money(event.sold_amount, event.sold_currency);
  const bought = money(event.bought_amount, event.bought_currency);
  const fee = money(event.fee, event.fee_currency);
  const feeOn = (currency: string): Money =>
    fee.currency === currency ? fee : Money.zero(currency);
  const out = sold.add(feeOn(sold.currency));
  const received = bought.sub(feeOn(bought.currency));
  const extra = [sold.currency, bought.currency].includes(fee.currency)
    ? Money.zero(EUR)
    : fee.currency === EUR
      ? fee
      : currencyOut(state, flowOf(event, fee), Money.zero(EUR), "exchange");
  const toEuro = bought.currency === EUR;
  const cost =
    sold.currency === EUR
      ? out
      : currencyOut(
          state,
          flowOf(event, out),
          toEuro
            ? received
            : Money.of(received.amount.div(Decimal.parse(event.fx_rate_bought)), EUR),
          toEuro ? "conversion" : "exchange",
        );
  if (!toEuro) {
    currencyIn(state, flowOf(event, received), cost.add(extra));
  }
};

export const applyFxExchange = (state: LedgerState, event: FxExchangeEvent): void => {
  requireAccount(state, event.account_id, event.id);
  adjustCash(state, event.account_id, money(event.sold_amount, event.sold_currency).neg());
  adjustCash(state, event.account_id, money(event.bought_amount, event.bought_currency));
  adjustCash(state, event.account_id, money(event.fee, event.fee_currency).neg());
  exchangeCurrency(state, event);
};

export const applyCashDeposit = (state: LedgerState, event: CashDepositEvent): void => {
  requireAccount(state, event.account_id, event.id);
  const amount = money(event.amount, event.currency);
  adjustCash(state, event.account_id, amount);
  currencyIn(state, flowOf(event, amount), fxOf(event).toEur(amount));
};

export const applyCashWithdrawal = (state: LedgerState, event: CashWithdrawalEvent): void => {
  requireAccount(state, event.account_id, event.id);
  const amount = money(event.amount, event.currency);
  adjustCash(state, event.account_id, amount.neg());
  // Still the user's currency, outside the account: it leaves at cost and imputes nothing.
  currencyOut(state, flowOf(event, amount), fxOf(event).toEur(amount), "withdrawal");
};

/**
 * Paying with currency realizes it (art. 14.2.e LIRPF): its value on the day of
 * the fee against what it cost is imputed (spec 029, question 3). Converted by
 * the broker, against the euros it charged.
 */
export const applyStandaloneFee = (state: LedgerState, event: StandaloneFeeEvent): void => {
  requireAccount(state, event.account_id, event.id);
  const amount = money(event.amount, event.currency);
  adjustCash(state, event.account_id, amount.neg());
  const value = fxOf(event).toEur(amount);
  const settled = settledEurOf(event);
  if (settled === undefined) {
    currencyOut(state, flowOf(event, amount), value, "payment");
  } else {
    // Validation refuses `broker_settled_eur` on an amount in euros (ADR-0030).
    autoConversion(state, flowOf(event, amount), value, settled);
  }
};
