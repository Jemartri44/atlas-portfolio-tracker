// The dates of the fiscal calendar that cost money or time (feature 020, E4,
// M12): the end of each open wash-sale window, the deadline of the 720 and the
// 721, the valuation at 31 December and the income tax season.
//
// **Nothing is recomputed here.** The window is `washSaleWindowEnd` with the
// window configured for the asset type (ADR-0014); the season comes from the
// settings; the valuation day is `yearEnd`; the deadline is normative data
// with its source (`deadlines.ts`). Every date carries the **ids** of what
// originates it and never an amount: the calendar shows names and days, so it
// reads in full with the privacy on.
//
// Out of the reach of the table, a year with no verified deadline goes to
// `unknown_deadlines`: it is said, never supposed. And the three dates of the
// informative returns only appear when there is an account abroad on the day
// (`hasForeignAccountsAt`): without one, the models have nothing to ask for.

import type { CivilDate } from "../dates/civil-date.js";
import { yearOf } from "../dates/civil-date.js";
import { hasForeignAccountsAt } from "../projections/foreign-accounts.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { AssetType, LedgerEvent } from "../schema/events.js";
import { rentaSeasonOf } from "../settings/settings.js";
import { washSaleWindowEnd, washSaleWindowOf } from "../settings/wash-sale.js";
import { FILING_DEADLINES } from "./deadlines.js";
import { yearEnd } from "./valuation.js";

export type CalendarKind =
  | "wash_sale_end"
  | "filing_deadline"
  | "year_end_valuation"
  | "season_start"
  | "season_end";

export interface CalendarDate {
  date: CivilDate;
  kind: CalendarKind;
  /** The fiscal year it refers to, when it refers to one. */
  year?: number;
  model?: "720" | "721";
  /** Ids of what originates it (a sale, an asset): never an amount. */
  sources: string[];
}

export interface FiscalCalendar {
  /** The calendar year of the query. */
  year: number;
  season: { start: CivilDate; end: CivilDate };
  /** Sorted by date; includes the ones that fall outside `year`. */
  dates: CalendarDate[];
  /** Years whose deadline nobody has verified: said, not supposed. */
  unknown_deadlines: { model: "720" | "721"; year: number }[];
}

const MODELS = ["720", "721"] as const;

/** The same day, kind, year and model are one date with all their sources. */
const KIND_ORDER: readonly CalendarKind[] = [
  "season_start",
  "wash_sale_end",
  "year_end_valuation",
  "filing_deadline",
  "season_end",
];

export const fiscalCalendar = (
  events: readonly LedgerEvent[],
  today: CivilDate,
): FiscalCalendar => {
  const state = projectLedger(events, { collectErrors: true, asOf: today });
  const settings = state.fiscalSettings;
  const year = yearOf(today);
  const months = rentaSeasonOf(settings);
  const season = { start: `${year}-${months.start}`, end: `${year}-${months.end}` };
  const merged = new Map<string, CalendarDate>();
  const add = (entry: CalendarDate): void => {
    const key = [entry.kind, entry.date, entry.model, entry.year].join("|");
    const known = merged.get(key);
    if (known === undefined) {
      merged.set(key, entry);
    } else {
      known.sources.push(...entry.sources);
    }
  };
  add({ date: season.start, kind: "season_start", year, sources: [] });
  add({ date: season.end, kind: "season_end", year, sources: [] });
  for (const gain of state.gains) {
    if (!gain.gain_eur.amount.isNegative()) {
      continue;
    }
    // A sale that booked a gain has its asset in the catalogue.
    const { asset_type } = state.assets.get(gain.asset_id) as { asset_type: AssetType };
    const end = washSaleWindowEnd(gain.fiscal_date, washSaleWindowOf(settings, asset_type));
    if (end >= today) {
      add({
        date: end,
        kind: "wash_sale_end",
        year: yearOf(gain.fiscal_date),
        sources: [gain.event_id, gain.asset_id],
      });
    }
  }
  const unknown: FiscalCalendar["unknown_deadlines"] = [];
  if (hasForeignAccountsAt(events, today, settings)) {
    add({ date: yearEnd(year), kind: "year_end_valuation", year, sources: [] });
    for (const model of MODELS) {
      const row = FILING_DEADLINES.find(
        (entry) => entry.model === model && entry.year === year - 1,
      );
      if (row === undefined) {
        unknown.push({ model, year: year - 1 });
      } else {
        add({ date: row.deadline, kind: "filing_deadline", year: row.year, model, sources: [] });
      }
    }
  }
  return {
    year,
    season,
    dates: [...merged.values()].sort(
      (a, b) =>
        a.date.localeCompare(b.date) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
    ),
    unknown_deadlines: unknown,
  };
};
