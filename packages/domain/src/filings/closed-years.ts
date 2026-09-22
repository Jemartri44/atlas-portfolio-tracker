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
import type { Ulid } from "../ids/ulid.js";
import type { Money } from "../money/money.js";
import type { Filing } from "../projections/filings.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { LedgerState } from "../projections/state.js";
import type { FiledRentaFigures, FilingModel, LedgerEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { chainFigures, isInvalid, taxChain } from "../tax/chain.js";
import { type ClosedYear, closedYearsTouched } from "./touched.js";

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
  const chain = taxChain(reading.events, year, { today }, reading.settings);
  if (isInvalid(chain)) {
    return undefined;
  }
  return new Map([...chainFigures(chain, year)].map(([figure, amount]) => [figure, text(amount)]));
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

/** The filing behind a fact, which the projected state still holds by its id. */
const filingOf = (state: LedgerState, closed: ClosedYear): Filing =>
  state.filings.get(closed.filing_id) as Filing;

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
  const closed = closedYearsTouched(before.events, after.events, today, state);
  if (closed.length === 0) {
    return [];
  }
  const impacts: ClosedYearImpact[] = [];
  for (const entry of closed) {
    const byDate = entry.by_date;
    const moves: MovedFigure[] = [];
    // Only the income tax has figures the chain can compare; the assets of a
    // 720 are valued at market and live in their own module (block 3).
    const was = entry.model === "renta" ? figuresOf(before, entry.year, today) : undefined;
    const is = entry.model === "renta" ? figuresOf(after, entry.year, today) : undefined;
    if (was !== undefined && is !== undefined) {
      for (const figure of new Set([
        ...declaredFigures(filingOf(state, entry)),
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
        filing_id: entry.filing_id,
        filed_at: entry.filed_at,
        by_date: byDate,
        moves,
      });
    }
  }
  return impacts;
};
