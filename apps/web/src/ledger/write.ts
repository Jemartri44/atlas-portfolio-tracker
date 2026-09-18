// Writing to the ledger. The screens call these and never touch a use case
// directly, which is what lets the write flows be tested end to end **without a
// DOM**, checking the bytes of the file (Q8, D16 of the 006).
//
// Three rules live here:
//   1. Writing goes through the domain use cases with the etag of that load; a
//      conflict reloads and is reported, never overwritten (FR-015).
//   2. A duplicate fingerprint and a dependent-events refusal are **outcomes**,
//      not exceptions: the interface has to ask before insisting.
//   3. Ante la duda, no se escribe. Every path that is not a clean success
//      leaves the ledger exactly as it was.
//
// Separate from `actions.ts` since feature 007: opening a ledger is what the
// boot does, writing to it is what a form does, and keeping them in one module
// meant the boot chunk carried the write flows.

import {
  type AffectedEvent,
  ConflictError,
  correctEvent,
  DependentEventsError,
  type Draft,
  DuplicateFingerprintError,
  type EventPreview,
  type PreviewOptions,
  previewEvent,
  type RecordOptions,
  type RecordResult,
  type ReverseResult,
  recordEvent,
  reverseEvent,
  type Settings,
  type SupportedEvent,
  type UseCaseDeps,
} from "@atlas/domain";
import { reloadLedger, toAppError } from "./actions.js";
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

export const changeSettings = async (
  settings: Settings,
  options: RecordOptions = {},
): Promise<WriteResult<RecordResult>> =>
  write(() => recordEvent(requireDeps(), { type: "settings_changed", settings }, options));
