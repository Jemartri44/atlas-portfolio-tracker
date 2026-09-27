// Whether the ledger has, on a date, an account abroad (feature 020, E2; §0
// point 1 and §8.1 B3 of prompt 020; Q3, answered 2026-09-27).
//
// Out of the income tax season, the summary reserves a row of *Atención* for
// the 720 and the 721 —whose engine is lazy and arrives after the first
// paint— only when one of them could have something to say, and that has to
// be known on the first paint. So this lives here, on the path of the boot,
// and not behind the lazy door of the informative returns.
//
// Abroad is a country other than `tax_residence` of the settings. Without it,
// the rule the engine of the informative returns applies today —a country
// other than ES (`informative/holdings.ts`)— so the row is reserved exactly
// when that engine could produce something. That fallback lives here, never in
// the web.
//
// The catalogue as it stood on the date: an `account_created` or an
// `account_updated` counts from the day, in Madrid, it was **recorded**, as
// `accountsAt` reads it (ADR-0016, S6/Q6 of feature 010). The last line of
// each account up to the date wins; active or not, as `fiscalAttention` does.

import type { CivilDate } from "../dates/civil-date.js";
import { madridDateOf } from "../dates/madrid.js";
import type { LedgerEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";

/** The residence the engine assumes today when the settings say none. */
const ENGINE_RESIDENCE = "ES";

export const hasForeignAccountsAt = (
  events: readonly LedgerEvent[],
  date: CivilDate,
  settings: Pick<Settings, "tax_residence">,
): boolean => {
  const home = settings.tax_residence ?? ENGINE_RESIDENCE;
  const countries = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "account_created" && event.type !== "account_updated") {
      continue;
    }
    if (madridDateOf(event.recorded_at) > date) {
      continue;
    }
    countries.set(event.account_id, event.country);
  }
  return [...countries.values()].some((country) => country !== home);
};
