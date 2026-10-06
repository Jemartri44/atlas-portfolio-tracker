// Writing to the ledger (ADR-0035, §2). The screens call these and never touch
// a use case directly, which is what lets the write flows be tested end to end
// over the real handler with its doubles, checking the bytes of the ledger.
//
// Four rules live here:
//   1. A write is **one unit** (an event, a pair, a chain) through the use cases
//      and `ApiLedgerStore`, with the etag of that load (`If-Match`); a conflict
//      reloads **quietly** (the form stays mounted with what was typed) and is
//      reported, never overwritten and never retried alone (FR-015).
//   2. A duplicate fingerprint and a dependent-events refusal are **outcomes**,
//      not exceptions: the interface has to ask before insisting.
//   3. The ids are fixed **before** sending. If the answer is lost, the write is
//      kept in memory as pending (`pending.ts`): once there is a connection the
//      ledger is looked for those ids, and a retry uses the same ones.
//   4. When in doubt, nothing is written. Every path that is not a clean
//      success leaves the ledger exactly as it was, or says it does not know.
//
// Separate from `actions.ts`: opening a ledger is what the boot does, writing
// to it is what a form does, and keeping them together put the write flows in
// the boot chunk.

import {
  type AffectedEvent,
  ConflictError,
  correctEvent,
  createUlidGenerator,
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
  RemoteRejectedError,
  type ReverseResult,
  recordEvent,
  reverseEvent,
  type Settings,
  type SupportedEvent,
  todayInMadrid,
  type UlidGenerator,
  type UseCaseDeps,
  WriteOutcomeUnknownError,
} from "@atlas/domain";
import type { ClosedYearImpact, Reading } from "@atlas/domain/fiscal";
import { closedYearImpact } from "@atlas/domain/fiscal";
import { reloadLedger } from "./cloud.js";
import { toAppError } from "./errors.js";
import { signedOutReason } from "./session-errors.js";
import type { AppError, RetryResult, SignedOutReason } from "./state.js";
import { requireDeps, store } from "./state.js";

export type WriteFailure =
  | { kind: "duplicate"; existing: readonly string[] }
  | { kind: "conflict" }
  | { kind: "dependents"; target: string; affected: readonly AffectedEvent[]; settings: boolean }
  /** The session is gone: nothing was written; signing in again keeps the screen. */
  | { kind: "signed_out"; reason: SignedOutReason }
  /** Sent, and the answer never came whole: it is kept as pending and looked for (`pending.ts`). */
  | { kind: "unknown" }
  | { kind: "error"; error: AppError };

export type WriteResult<T> = { ok: true; value: T } | { ok: false; failure: WriteFailure };

/**
 * Has the ledger changed since the screen read it? The use cases load the
 * ledger themselves and append with the etag of **their own** load, which
 * protects the write but says nothing about what the user was looking at. A
 * form can stay open for minutes while another device writes, so the etag of
 * the snapshot is compared before writing: the preview the user confirmed has
 * to belong to the ledger that is in the cloud (FR-015).
 */
const changedUnderneath = async (deps: UseCaseDeps): Promise<boolean> => {
  const snapshot = store.snapshot();
  if (snapshot === undefined) {
    return false;
  }
  const { etag } = await deps.store.load();
  return etag !== snapshot.etag;
};

/** The ids of a write, chosen now: the ledger is looked for them if the answer is lost. */
const reserve = (count: number): string[] => {
  const ids = createUlidGenerator(requireDeps());
  return Array.from({ length: count }, () => ids.next());
};

/** A generator that hands out exactly the ids already chosen, in order. */
const replay = (ids: readonly string[]): UlidGenerator => {
  const queue = [...ids];
  return { next: () => queue.shift() as string };
};

const BLOCKED_BY_PENDING: AppError = {
  code: "write_pending",
  message:
    "Todavía no se sabe si la última operación quedó registrada. Mira el aviso de arriba y resuélvelo antes de registrar otra cosa.",
};

/**
 * One attempt to write, translating every answer the interface has to act on.
 * A clean success reloads (the screen refreshes); a conflict reloads **quietly**
 * so what the person typed is still there to see the preview again.
 */
const attempt = async <T>(run: () => Promise<T>): Promise<WriteResult<T>> => {
  store.setWriting(true);
  try {
    if (await changedUnderneath(requireDeps())) {
      await reloadLedger({ quiet: true });
      return { ok: false, failure: { kind: "conflict" } };
    }
    const value = await run();
    store.setWriting(false);
    await reloadLedger();
    return { ok: true, value };
  } catch (error) {
    if (error instanceof DuplicateFingerprintError) {
      return { ok: false, failure: { kind: "duplicate", existing: error.existing } };
    }
    if (error instanceof ConflictError) {
      // The ledger changed underneath: read it again, in silence, so the preview
      // is built again on what is there now. Nothing was written (FR-015).
      await reloadLedger({ quiet: true });
      return { ok: false, failure: { kind: "conflict" } };
    }
    if (error instanceof WriteOutcomeUnknownError) {
      return { ok: false, failure: { kind: "unknown" } };
    }
    const reason = signedOutReason(error);
    if (reason !== undefined) {
      return { ok: false, failure: { kind: "signed_out", reason } };
    }
    if (error instanceof RemoteRejectedError && error.accepted > 0) {
      // Written only in part (it should not happen): what is there is what counts.
      await reloadLedger({ quiet: true });
    }
    // The refusal of `acceptInvalid` on the cloud ledger is not a list of
    // dependants to rectify, nor the question of ADR-0015 again: it is said.
    if (error instanceof DependentEventsError && error.code !== "accept_invalid_while_synced") {
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

/** What a retry of a pending write makes of an attempt: one of the four things it can end in. */
const resultOfRetry = <T>(result: WriteResult<T>, id: string): RetryResult => {
  if (result.ok) {
    return { kind: "done", id };
  }
  switch (result.failure.kind) {
    case "unknown":
      return { kind: "unknown" };
    case "conflict":
      return { kind: "conflict" };
    case "error":
      return { kind: "refused", message: result.failure.error.message };
    case "signed_out":
      return {
        kind: "refused",
        message:
          "Tu sesión ha terminado: entra de nuevo y vuelve a intentarlo. No se ha guardado nada.",
      };
    case "duplicate":
      return {
        kind: "refused",
        message:
          "Se parece a otra operación ya registrada: no se ha guardado. Revísala en Movimientos.",
      };
    case "dependents":
      return {
        kind: "refused",
        message: "Otras operaciones dependen de esta: no se ha guardado. Rectifícalas antes.",
      };
  }
};

/**
 * Runs a write with its ids fixed beforehand. If the answer is lost, it stays in
 * memory as pending, with a way to send it again **with the same ids**, and
 * nothing else may be recorded until it is settled.
 *
 * Exported for the one write that is not a use case of the barrel: the chain
 * of ECB rate corrections (feature 012, block 6), which lives behind the door
 * of the ECB so that nothing of it lands where the forms are.
 */
export const runWrite = async <T>(
  run: () => Promise<T>,
  ids: readonly string[] = [],
): Promise<WriteResult<T>> => {
  if (store.pending() !== undefined) {
    return { ok: false, failure: { kind: "error", error: BLOCKED_BY_PENDING } };
  }
  const result = await attempt(run);
  if (!result.ok && result.failure.kind === "unknown") {
    store.setPending({
      ids,
      state: "unknown",
      retry: async () => resultOfRetry(await attempt(run), ids[0] ?? ""),
    });
    // With a connection (a `5xx`), the answer is looked for at once; without one, when it returns.
    void import("./pending.js").then((pending) => pending.settlePending());
  }
  return result;
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
): Promise<WriteResult<RecordResult<E>>> => {
  const ids = reserve(1);
  return runWrite(
    () => recordEvent<E>(requireDeps(), draft, { ...options, id: ids[0] as string }),
    ids,
  );
};

export const reverse = async (id: string, reason: string): Promise<WriteResult<ReverseResult>> => {
  const ids = reserve(1);
  return runWrite(() => reverseEvent(requireDeps(), id, reason, { id: ids[0] as string }), ids);
};

export const correct = async <E extends SupportedEvent>(
  id: string,
  draft: Draft<E>,
  reason: string,
  options: RecordOptions = {},
): Promise<WriteResult<{ event: E; priorYear: boolean }>> => {
  // The reversal and the corrected event, in that order (`prepareCorrection`).
  const ids = reserve(2);
  return runWrite(async () => {
    const result = await correctEvent<E>(requireDeps(), id, draft, reason, {
      ...options,
      ids: replay(ids),
    });
    return { event: result.event, priorYear: result.priorYear };
  }, ids);
};

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

/**
 * `acceptInvalid` is the explicit yes of ADR-0015 — and the cloud ledger never
 * accepts an invalid projection (ADR-0035, §4): the domain refuses it because
 * the ledger is always synced, and the API would too.
 */
export const changeSettings = async (
  settings: Settings,
  acceptInvalid = false,
): Promise<WriteResult<RecordResult>> => {
  const ids = reserve(1);
  return runWrite(
    () =>
      recordEvent(
        requireDeps(),
        { type: "settings_changed", settings },
        acceptInvalid
          ? { id: ids[0] as string, acceptInvalid: true, syncConfigured: true }
          : { id: ids[0] as string },
      ),
    ids,
  );
};
