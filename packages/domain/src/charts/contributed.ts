// What was contributed to the core book, on each date of a series (feature 020,
// E4, M3). The line the net worth is read against: how far above or below the
// money put in the portfolio stands.
//
// **Only cash that the user put in or took out counts**: `cash_deposit` adds,
// `cash_withdrawal` subtracts, in accounts of the core book, each at
// `amount / fx_rate` of its own event (the same expression the bucket's
// contribution uses). Dividends, interest, fees, purchases, sales, exchanges,
// corporate actions and transfers are not money coming in or going out. The
// bucket never enters (constitution III): money that goes from the core to the
// bucket is a withdrawal of one and a deposit of the other, and the core's
// contribution falls, which is what happened.
//
// It depends on **no price**, so it has no holes: every point exists. It is
// read from the events with the reversals and the invalid events of the
// projection, and a point at date `d` counts the events whose business date is
// `<= d` (ADR-0016). Its dates are exactly those of `netWorthSeries` with the
// same options, so both share the axis.
//
// A ledger that bought without recording the cash it came from has nothing to
// add up before its first deposit, and nothing is made up from the purchases:
// the series says it with `uncovered_buys`.

import type { CivilDate } from "../dates/civil-date.js";
import { Money } from "../money/money.js";
import { cashEurOf } from "../projections/bucket-stats.js";
import { businessDateOf, isOperationEvent, projectLedger } from "../projections/project-ledger.js";
import { netWorthDates, type SeriesOptions } from "../projections/series.js";
import type { LedgerEvent } from "../schema/events.js";

export interface ContributedPoint {
  date: CivilDate;
  /** Net cash put into the core book up to that date, in euros; never absent. */
  contributed_eur: Money;
}

export interface ContributedSeries {
  from: CivilDate;
  to: CivilDate;
  points: ContributedPoint[];
  /** The core bought something before its first recorded deposit (or never recorded one). */
  uncovered_buys: boolean;
}

interface Flow {
  date: CivilDate;
  eur: Money;
}

export const contributedSeries = (
  events: readonly LedgerEvent[],
  options: SeriesOptions,
): ContributedSeries => {
  const state = projectLedger(events, { collectErrors: true });
  const invalid = new Set(state.invalid.map((entry) => entry.event.id));
  const flows: Flow[] = [];
  let firstBuy: CivilDate | undefined;
  let firstDeposit: CivilDate | undefined;
  for (const event of events) {
    if (state.reversed.has(event.id) || invalid.has(event.id) || !isOperationEvent(event)) {
      continue;
    }
    const account = (event as { account_id?: string }).account_id;
    if (account === undefined || state.accounts.get(account)?.book !== "core") {
      continue;
    }
    const date = businessDateOf(state, event);
    if (event.type === "cash_deposit") {
      flows.push({ date, eur: cashEurOf(event) });
      firstDeposit = firstDeposit === undefined || date < firstDeposit ? date : firstDeposit;
    } else if (event.type === "cash_withdrawal") {
      flows.push({ date, eur: cashEurOf(event).neg() });
    } else if (event.type === "buy" && (firstBuy === undefined || date < firstBuy)) {
      firstBuy = date;
    }
  }
  const { dates, from, to } = netWorthDates(events, options);
  return {
    from,
    to,
    points: dates.map((date) => ({
      date,
      contributed_eur: flows
        .filter((flow) => flow.date <= date)
        .reduce((sum, flow) => sum.add(flow.eur), Money.zero("EUR")),
    })),
    uncovered_buys:
      firstBuy !== undefined && (firstDeposit === undefined || firstBuy < firstDeposit),
  };
};
