// The drafts of this browser (feature 012, block 5; ADR-0029, point 9), as
// the frame and the list of drafts see them: how many there are, and the
// drafts themselves. Loaded **lazily**, with the counter of the frame and with
// the screens that need it: nothing of the ECB is on the boot path (decision
// (r) of prompt 012).
//
// A draft is not a fact: nothing here projects one, and nothing here records
// one. Recording a draft is the form's, after the user's yes.

import { BrowserDraftStore } from "@atlas/adapters/drafts";
import type { PendingDraft } from "@atlas/domain/ecb";

export const drafts = new BrowserDraftStore();

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
    const { drafts: list, unreadable } = await drafts.list();
    return list.length + unreadable.length;
  } catch {
    // The browser keeps no data, or another tab blocks the upgrade: the
    // ledger's own screens already say which. The counter just says nothing.
    return undefined;
  }
};

/** After saving, recording or discarding one. */
export const refreshDrafts = (): void => {
  window.dispatchEvent(new Event(DRAFTS_CHANGED));
};

export const listDrafts = (): Promise<{ drafts: PendingDraft[]; unreadable: string[] }> =>
  drafts.list();

export const findDraft = async (id: string): Promise<PendingDraft | undefined> =>
  (await drafts.list()).drafts.find((draft) => draft.id === id);

export const discardDraft = async (id: string): Promise<void> => {
  await drafts.remove(id);
  refreshDrafts();
};
