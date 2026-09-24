// Saving an operation as a draft, from a form (feature 012, block 5). Apart
// from `draft-store.ts` so that the counter of the frame does not carry the
// write flows with it.
//
// The rules are the domain's (`preparePendingDraft`): only an operation whose
// ECB rate is not published yet, checked by the ledger's own preview on
// everything but the rate, and saved **without** a rate.

import {
  DEFAULT_LOCAL_CONFIG,
  draftRecordedAs,
  preparePendingDraft,
  recordPendingDraft,
} from "@atlas/domain/ecb";
import type { WebHistory } from "../ecb/history.js";
import { doneUrl } from "../routes/movimientos/Rectified.jsx";
import { refreshDrafts, drafts as store } from "./draft-store.js";
import { store as ledger, requireDeps } from "./state.js";
import { runWrite, type WriteResult } from "./write.js";

export interface SavedDraft {
  id: string;
  /** Recorded events with the same fingerprint, said before the user leaves. */
  duplicates: string[];
}

/** Checks and saves; a refusal is thrown as the domain raised it, for the form to place. */
export const saveDraft = async (
  event: Record<string, unknown>,
  web: WebHistory | undefined,
): Promise<SavedDraft> => {
  const prepared = await preparePendingDraft(
    requireDeps(),
    web?.history,
    web?.staleDays ?? DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days,
    event,
  );
  await store.save(prepared.draft);
  refreshDrafts();
  return { id: prepared.draft.id, duplicates: prepared.duplicates };
};

/**
 * Records a draft from its form, the way the domain does it
 * (`recordPendingDraft`): the id is stamped on the draft before writing, the
 * event is written with it, then the draft goes. Answers like any record — a
 * duplicate is the question of ADR-0012 —, with the address to go to:
 *
 * - the draft is in the ledger already, by **exactly** its stamped id (a
 *   confirmation cut before removing it): it is removed, nothing written, and
 *   the list says so;
 * - written, but the draft could not be removed: the list says that too — the
 *   reload of the ledger takes the form away with anything it would say.
 *
 * `undefined` when the draft is no longer in this browser.
 */
export const confirmDraft = async (
  id: string,
  event: Record<string, unknown>,
  confirmDuplicate: boolean,
): Promise<WriteResult<string> | undefined> => {
  const draft = (await store.list()).drafts.find((entry) => entry.id === id);
  if (draft === undefined) {
    return undefined;
  }
  const already = draftRecordedAs(ledger.snapshot()?.events ?? [], draft);
  if (already.length > 0) {
    await store.remove(id);
    refreshDrafts();
    return { ok: true, value: `/registrar/borradores?ya=${already[0]}` };
  }
  const result = await runWrite(() =>
    recordPendingDraft(requireDeps(), store, draft, event, { confirmDuplicate }),
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
