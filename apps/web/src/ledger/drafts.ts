// Saving an operation as a draft, and confirming one, from the forms (feature
// 027, E6 of ADR-0035). Apart from `draft-store.ts` so that the counter of the
// frame does not carry the write flows with it.
//
// The rules are the domain's (`preparePendingDraft`, `recordPendingDraft`): only
// an operation whose ECB rate is not published yet, checked by the ledger's own
// preview on everything but the rate, and saved **without** a rate. The drafts
// are in the cloud, so every call can fail for want of a connection, and the
// answer to a save can be lost: the id of the draft is fixed before sending and
// a retry sends the same one, so it is never saved twice.

import { createUlidGenerator, type Ulid } from "@atlas/domain";
import {
  DEFAULT_LOCAL_CONFIG,
  DraftChangedError,
  draftRecordedAs,
  type PendingDraft,
  preparePendingDraft,
  recordPendingDraft,
} from "@atlas/domain/ecb";
import { RemoteError } from "@atlas/domain/sync";
import type { WebHistory } from "../ecb/history.js";
import { doneUrl } from "../routes/movimientos/Rectified.jsx";
import { closeDraft, drafts, findDraft, refreshDrafts } from "./draft-store.js";
import { toAppError } from "./errors.js";
import { signedOutReason } from "./session-errors.js";
import { type AppError, store as ledger, requireDeps, type SignedOutReason } from "./state.js";
import { runWrite, type WriteFailure, type WriteResult } from "./write.js";

export interface SavedDraft {
  id: string;
  /** Recorded events with the same fingerprint, said before the user leaves. */
  duplicates: string[];
}

export type SaveFailure =
  /** Sent, and the answer never came whole: the same draft is sent again to settle it. */
  | { kind: "unknown"; draft: PendingDraft }
  | { kind: "signed_out"; reason: SignedOutReason }
  /** Nothing was saved. */
  | { kind: "error"; error: AppError };

export type SaveResult = { ok: true; value: SavedDraft } | { ok: false; failure: SaveFailure };

/**
 * Checks and saves. A refusal of the operation is thrown as the domain raised
 * it, for the form to place; whatever the cloud did is a result. `again` is the
 * draft of an attempt whose answer was lost: its id is the one sent again.
 */
export const saveDraft = async (
  event: Record<string, unknown>,
  web: WebHistory | undefined,
  again?: PendingDraft,
): Promise<SaveResult> => {
  let sent: PendingDraft | undefined;
  try {
    const prepared = await preparePendingDraft(
      requireDeps(),
      web?.history,
      web?.staleDays ?? DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days,
      event,
    );
    const draft =
      again === undefined
        ? prepared.draft
        : { ...prepared.draft, id: again.id, saved_at: again.saved_at };
    sent = draft;
    try {
      await drafts().save(draft);
    } catch (error) {
      // The first attempt did arrive: it is saved, and said so.
      if (!(again !== undefined && error instanceof RemoteError && error.code === "draft_exists")) {
        throw error;
      }
    }
    refreshDrafts();
    return { ok: true, value: { id: draft.id, duplicates: prepared.duplicates } };
  } catch (error) {
    if (!(error instanceof RemoteError)) {
      throw error;
    }
    const reason = signedOutReason(error);
    if (reason !== undefined) {
      return { ok: false, failure: { kind: "signed_out", reason } };
    }
    // A lost answer, a `5xx` or a gateway refusal: the draft may be saved, so the same id is sent again.
    const lost =
      error.code === "network_failed" ||
      error.code === "transport_rejected" ||
      (error.status !== undefined && error.status >= 500);
    if (lost && sent !== undefined) {
      return { ok: false, failure: { kind: "unknown", draft: sent } };
    }
    return { ok: false, failure: { kind: "error", error: toAppError(error) } };
  }
};

/** What a cloud failure outside a write is, for the screens that read or close drafts. */
const failureOf = (error: unknown): WriteFailure => {
  const reason = signedOutReason(error);
  return reason === undefined
    ? { kind: "error", error: toAppError(error) }
    : { kind: "signed_out", reason };
};

/**
 * Records a draft from its form, the way the domain does it
 * (`recordPendingDraft`): the id is stamped on the draft before writing, the
 * event is written with it, then the draft is closed as confirmed. Answers like
 * any record — a duplicate is the question of ADR-0012 —, with the address to
 * go to:
 *
 * - the draft is in the ledger already, by **exactly** its stamped id (a
 *   confirmation cut before closing it): it is closed, nothing written, and the
 *   list says so;
 * - written, but the draft could not be closed: the list says that too — the
 *   reload of the ledger takes the form away with anything it would say.
 *
 * A draft closed or stamped elsewhere is refused (`draft_changed`), never
 * recorded as a new operation.
 */
export const confirmDraft = async (
  id: string,
  event: Record<string, unknown>,
  confirmDuplicate: boolean,
): Promise<WriteResult<string>> => {
  let draft: PendingDraft | undefined;
  try {
    draft = await findDraft(id);
  } catch (error) {
    return { ok: false, failure: failureOf(error) };
  }
  if (draft === undefined) {
    // Confirmed or discarded elsewhere: said, and **nothing** recorded — never
    // the operation as a new one (third review of PR #75).
    return {
      ok: false,
      failure: { kind: "error", error: toAppError(new DraftChangedError(id, "gone")) },
    };
  }
  const already = draftRecordedAs(ledger.snapshot()?.events ?? [], draft);
  if (already.length > 0) {
    try {
      await closeDraft(id, { outcome: "confirmed", eventId: already[0] as Ulid });
    } catch {
      return { ok: true, value: `/registrar/borradores?no-quitado=${already[0]}` };
    }
    return { ok: true, value: `/registrar/borradores?ya=${already[0]}` };
  }
  // The id is fixed **now**, so a retry after a lost answer writes with the same one.
  const eventId = draft.pending_event_id ?? createUlidGenerator(requireDeps()).next();
  const stamped: PendingDraft = { ...draft, pending_event_id: eventId };
  const result = await runWrite(
    () => recordPendingDraft(requireDeps(), drafts(), stamped, event, { confirmDuplicate }),
    [eventId],
  );
  refreshDrafts();
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    value: result.value.draftRemoved
      ? doneUrl(result.value.event.id, "registrado", false)
      : `/registrar/borradores?no-quitado=${result.value.event.id}`,
  };
};
