// Rectification (ADR-0003, data-schema.md §6.3): the ledger is append-only, so
// "delete" is a reversal and "edit" is a reversal plus a corrected event that
// references the original. Both re-project the ledger without the reversed
// pair and refuse to write if any other event stops being valid.

import { yearOf } from "../dates/civil-date.js";
import { todayInMadrid } from "../dates/madrid.js";
import { DependentEventsError, DuplicateFingerprintError, NotFoundError } from "../errors.js";
import { type ClosedYear, closedYearsTouched, unfiledPastYears } from "../filings/touched.js";
import { createUlidGenerator, type UlidGenerator } from "../ids/ulid.js";
import { businessDateOf, isOperationEvent, projectLedger } from "../projections/project-ledger.js";
import type { LedgerState, Warning } from "../projections/state.js";
import type { Draft, LedgerEvent, ReversalEvent, SupportedEvent } from "../schema/events.js";
import type { UseCaseDeps } from "./deps.js";
import { describeAffected, newlyInvalid } from "./invalid-events.js";
import {
  checkIsinUnique,
  completeDraft,
  duplicatesOf,
  type RecordOptions,
} from "./record-event.js";

export interface ReverseResult {
  reversal: ReversalEvent;
  /** The reversed event has its business date in a tax year before the current one: a filed return may be affected. */
  priorYear: boolean;
  /**
   * Returns already filed that this rectification reaches (ADR-0020). More
   * precise than `priorYear`, which only knows the year is past, and past is
   * not the same as filed. The **figure** it moves is put on by whoever has
   * the tax engine loaded (`closedYearImpact`).
   */
  closed: ClosedYear[];
  /** Past years with figures and no filing recorded: a note, not a warning (Q8). */
  unfiledPastYears: number[];
  warnings: Warning[];
  etag: string;
}

export interface CorrectResult<E extends SupportedEvent = SupportedEvent> extends ReverseResult {
  event: E;
}

export const findTarget = (events: readonly LedgerEvent[], targetId: string): LedgerEvent => {
  const target = events.find((event) => event.id === targetId);
  if (target === undefined) {
    throw new NotFoundError(targetId);
  }
  return target;
};

/** Whether the target's business date falls in a tax year before today's year in Europe/Madrid. */
export const isPriorYear = (
  deps: Pick<UseCaseDeps, "clock">,
  state: LedgerState,
  target: LedgerEvent,
): boolean =>
  isOperationEvent(target) &&
  yearOf(businessDateOf(state, target)) < yearOf(todayInMadrid(deps.clock));

/**
 * Checks the candidate ledger and separates the new events' own failures from
 * the events they would break (shared with `recordEvent`, see `newlyInvalid`).
 */
export const checkCandidate = (
  current: readonly LedgerEvent[],
  candidate: readonly LedgerEvent[],
  newIds: readonly string[],
  targetId: string,
): LedgerState => {
  const { fresh, state } = newlyInvalid(current, candidate);
  const own = fresh.find((entry) => newIds.includes(entry.event.id));
  if (own !== undefined) {
    throw own.error;
  }
  if (fresh.length > 0) {
    throw new DependentEventsError(targetId, describeAffected(fresh));
  }
  return state;
};

export const reverseEvent = async (
  deps: UseCaseDeps,
  targetId: string,
  reason: string,
): Promise<ReverseResult> => {
  const { events, etag } = await deps.store.load();
  const target = findTarget(events, targetId);
  const reversal = completeDraft<ReversalEvent>(
    deps,
    { type: "reversal", reverses_id: targetId, reason },
    createUlidGenerator(deps).next(),
  );
  const candidate = [...events, reversal];
  const state = checkCandidate(events, candidate, [reversal.id], targetId);
  const today = todayInMadrid(deps.clock);
  const appended = await deps.store.append([reversal], etag);
  return {
    reversal,
    priorYear: isPriorYear(deps, state, target),
    closed: closedYearsTouched(events, candidate, today, state),
    unfiledPastYears: unfiledPastYears(today, state),
    warnings: [],
    etag: appended.etag,
  };
};

/** The pair a correction appends, and the ledger as it would be after it. */
export interface PreparedCorrection<E extends SupportedEvent = SupportedEvent> {
  target: LedgerEvent;
  reversal: ReversalEvent;
  event: E;
  /** The candidate ledger, projected: the original reversed and the corrected in its place. */
  state: LedgerState;
}

/**
 * Builds and checks a correction exactly as it will be written: the reversal
 * of the original and the corrected event, over the ledger as loaded. It is
 * **the** definition of what a correction does, shared by `correctEvent`, which
 * writes it, and by `previewCorrection`, which shows it: a preview that added
 * the corrected event on top of the original counted a corrected deposit of
 * 8.000 € on top of the 8.700 € it replaced (review of 2026-09-19).
 */
export const prepareCorrection = <E extends SupportedEvent>(
  deps: UseCaseDeps,
  events: readonly LedgerEvent[],
  targetId: string,
  replacement: Draft<E>,
  reason: string,
  ids: UlidGenerator = createUlidGenerator(deps),
): PreparedCorrection<E> => {
  const target = findTarget(events, targetId);
  const reversal = completeDraft<ReversalEvent>(
    deps,
    { type: "reversal", reverses_id: targetId, reason },
    ids.next(),
  );
  const event = completeDraft<E>(
    deps,
    { ...replacement, corrects_id: targetId } as Draft<E>,
    ids.next(),
  );
  const state = checkCandidate(
    events,
    [...events, reversal, event],
    [reversal.id, event.id],
    targetId,
  );
  // A correction introduces an ISIN exactly as a new event does.
  checkIsinUnique(state, event, () => projectLedger(events, { collectErrors: true }));
  return { target, reversal, event, state };
};

export const correctEvent = async <E extends SupportedEvent>(
  deps: UseCaseDeps,
  targetId: string,
  replacement: Draft<E>,
  reason: string,
  options: RecordOptions = {},
): Promise<CorrectResult<E>> => {
  const { events, etag } = await deps.store.load();
  const { target, reversal, event, state } = prepareCorrection(
    deps,
    events,
    targetId,
    replacement,
    reason,
    options.ids,
  );
  const duplicates = duplicatesOf(state.fingerprints, event);
  if (duplicates.length > 0 && options.confirmDuplicate !== true) {
    throw new DuplicateFingerprintError((event as { fingerprint: string }).fingerprint, duplicates);
  }
  const today = todayInMadrid(deps.clock);
  const appended = await deps.store.append([reversal, event], etag);
  return {
    reversal,
    event,
    priorYear: isPriorYear(deps, state, target),
    closed: closedYearsTouched(events, [...events, reversal, event], today, state),
    unfiledPastYears: unfiledPastYears(today, state),
    warnings: state.warnings.filter((warning) => warning.event_id === event.id),
    etag: appended.etag,
  };
};
