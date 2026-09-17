// Which events a candidate ledger breaks (ADR-0003 for rectification, ADR-0015
// for a settings change that reinterprets the past). One implementation, so the
// two paths cannot drift apart.

import type { AffectedEvent } from "../errors.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { InvalidEvent, LedgerState } from "../projections/state.js";
import type { LedgerEvent } from "../schema/events.js";

export interface CandidateCheck {
  /** Events that were valid in `current` and are not in `candidate`. */
  fresh: InvalidEvent[];
  /** Every invalid event of the candidate ledger, pre-existing ones included. */
  all: InvalidEvent[];
  /** The candidate ledger projected, so the caller never projects it again. */
  state: LedgerState;
}

/**
 * Projects the candidate ledger and separates what the candidate breaks from
 * what was already broken. Events already invalid in the store are never
 * attributed to the new events.
 *
 * The current ledger is only projected when the candidate does have invalid
 * events: a clean candidate cannot have broken anything, so the writing path
 * that succeeds projects exactly once.
 */
export const newlyInvalid = (
  current: readonly LedgerEvent[],
  candidate: readonly LedgerEvent[],
): CandidateCheck => {
  const state = projectLedger(candidate, { collectErrors: true });
  const all = state.invalid;
  if (all.length === 0) {
    return { fresh: [], all, state };
  }
  const baseline = new Set(
    projectLedger(current, { collectErrors: true }).invalid.map((entry) => entry.event.id),
  );
  return { fresh: all.filter((entry) => !baseline.has(entry.event.id)), all, state };
};

export const describeAffected = (entries: readonly InvalidEvent[]): AffectedEvent[] =>
  entries.map((entry) => ({
    id: entry.event.id,
    type: entry.event.type,
    error: entry.error.message,
  }));
