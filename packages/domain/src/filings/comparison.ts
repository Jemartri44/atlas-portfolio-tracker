// What was filed against what the ledger says today (ADR-0020, prompt 010
// block 1).
//
// Recomputing a year that was already filed and **comparing** it is not a
// mistake: it is exactly the information the user needs to decide whether a
// supplementary return is due. What the application may never do is change
// what is on record at the tax agency.
//
// When they differ, saying so is not enough — the question is **why**, and
// there are three answers that lead to three different decisions:
//
//   - events recorded after the filing (a late fee, a correction);
//   - a change of configuration (a criterion read the other way);
//   - **the application computing differently than it did then**, with the
//     same ledger and the same configuration, which is what an engine fixed in
//     ten years' time looks like.
//
// Telling them apart is what the fingerprint and `computed` are for: they let
// the same prefix of the ledger be read again the way it was read that day.

import type { CivilDate } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { Money } from "../money/money.js";
import type { Filing } from "../projections/filings.js";
import { filingInForce } from "../projections/filings.js";
import type { LedgerState } from "../projections/state.js";
import type { FiledRentaFigures, LedgerEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { type ChainCore, chainFigures, taxChain } from "../tax/chain.js";

const EUR = "EUR";

/** Where a difference comes from. The four add up to `now − declared`, exactly. */
export interface FilingCauses {
  /** What the user changed by hand before filing: `computed_then − declared`. */
  at_filing: Money;
  /** The same ledger and the same settings, read by the engine of today. */
  engine: Money;
  /** The same ledger, read with the settings in force now. */
  settings: Money;
  /** Everything recorded after the filing. */
  later_events: Money;
}

export interface FilingFigure {
  /** `savings_base`, `pending:<year>:<category>` or `deferred`. */
  figure: string;
  declared: Money;
  /** What the application computed the day it was recorded. */
  computed_then: Money;
  /** What it computes today, with the whole ledger. */
  now: Money;
  /** Absent when the prefix of the ledger cannot be trusted (see `fingerprint_ok`). */
  causes?: FilingCauses;
}

export interface FilingComparison {
  filing_id: Ulid;
  filed_at: CivilDate;
  receipt_reference: string;
  /** The original and its supplementary returns, in the order they were filed. */
  chain: Ulid[];
  /**
   * Whether the fingerprint still names the prefix of the ledger it was sealed
   * on. Only the **count** is checked here: whether the content of those lines
   * still hashes the same needs re-reading the file, and that is what
   * `atlas check --deep` and the verification screen do.
   */
  fingerprint_ok: boolean;
  figures: FilingFigure[];
}

const zero = (): Money => Money.zero(EUR);

const parse = (value: string): Money => Money.parse(value, EUR);

/** The figures of a `renta` as it declares them, keyed like the chain's. */
const declaredFigures = (figures: FiledRentaFigures): Map<string, Money> => {
  const result = new Map<string, Money>();
  result.set("savings_base", parse(figures.savings_base_eur));
  for (const entry of figures.pending_losses) {
    result.set(`pending:${entry.origin_year}:${entry.category}`, parse(entry.amount_eur));
  }
  result.set("deferred", parse(figures.deferred_losses_eur));
  return result;
};

/**
 * A reading of the prefix of the ledger the fingerprint names.
 *
 * A prefix of a valid ledger is itself valid —what makes an event invalid is
 * always something **before** it, and the report refused an invalid ledger
 * before getting here— so there is no "could not be computed" case to handle.
 */
const readingOf = (
  prefix: readonly LedgerEvent[],
  year: number,
  today: CivilDate,
  settings: Settings,
): Map<string, Money> =>
  chainFigures(taxChain(prefix, year, { today }, settings) as ChainCore, year);

/** The whole chain of a (model, year), oldest first. */
const chainOf = (state: LedgerState, filing: Filing): Ulid[] =>
  [...state.filings.values()]
    .filter((entry) => entry.model === filing.model && entry.tax_year === filing.tax_year)
    .sort((a, b) => a.filed_at.localeCompare(b.filed_at) || a.position - b.position)
    .map((entry) => entry.event_id);

/**
 * The comparison for a year, or nothing when no income tax return is in force
 * for it on the day of the query. Nothing filed, nothing to compare: that is
 * every ledger today, and it costs one lookup.
 */
export const filingComparison = (
  events: readonly LedgerEvent[],
  year: number,
  today: CivilDate,
  now: ChainCore,
): FilingComparison | undefined => {
  const state = now.state;
  const filing = filingInForce(state, "renta", year, today);
  if (filing === undefined) {
    return undefined;
  }
  const declared = declaredFigures(filing.declared as FiledRentaFigures);
  const then = declaredFigures(filing.computed as FiledRentaFigures);
  const current = chainFigures(now, year);
  // The prefix the fingerprint names. Only usable when the count still matches
  // where the filing sits: otherwise it points at other lines entirely.
  const fingerprintOk = filing.fingerprint.lines === filing.position;
  const prefix = events.slice(0, filing.fingerprint.lines);
  const asOf = filing.computed.as_of;
  const r0 = fingerprintOk ? readingOf(prefix, year, asOf, filing.computed.settings) : undefined;
  const r1 = fingerprintOk ? readingOf(prefix, year, today, state.fiscalSettings) : undefined;
  const figures: FilingFigure[] = [];
  for (const figure of new Set([...declared.keys(), ...then.keys(), ...current.keys()])) {
    const declaredAmount = declared.get(figure) ?? zero();
    const thenAmount = then.get(figure) ?? zero();
    const nowAmount = current.get(figure) ?? zero();
    const causes =
      r0 === undefined || r1 === undefined
        ? undefined
        : {
            at_filing: thenAmount.sub(declaredAmount),
            engine: (r0.get(figure) ?? zero()).sub(thenAmount),
            settings: (r1.get(figure) ?? zero()).sub(r0.get(figure) ?? zero()),
            later_events: nowAmount.sub(r1.get(figure) ?? zero()),
          };
    figures.push({
      figure,
      declared: declaredAmount,
      computed_then: thenAmount,
      now: nowAmount,
      ...(causes === undefined ? {} : { causes }),
    });
  }
  return {
    filing_id: filing.event_id,
    filed_at: filing.filed_at,
    receipt_reference: filing.receipt_reference,
    chain: chainOf(state, filing),
    fingerprint_ok: fingerprintOk,
    figures,
  };
};
