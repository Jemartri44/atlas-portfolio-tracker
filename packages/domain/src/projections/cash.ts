// Cash balances per account and currency (ADR-0004, ADR-0012). Derived only;
// may be negative when deposits were not recorded.

import { Money } from "../money/money.js";
import type { AccountId } from "../schema/events.js";
import { cashKey, type LedgerState } from "./state.js";

export interface CashBalance {
  account_id: AccountId;
  currency: string;
  balance: Money;
}

export const adjustCash = (state: LedgerState, accountId: AccountId, delta: Money): Money => {
  const key = cashKey(accountId, delta.currency);
  const next = (state.cash.get(key) ?? Money.zero(delta.currency)).add(delta);
  state.cash.set(key, next);
  return next;
};

export const cashBalances = (state: LedgerState): CashBalance[] => {
  const result: CashBalance[] = [];
  for (const [key, balance] of state.cash) {
    if (!balance.isZero()) {
      const [account_id, currency] = key.split("|") as [AccountId, string];
      result.push({ account_id, currency, balance });
    }
  }
  return result;
};
