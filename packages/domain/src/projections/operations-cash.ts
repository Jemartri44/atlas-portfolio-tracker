// The operations that touch cash, income or valuations only: no lots are
// opened or consumed.

import { Money } from "../money/money.js";
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
import { recordIncome } from "./income.js";
import { fxOf, money } from "./operations.js";
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
