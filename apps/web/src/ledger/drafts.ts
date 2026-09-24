// Saving an operation as a draft, from a form (feature 012, block 5). Apart
// from `draft-store.ts` so that the counter of the frame does not carry the
// write flows with it.
//
// The rules are the domain's (`preparePendingDraft`): only an operation whose
// ECB rate is not published yet, checked by the ledger's own preview on
// everything but the rate, and saved **without** a rate.

import { DEFAULT_LOCAL_CONFIG, preparePendingDraft } from "@atlas/domain/ecb";
import type { WebHistory } from "../ecb/history.js";
import { refreshDrafts, drafts as store } from "./draft-store.js";
import { requireDeps } from "./state.js";

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
