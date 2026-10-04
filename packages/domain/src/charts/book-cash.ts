// What each book is worth **with the cash of its own accounts**, on each date of
// a net worth series (feature 020, E4, second part; ADR-0004).
//
// Net worth is `core + bucket + cash in the investment accounts`. A portfolio
// that was funded with 10.000 and bought 2.000 is not worth 2.000: it is worth
// 2.000 in assets and 8.000 in cash, and read against what was contributed
// (10.000) it stands level. So the line the contributions are read against is
// the core **with the cash of its accounts**, and the bucket is drawn with the
// cash of its own, so that the two lines add up to the net worth with nothing
// counted twice and nothing mixed between books (constitution III). The book
// of an account is its current one, as for the contributions.
//
// It adds nothing of its own: the assets are those of `netWorth` and the cash
// rows too, each already converted. A point where something of a book is
// missing (a price, or the rate of a currency whose cash that book holds) has
// no value for that book: it is said, never completed. Its dates are those of
// `netWorthSeries` with the same options, so every series shares the axis.

import type { CivilDate } from "../dates/civil-date.js";
import type { Money } from "../money/money.js";
import { netWorth } from "../projections/networth.js";
import { projectLedger } from "../projections/project-ledger.js";
import { netWorthDates, type SeriesOptions } from "../projections/series.js";
import { settingsAt } from "../projections/settings-at.js";
import type { LedgerEvent } from "../schema/events.js";

export interface BookCashPoint {
  date: CivilDate;
  /** The core's assets and the cash of its accounts; absent if anything of it is missing. */
  core_eur?: Money;
  /** The bucket's assets and the cash of its accounts; absent if anything of it is missing. */
  bucket_eur?: Money;
}

export interface BookCashSeries {
  from: CivilDate;
  to: CivilDate;
  points: BookCashPoint[];
}

export const bookCashSeries = (
  events: readonly LedgerEvent[],
  options: SeriesOptions,
): BookCashSeries => {
  const { dates, from, to } = netWorthDates(events, options);
  const points = dates.map((date): BookCashPoint => {
    const state = projectLedger(events, { collectErrors: true, asOf: date });
    const worth = netWorth(state, date, settingsAt(state, date).settings);
    const withCash = (book: "core" | "bucket"): Money | undefined => {
      const assets = book === "core" ? worth.core : worth.bucket;
      let total = assets.total_eur;
      let whole = !assets.partial;
      for (const row of worth.cash.rows) {
        if (state.accounts.get(row.account_id)?.book !== book) {
          continue;
        }
        if (row.value_eur === undefined) {
          whole = false;
        } else {
          total = total.add(row.value_eur);
        }
      }
      return whole ? total : undefined;
    };
    const core = withCash("core");
    const bucket = withCash("bucket");
    return {
      date,
      ...(core === undefined ? {} : { core_eur: core }),
      ...(bucket === undefined ? {} : { bucket_eur: bucket }),
    };
  });
  return { from, to, points };
};
