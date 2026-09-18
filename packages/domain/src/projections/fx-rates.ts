// The last ECB rate the ledger knows for each currency (feature 005, §3.1).
//
// Cash in a foreign currency has to be shown in euros somewhere, and the only
// honest rate is one the ledger actually carries. It is kept **per currency,
// not per account**: a purchase in dollars dates the dollar just as well as a
// deposit in dollars, and refusing to convert an account that never traded in a
// currency the ledger priced last week would be pedantry, not prudence.
//
// The date shown is the `fx_rate_date` of the event when it has one (the four
// events that only gained the field in this feature may not) and its business
// date otherwise, and the view says which it is. Nothing here is invented: a
// currency the ledger never priced simply has no rate.

import type { CivilDate } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { Decimal } from "../money/decimal.js";
import type { LedgerEvent } from "../schema/events.js";
import type { LedgerState } from "./state.js";

export interface KnownFxRate {
  rate: Decimal;
  date: CivilDate;
  /** The event the rate was read from. */
  event_id: Ulid;
  /** The rate carried its own `fx_rate_date`; otherwise `date` is the business date. */
  dated: boolean;
}

interface RawPair {
  currency: string | undefined;
  rate: string | undefined;
  date: CivilDate | undefined;
}

/** The euro is its own reference: the ECB publishes no rate of the euro against itself. */
const EUR = "EUR";

/** Every (currency, rate) pair an event declares, effects included. */
const pairsOf = (event: LedgerEvent): RawPair[] => {
  const raw = event as unknown as {
    currency?: string;
    fx_rate?: string;
    fx_rate_date?: CivilDate;
    sold_currency?: string;
    fx_rate_sold?: string;
    bought_currency?: string;
    fx_rate_bought?: string;
    effects?: { currency?: string; fx_rate?: string; fx_rate_date?: CivilDate }[];
  };
  return [
    { currency: raw.currency, rate: raw.fx_rate, date: raw.fx_rate_date },
    { currency: raw.sold_currency, rate: raw.fx_rate_sold, date: raw.fx_rate_date },
    { currency: raw.bought_currency, rate: raw.fx_rate_bought, date: raw.fx_rate_date },
    ...(raw.effects ?? []).map((effect) => ({
      currency: effect.currency,
      rate: effect.fx_rate,
      date: effect.fx_rate_date,
    })),
  ];
};

/**
 * Records the rates an event carries. Called once the event has been applied,
 * so an event the projection rejected never dates a currency.
 */
export const noteFxRates = (
  state: LedgerState,
  event: LedgerEvent,
  businessDate: CivilDate,
): void => {
  for (const pair of pairsOf(event)) {
    if (pair.currency === undefined || pair.currency === EUR || pair.rate === undefined) {
      continue;
    }
    state.fxRates.set(pair.currency, {
      rate: Decimal.parse(pair.rate),
      date: pair.date ?? businessDate,
      event_id: event.id,
      dated: pair.date !== undefined,
    });
  }
};
