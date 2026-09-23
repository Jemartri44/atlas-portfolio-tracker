// The **average balance of the fourth quarter** of a cash account, which the
// Modelo 720 asks for next to the balance at 31 December (prompt 010, P2).
//
// Both figures decide: there is an obligation when **either** of the two joint
// balances is above the threshold, and the rule of the 20.000 € is measured on
// each of them. With one balance alone the application could say "not obliged"
// in a year whose average did oblige.
//
// The method is ficha F3 (question Q4): the average of the closing balance of
// every **calendar day** of the period, converted at the rate of 31 December —
// the FAQ of the AEAT says the same rate values the average— and the period
// runs from 1 October, or from the day the account appears if that is later
// (DGT V0630-25: dividing by 92 days an account that opened in November gives a
// lower average, which is the direction that has consequences).
//
// There is **no second cash engine here**. The balances come from projections
// with `asOf`: one at the start of the period and one on every day of it with
// an operation of a foreign account. Between two of those days the balance is
// the one of the earlier day, because nothing happened — which is a reading,
// not an interpolation.

import { addDays, type CivilDate, daysBetween } from "../dates/civil-date.js";
import { madridDateOf } from "../dates/madrid.js";
import { Decimal } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { businessDateOf, isOperationEvent, projectLedger } from "../projections/project-ledger.js";
import { cashKey } from "../projections/state.js";
import type { AccountCreatedEvent, AccountId, LedgerEvent } from "../schema/events.js";
import type { AccountAt } from "./holdings.js";

/** The average balance of one account in one currency, and the period it covers. */
export interface AverageBalance {
  account_id: AccountId;
  currency: string;
  average: Money;
  days: number;
  from: CivilDate;
}

/** Every account an event names, whichever field it uses. */
const accountsNamed = (event: LedgerEvent): AccountId[] => {
  const raw = event as unknown as {
    account_id?: AccountId;
    from_account_id?: AccountId;
    to_account_id?: AccountId;
    effects?: { per_account?: { account_id: AccountId }[] }[];
  };
  return [
    raw.account_id,
    raw.from_account_id,
    raw.to_account_id,
    ...(raw.effects ?? []).flatMap((effect) => (effect.per_account ?? []).map((e) => e.account_id)),
  ].filter((id): id is AccountId => id !== undefined);
};

/** The days on which an account stops or starts being active, by the day it was recorded. */
const activityChanges = (
  events: readonly LedgerEvent[],
): Map<AccountId, [CivilDate, boolean][]> => {
  const changes = new Map<AccountId, [CivilDate, boolean][]>();
  for (const event of events) {
    if (event.type !== "account_created" && event.type !== "account_updated") {
      continue;
    }
    const entry = event as AccountCreatedEvent;
    changes.set(entry.account_id, [
      ...(changes.get(entry.account_id) ?? []),
      [madridDateOf(entry.recorded_at), entry.active],
    ]);
  }
  return changes;
};

const activeAt = (changes: readonly [CivilDate, boolean][], date: CivilDate): boolean => {
  let active = false;
  for (const [when, value] of changes) {
    if (when <= date) {
      active = value;
    }
  }
  return active;
};

/**
 * The averages of the fourth quarter of `year`, per account and currency.
 *
 * A **closed** account counts with a balance of zero from the day it was marked
 * inactive: its days are part of the period and its balance is not there to
 * inflate anything (ficha F3).
 */
export const quarterAverages = (
  events: readonly LedgerEvent[],
  year: number,
  accounts: Map<AccountId, AccountAt>,
): Map<string, AverageBalance> => {
  const open = `${year}-10-01`;
  const end = `${year}-12-31`;
  const changes = activityChanges(events);
  // When each account appears: the first business date of an operation that
  // names it. An account that never traded has no day of its own and takes the
  // whole quarter, which is the same thing with a balance of zero.
  const appeared = new Map<AccountId, CivilDate>();
  const moves = new Set<CivilDate>();
  const state = projectLedger(events);
  for (const event of events) {
    if (!isOperationEvent(event)) {
      continue;
    }
    const named = accountsNamed(event).filter((id) => accounts.has(id));
    if (named.length === 0) {
      continue;
    }
    const when = businessDateOf(state, event);
    for (const id of named) {
      const first = appeared.get(id);
      if (first === undefined || when < first) {
        appeared.set(id, when);
      }
    }
    if (when >= open && when <= end) {
      moves.add(when);
    }
  }
  const starts = new Map<AccountId, CivilDate>();
  for (const id of accounts.keys()) {
    const first = appeared.get(id);
    starts.set(id, first === undefined || first < open ? open : first);
  }
  // Every day the balance can change: the start of each account, every day of
  // the quarter with an operation, and every day an account opened or closed.
  const marks = new Set<CivilDate>([...moves, ...starts.values()]);
  for (const list of changes.values()) {
    for (const [when] of list) {
      if (when >= open && when <= end) {
        marks.add(when);
      }
    }
  }
  const ordered = [...marks].sort();
  const balances = new Map<CivilDate, Map<string, Money>>();
  for (const mark of ordered) {
    const at = projectLedger(events, { asOf: mark });
    balances.set(mark, at.cash);
  }
  const currencies = new Map<AccountId, Set<string>>();
  for (const cash of balances.values()) {
    for (const key of cash.keys()) {
      const [id, currency] = key.split("|") as [AccountId, string];
      if (accounts.has(id)) {
        currencies.set(id, (currencies.get(id) ?? new Set<string>()).add(currency));
      }
    }
  }
  const result = new Map<string, AverageBalance>();
  for (const id of accounts.keys()) {
    const start = starts.get(id) as CivilDate;
    const days = daysBetween(start, end) + 1;
    const segments = ordered.filter((mark) => mark >= start);
    for (const currency of currencies.get(id) ?? []) {
      let total = Money.zero(currency);
      segments.forEach((mark, index) => {
        const next = segments[index + 1];
        const until = next === undefined ? end : addDays(next, -1);
        const span = daysBetween(mark, until) + 1;
        // Every account of the catalogue has at least its own `account_created`.
        const held = activeAt(changes.get(id) as [CivilDate, boolean][], mark)
          ? ((balances.get(mark) as Map<string, Money>).get(cashKey(id, currency)) ??
            Money.zero(currency))
          : Money.zero(currency);
        total = total.add(held.mul(Decimal.parse(String(span))));
      });
      result.set(cashKey(id, currency), {
        account_id: id,
        currency,
        average: total.div(Decimal.parse(String(days))),
        days,
        from: start,
      });
    }
  }
  return result;
};
