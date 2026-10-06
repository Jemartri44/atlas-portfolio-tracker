// The drafts of the account (feature 027, E6 of ADR-0035; ADR-0029, point 9), as
// the frame and the list of drafts see them: how many there are, and the drafts
// themselves. They live **in the cloud**, behind the same session as the ledger,
// and nothing of them stays on the device: no copy, no cache, no queue.
//
// Loaded **lazily**, with the counter of the frame and with the screens that
// need it: nothing of the ECB is on the boot path (decision (r) of prompt 012).
//
// A draft is not a fact: nothing here projects one, and nothing here records
// one. Recording a draft is the form's, after the user's yes.

import { ApiDraftStore } from "@atlas/adapters/drafts-http";
import type { DraftEnd, PendingDraft } from "@atlas/domain/ecb";
import { cloudFetch } from "./cloud.js";

/** The store over the API, at the page's own origin and with the session of the boot. */
export const drafts = (): ApiDraftStore => new ApiDraftStore({ origin: "", fetch: cloudFetch() });

/**
 * Said on `window` whenever the drafts change, for the counter of the frame.
 * An event and not a signal: a signal here put Solid in a chunk of its own on
 * the boot path (measured: +0,6 KB gzip), because this module is shared by
 * lazily loaded chunks.
 */
export const DRAFTS_CHANGED = "atlas:drafts";

/** Pending drafts, readable or not; `undefined` when they cannot be read. */
export const countDrafts = async (): Promise<number | undefined> => {
  try {
    const { drafts: list, unreadable } = await drafts().list();
    return list.length + unreadable.length;
  } catch {
    // No connection or no session: the frame already says so. The counter just
    // says nothing, and a count that is not known is never shown as zero.
    return undefined;
  }
};

/** After saving, recording or discarding one. */
export const refreshDrafts = (): void => {
  window.dispatchEvent(new Event(DRAFTS_CHANGED));
};

export const findDraft = async (id: string): Promise<PendingDraft | undefined> =>
  (await drafts().list()).drafts.find((draft) => draft.id === id);

/** Closes a draft: confirmed (with the event it became) or discarded. Never deletes. */
export const closeDraft = async (id: string, end: DraftEnd): Promise<void> => {
  await drafts().remove(id, end);
  refreshDrafts();
};
