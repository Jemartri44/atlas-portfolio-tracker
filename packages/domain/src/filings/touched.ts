// **The fact**: this write reaches a tax year that is already filed.
//
// Split from **the figure** ("and it moves the base from 200,00 to 175,70") on
// purpose, and the reason is structural, not cosmetic. Knowing the fact needs
// only the projection of the filings, which every reader already has; knowing
// the figure needs the chain of tax years, which is the tax engine. Keeping
// the two apart is what lets the **use cases** return the fact — so no
// interface can forget to warn — while the figure is put on by whoever already
// has the engine loaded (the confirmation of the CLI, the preview of the web),
// instead of dragging the whole engine into the path of every write.
//
// Measured, not argued: with the fact in the use cases the boot of the web
// grows 0,2 KB gzip; with the figure in them it grows 4,9 and pulls `tax/`
// into the boot chunk.

import type { CivilDate } from "../dates/civil-date.js";
import { yearOf } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { closedYears } from "../projections/filings.js";
import { businessDateOf, isOperationEvent } from "../projections/project-ledger.js";
import type { LedgerState } from "../projections/state.js";
import type { FilingModel, LedgerEvent } from "../schema/events.js";

/** A tax year with a filing in force that a write reaches. */
export interface ClosedYear {
  model: FilingModel;
  year: number;
  filing_id: Ulid;
  filed_at: CivilDate;
  /** The date of what is being written falls in that tax year. */
  by_date: boolean;
}

/** The tax years the events added by a change belong to, by their business date. */
export const touchedYears = (
  before: readonly LedgerEvent[],
  after: readonly LedgerEvent[],
  state: LedgerState,
): Set<number> => {
  const known = new Set(before.map((event) => event.id));
  const years = new Set<number>();
  const yearOfEvent = (event: LedgerEvent): void => {
    if (isOperationEvent(event)) {
      years.add(yearOf(businessDateOf(state, event)));
    }
  };
  for (const event of after) {
    if (known.has(event.id)) {
      continue;
    }
    if (event.type === "reversal") {
      // A reversal has no date of its own: what it moves is the year of what
      // it annuls, which is always in the file (the projection refuses one
      // that annuls nothing).
      yearOfEvent(after.find((entry) => entry.id === event.reverses_id) as LedgerEvent);
      continue;
    }
    yearOfEvent(event);
  }
  return years;
};

/**
 * Every year already filed that is in force on `today`, saying which of them
 * the write falls into by date. It never refuses anything: filing late can be
 * legitimate, and sometimes compulsory. What it must never do is stay silent.
 */
export const closedYearsTouched = (
  before: readonly LedgerEvent[],
  after: readonly LedgerEvent[],
  today: CivilDate,
  state: LedgerState,
): ClosedYear[] => {
  const closed = closedYears(state, today);
  if (closed.length === 0) {
    return [];
  }
  const touched = touchedYears(before, after, state);
  return closed.map((entry) => ({
    model: entry.model,
    year: entry.year,
    filing_id: entry.filing.event_id,
    filed_at: entry.filing.filed_at,
    by_date: touched.has(entry.year),
  }));
};

/**
 * Past tax years with figures in the ledger and **no** filing recorded.
 *
 * Not a warning: a note (Q8). A past year without a filing may simply not have
 * been filed yet, or the user may not have recorded it, and saying "careful,
 * you filed this" of a year nobody filed would be the warning that gets
 * ignored. The years are listed so the interfaces can say it calmly.
 */
export const unfiledPastYears = (today: CivilDate, state: LedgerState): number[] => {
  const currentYear = yearOf(today);
  const filed = new Set(
    closedYears(state, today)
      .filter((entry) => entry.model === "renta")
      .map((entry) => entry.year),
  );
  const years = new Set<number>();
  for (const gain of state.gains) {
    years.add(gain.year);
  }
  for (const income of state.income) {
    years.add(income.year);
  }
  return [...years].filter((year) => year < currentYear && !filed.has(year)).sort((a, b) => a - b);
};
