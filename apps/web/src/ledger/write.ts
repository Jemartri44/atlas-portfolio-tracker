// Writing to the ledger. The screens call these and never touch a use case
// directly, which is what lets the write flows be tested end to end **without a
// DOM**, checking the bytes of the file (Q8, D16 of the 006).
//
// Three rules live here:
//   1. Writing goes through the domain use cases with the etag of that load; a
//      conflict reloads and is reported, never overwritten (FR-015).
//   2. A duplicate fingerprint and a dependent-events refusal are **outcomes**,
//      not exceptions: the interface has to ask before insisting.
//   3. When in doubt, nothing is written. Every path that is not a clean
//      success leaves the ledger exactly as it was.
//
// Separate from `actions.ts` since feature 007: opening a ledger is what the
// boot does, writing to it is what a form does, and keeping them in one module
// meant the boot chunk carried the write flows.

import {
  type AffectedEvent,
  ConflictError,
  correctEvent,
  DependentEventsError,
  DomainError,
  type Draft,
  DuplicateFingerprintError,
  type EventPreview,
  type LedgerEvent,
  type PreviewOptions,
  previewCorrection,
  previewEvent,
  previewReversal,
  type RecordOptions,
  type RecordResult,
  type ReverseResult,
  recordEvent,
  reverseEvent,
  type Settings,
  type SupportedEvent,
  todayInMadrid,
  type UseCaseDeps,
} from "@atlas/domain";
import type { ClosedYearImpact, Reading } from "@atlas/domain/fiscal";
import { closedYearImpact } from "@atlas/domain/fiscal";
import { reloadLedger } from "./actions.js";
import { toAppError } from "./errors.js";
import type { AppError } from "./state.js";
import { requireDeps, store } from "./state.js";

export type WriteFailure =
  | { kind: "duplicate"; existing: readonly string[] }
  | { kind: "conflict" }
  | { kind: "dependents"; target: string; affected: readonly AffectedEvent[]; settings: boolean }
  | { kind: "error"; error: AppError };

export type WriteResult<T> = { ok: true; value: T } | { ok: false; failure: WriteFailure };

/**
 * Has the ledger changed since the screen read it? The use cases load the
 * ledger themselves and append with the etag of **their own** load, which
 * protects the write but says nothing about what the user was looking at. On a
 * phone a form can stay open for minutes while the CLI writes, so the etag of
 * the snapshot is compared before writing: the preview the user confirmed has
 * to belong to the ledger that is on disk (FR-015).
 */
const changedUnderneath = async (deps: UseCaseDeps): Promise<boolean> => {
  const snapshot = store.snapshot();
  if (snapshot === undefined) {
    return false;
  }
  const { etag } = await deps.store.load();
  return etag !== snapshot.etag;
};

/** Runs a write, translating the three answers the interface has to act on. */
const write = async <T>(run: () => Promise<T>): Promise<WriteResult<T>> => {
  store.setWriting(true);
  try {
    if (await changedUnderneath(requireDeps())) {
      await reloadLedger();
      return { ok: false, failure: { kind: "conflict" } };
    }
    const value = await run();
    await reloadLedger();
    return { ok: true, value };
  } catch (error) {
    if (error instanceof DuplicateFingerprintError) {
      return { ok: false, failure: { kind: "duplicate", existing: error.existing } };
    }
    if (error instanceof ConflictError) {
      // The file changed underneath: reload so the preview is built again on
      // what is there now. Nothing was written (FR-015).
      await reloadLedger();
      return { ok: false, failure: { kind: "conflict" } };
    }
    if (error instanceof DependentEventsError) {
      return {
        ok: false,
        failure: {
          kind: "dependents",
          target: String(error.details.target_id ?? ""),
          affected: error.affected,
          settings: error.code === "newly_invalid_events",
        },
      };
    }
    return { ok: false, failure: { kind: "error", error: toAppError(error) } };
  } finally {
    store.setWriting(false);
  }
};

/** The preview of a candidate, straight from the domain use case (decision (h)). */
export const previewDraft = async <E extends SupportedEvent>(
  draft: Draft<E>,
  options: PreviewOptions = {},
): Promise<EventPreview<E>> => previewEvent(requireDeps(), draft, options);

/**
 * The preview of a correction: the original reversed and the corrected event
 * in its place, the pair `correct` writes (`previewCorrection`, in the domain).
 */
export const previewCorrectionDraft = async <E extends SupportedEvent>(
  id: string,
  draft: Draft<E>,
  reason: string,
): Promise<EventPreview<E>> => previewCorrection(requireDeps(), id, draft, reason);

export const recordDraft = async <E extends SupportedEvent>(
  draft: Draft<E>,
  options: RecordOptions = {},
): Promise<WriteResult<RecordResult<E>>> =>
  write(() => recordEvent<E>(requireDeps(), draft, options));

export const reverse = async (id: string, reason: string): Promise<WriteResult<ReverseResult>> =>
  write(() => reverseEvent(requireDeps(), id, reason));

export const correct = async <E extends SupportedEvent>(
  id: string,
  draft: Draft<E>,
  reason: string,
  options: RecordOptions = {},
): Promise<WriteResult<{ event: E; priorYear: boolean }>> =>
  write(async () => {
    const result = await correctEvent<E>(requireDeps(), id, draft, reason, options);
    return { event: result.event, priorYear: result.priorYear };
  });

/**
 * Which filed returns a change would reach, and how much it moves of each
 * declared figure (ADR-0020, amended; prompt 010, FR-018).
 *
 * The screens ask this **before** the question, which is the only moment it is
 * useful; it never refuses anything. The fast path is the one that matters: a
 * ledger with nothing filed —every ledger today— stops at reading the file,
 * without a single projection.
 *
 * Best effort on purpose: when the candidate cannot even be built, nothing is
 * said here and the write raises the same error right after, with its own
 * message. A warning that throws would turn a filing into a locked ledger.
 */
const impactOf = async (
  candidates: (deps: UseCaseDeps, events: readonly LedgerEvent[]) => Promise<Reading>,
): Promise<readonly ClosedYearImpact[]> => {
  try {
    const deps = requireDeps();
    const { events } = await deps.store.load();
    if (!events.some((event) => event.type === "tax_return_filed")) {
      return [];
    }
    return closedYearImpact({ events }, await candidates(deps, events), todayInMadrid(deps.clock));
  } catch (error) {
    if (error instanceof DomainError) {
      return [];
    }
    throw error;
  }
};

/** For something about to be recorded: the draft with everything it drags along. */
export const closedYearsOfDraft = async (
  draft: Draft<SupportedEvent>,
  options: PreviewOptions = {},
): Promise<readonly ClosedYearImpact[]> =>
  impactOf(async (deps, events) => ({
    events: [...events, ...(await previewEvent(deps, draft, options)).candidates],
  }));

/** For a correction: the pair `correct` writes, the reversal and the new event. */
export const closedYearsOfCorrection = async (
  id: string,
  draft: Draft<SupportedEvent>,
  reason: string,
): Promise<readonly ClosedYearImpact[]> =>
  impactOf(async (deps, events) => ({
    events: [...events, ...(await previewCorrection(deps, id, draft, reason)).candidates],
  }));

/** For an annulment, which moves a figure exactly as recording one does. */
export const closedYearsOfReversal = async (
  id: string,
  reason: string,
): Promise<readonly ClosedYearImpact[]> =>
  impactOf(async (deps, events) => ({
    events: [...events, ...(await previewReversal(deps, id, reason)).candidates],
  }));

/**
 * And for a settings change, where not a single event moves: the same ledger
 * read with other rules can empty a year that was filed (feature 009, Q12).
 */
export const closedYearsOfSettings = async (
  settings: Settings,
): Promise<readonly ClosedYearImpact[]> =>
  impactOf(async (_deps, events) => ({ events, settings }));

export const changeSettings = async (
  settings: Settings,
  options: RecordOptions = {},
): Promise<WriteResult<RecordResult>> =>
  write(() => recordEvent(requireDeps(), { type: "settings_changed", settings }, options));
