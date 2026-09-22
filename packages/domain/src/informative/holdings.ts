// What the taxpayer holds **abroad** on a date (feature 010, block 3).
//
// An asset counts when the account that holds it is not Spanish. A Spanish
// account in an omnibus arrangement — MyInvestor, for instance — is out even
// when the fund itself is Luxembourgish, because the formal holder before the
// registry is the distributor (`business-rules.md` §5.8). The output says which
// accounts it left out and why: in the hand-computed exercise of §6.1 the
// exclusion is what decides the verdict, and a reader has to be able to see it.
//
// The quantities and the cash are the ones **of that date**, projected with
// `asOf` (ADR-0016). It is the most expensive lesson of the project: a dated
// view that uses the quantities of another day gives false figures in silence.
//
// Both books are added together, per taxpayer, and the caller says so
// (constitution III, first exception).

import type { CivilDate } from "../dates/civil-date.js";
import { madridDateOf } from "../dates/madrid.js";
import type { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import { cashBalances } from "../projections/cash.js";
import { physicalPositions } from "../projections/positions.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { LedgerState } from "../projections/state.js";
import type {
  AccountCreatedEvent,
  AccountId,
  AssetId,
  AssetType,
  Book,
  LedgerEvent,
} from "../schema/events.js";

const SPAIN = "ES";

/** An account as it stood on the date asked: its country then, not its country today. */
export interface AccountAt {
  account_id: AccountId;
  name: string;
  book: Book;
  country: string;
  active: boolean;
}

export interface ForeignHoldings {
  state: LedgerState;
  /** Foreign accounts that existed on the date. */
  accounts: Map<AccountId, AccountAt>;
  securities: { account_id: AccountId; asset_id: AssetId; quantity: Quantity }[];
  crypto: { account_id: AccountId; asset_id: AssetId; quantity: Quantity }[];
  cash: { account_id: AccountId; currency: string; balance: Money }[];
  excluded: { account_id: AccountId; reason: "domestic_account" }[];
  /** An account whose country changed: the output says so, because it decides what counts. */
  changed_country: AccountId[];
}

/**
 * The catalogue as it stood on a date.
 *
 * An `account_updated` is catalogue: pass A applies it whole and without a
 * business date, so the projection only ever knows the country of **today**.
 * What the ledger does keep is the day each change was **recorded**, and that
 * is what is used here, exactly as `settingsAt` does with the configuration and
 * as ADR-0016 requires of an administrative document (S6, question Q6). A
 * broker that moves its subsidiary is rare; getting it silently wrong would
 * apply the Spanish exclusion to the years in which the account was foreign,
 * and say "not obliged" of a year that obliged.
 */
export const accountsAt = (
  events: readonly LedgerEvent[],
  date: CivilDate,
): { accounts: Map<AccountId, AccountAt>; changed: AccountId[] } => {
  const accounts = new Map<AccountId, AccountAt>();
  const countries = new Map<AccountId, Set<string>>();
  for (const event of events) {
    if (event.type !== "account_created" && event.type !== "account_updated") {
      continue;
    }
    const entry = event as AccountCreatedEvent;
    countries.set(
      entry.account_id,
      (countries.get(entry.account_id) ?? new Set<string>()).add(entry.country),
    );
    if (madridDateOf(entry.recorded_at) > date) {
      continue;
    }
    accounts.set(entry.account_id, {
      account_id: entry.account_id,
      name: entry.name,
      book: entry.book,
      country: entry.country,
      active: entry.active,
    });
  }
  const changed = [...countries]
    .filter(([id, seen]) => seen.size > 1 && accounts.has(id))
    .map(([id]) => id);
  return { accounts, changed };
};

/** Asset types the 720 declares as securities. `crypto` is the 721's, and nothing else is. */
const SECURITIES: ReadonlySet<AssetType> = new Set([
  "fund",
  "money_market",
  "etf",
  "etc",
  "etp",
  "stock",
]);

/** What is held abroad at a date, by account: securities, crypto and cash. */
export const foreignHoldingsAt = (
  events: readonly LedgerEvent[],
  date: CivilDate,
): ForeignHoldings => {
  const state = projectLedger(events, { asOf: date });
  const { accounts: all, changed } = accountsAt(events, date);
  const accounts = new Map<AccountId, AccountAt>();
  const excluded: { account_id: AccountId; reason: "domestic_account" }[] = [];
  for (const [id, account] of all) {
    if (account.country === SPAIN) {
      excluded.push({ account_id: id, reason: "domestic_account" });
      continue;
    }
    accounts.set(id, account);
  }
  const securities: ForeignHoldings["securities"] = [];
  const crypto: ForeignHoldings["crypto"] = [];
  for (const position of physicalPositions(state)) {
    if (!accounts.has(position.account_id) || !position.quantity.isPositive()) {
      continue;
    }
    const type = (state.assets.get(position.asset_id) as { asset_type: AssetType }).asset_type;
    const entry = {
      account_id: position.account_id,
      asset_id: position.asset_id,
      quantity: position.quantity,
    };
    (SECURITIES.has(type) ? securities : crypto).push(entry);
  }
  const cash = cashBalances(state).filter((entry) => accounts.has(entry.account_id));
  return {
    state,
    accounts,
    securities,
    crypto,
    cash,
    excluded,
    changed_country: changed.filter((id) => all.has(id)),
  };
};
