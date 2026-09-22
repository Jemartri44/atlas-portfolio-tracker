// A tax year with a filed return in force is **closed** for that model
// (ADR-0020, amended on 2026-09-19): the income tax closes the figures of the
// savings base, and the 720 and the 721 close the assets held at 31/12.
//
// Recording, correcting or reversing something that lands in a closed year is
// **not refused**: doing it late can be legitimate and is sometimes compulsory.
// What is never acceptable is doing it in silence, so the warning says **which
// return would have to be looked at** and how much it moves.
//
// It warns in **both** cases, which is the amendment of ADR-0020 (prompt 010,
// P4):
//
//   - when the event falls **by date** in a closed year, and
//   - whenever recording it **moves a figure that was declared**, even if its
//     own date belongs to another year. A repurchase in January defers a loss
//     of December and changes the base of a year already filed; the rule by
//     date alone would say nothing.
//
// It walks the chain of years, not the whole report: no alternative readings
// and no difference with the previous settings, which is what makes it cheap
// enough to run before every write.

import type { CivilDate } from "../dates/civil-date.js";
import { yearOf } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { Money } from "../money/money.js";
import { closedYears, type Filing } from "../projections/filings.js";
import { businessDateOf, isOperationEvent, projectLedger } from "../projections/project-ledger.js";
import type { LedgerState } from "../projections/state.js";
import type { FiledRentaFigures, FilingModel, LedgerEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { isInvalid, taxChain } from "../tax/chain.js";
import type { PendingLoss } from "../tax/report.js";

/** One reading of the ledger: the events, and the settings to read them with. */
export interface Reading {
  events: readonly LedgerEvent[];
  /** An explicit override; absent means the last `settings_changed` of the ledger. */
  settings?: Settings;
}

/** A figure of what was declared that the change moves. */
export interface MovedFigure {
  /** `savings_base`, `pending:<year>:<category>` or `deferred`. */
  figure: string;
  before: string;
  after: string;
}

export interface ClosedYearImpact {
  model: FilingModel;
  year: number;
  filing_id: Ulid;
  filed_at: CivilDate;
  /** The date of what is being recorded falls in that tax year. */
  by_date: boolean;
  /** What of the declared figures moves; empty means it only falls by date. */
  moves: MovedFigure[];
}

const text = (money: Money): string => money.amount.toString();

/** The tax years the events added by the change belong to, by their business date. */
const touchedYears = (before: Reading, after: Reading, state: LedgerState): Set<number> => {
  const known = new Set(before.events.map((event) => event.id));
  const years = new Set<number>();
  const yearOfEvent = (event: LedgerEvent): void => {
    if (isOperationEvent(event)) {
      years.add(yearOf(businessDateOf(state, event)));
    }
  };
  for (const event of after.events) {
    if (known.has(event.id)) {
      continue;
    }
    if (event.type === "reversal") {
      // A reversal has no date of its own: what it moves is the year of what
      // it annuls, which is always in the file (the projection refuses one
      // that annuls nothing).
      yearOfEvent(after.events.find((entry) => entry.id === event.reverses_id) as LedgerEvent);
      continue;
    }
    yearOfEvent(event);
  }
  return years;
};

/**
 * The figures of a `renta` as the chain computes them for one year, or nothing
 * when that reading cannot be computed (invalid events, ADR-0015). Nothing is
 * **not** zero: comparing a reading that failed against one that worked would
 * report the whole base as moved, which is exactly the false alarm the warning
 * must not raise.
 */
const figuresOf = (
  reading: Reading,
  year: number,
  today: CivilDate,
): Map<string, string> | undefined => {
  const figures = new Map<string, string>();
  const chain = taxChain(reading.events, year, { today }, reading.settings);
  if (isInvalid(chain)) {
    return undefined;
  }
  figures.set("savings_base", text(chain.bases.get(year) as Money));
  // Always there: the chain walks every year from its first up to this one.
  for (const entry of chain.pendings.get(year) as PendingLoss[]) {
    figures.set(`pending:${entry.origin_year}:${entry.category}`, text(entry.amount_eur));
  }
  // What the wash-sale rule still holds deferred at 31/12 of that year, which
  // is the third figure a `renta` declares (feature 009, Q9).
  const deferred = chain.pendingDeferrals.reduce(
    (total, entry) => total.add(entry.amount_eur),
    Money.zero("EUR"),
  );
  figures.set("deferred", text(deferred.roundToCents()));
  return figures;
};

/**
 * The names of the figures a filing declares, which are the ones worth
 * comparing. Only called for a `renta`, whose three figures are required by
 * the schema, so there is nothing to default here.
 */
const declaredFigures = (filing: Filing): string[] => {
  const declared = filing.declared as FiledRentaFigures;
  return [
    "savings_base",
    ...declared.pending_losses.map((entry) => `pending:${entry.origin_year}:${entry.category}`),
    "deferred",
  ];
};

/**
 * What a change does to the years that are already filed.
 *
 * Nothing filed, nothing to say: that is the fast path of every ledger today,
 * and it costs one projection.
 */
export const closedYearImpact = (
  before: Reading,
  after: Reading,
  today: CivilDate,
  /**
   * The projection of `after`, when the caller already has it. Every write
   * projects the candidate once, and that is the declared cost of a write
   * (ADR-0002): a warning that projected it again would double it on every
   * write of a ledger with nothing filed at all.
   */
  projected?: LedgerState,
): ClosedYearImpact[] => {
  const state =
    projected ??
    projectLedger(after.events, {
      collectErrors: true,
      ...(after.settings === undefined ? {} : { settings: after.settings }),
    });
  const closed = closedYears(state, today);
  if (closed.length === 0) {
    return [];
  }
  const touched = touchedYears(before, after, state);
  const impacts: ClosedYearImpact[] = [];
  for (const entry of closed) {
    const byDate = touched.has(entry.year);
    const moves: MovedFigure[] = [];
    // Only the income tax has figures the chain can compare; the assets of a
    // 720 are valued at market and live in their own module (block 3).
    const was = entry.model === "renta" ? figuresOf(before, entry.year, today) : undefined;
    const is = entry.model === "renta" ? figuresOf(after, entry.year, today) : undefined;
    if (was !== undefined && is !== undefined) {
      for (const figure of new Set([
        ...declaredFigures(entry.filing),
        ...was.keys(),
        ...is.keys(),
      ])) {
        const left = was.get(figure) ?? "0";
        const right = is.get(figure) ?? "0";
        if (left !== right) {
          moves.push({ figure, before: left, after: right });
        }
      }
    }
    if (byDate || moves.length > 0) {
      impacts.push({
        model: entry.model,
        year: entry.year,
        filing_id: entry.filing.event_id,
        filed_at: entry.filing.filed_at,
        by_date: byDate,
        moves,
      });
    }
  }
  return impacts;
};

/**
 * Past tax years with figures in the ledger and **no** filing recorded.
 *
 * Not a warning: a note (Q8). A past year without a filing may simply not have
 * been filed yet, or the user may not have recorded it, and saying "careful,
 * you filed this" of a year nobody filed would be the warning that gets
 * ignored. The years are listed so the interfaces can say it calmly.
 */
export const unfiledPastYears = (
  events: readonly LedgerEvent[],
  today: CivilDate,
  /** The projection of `events`, when the caller already has it. */
  projected?: LedgerState,
): number[] => {
  const state = projected ?? projectLedger(events, { collectErrors: true });
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
