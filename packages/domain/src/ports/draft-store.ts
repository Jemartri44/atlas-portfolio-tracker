import type { PendingDraft } from "../ecb/drafts.js";

/**
 * Where the drafts of operations recorded before their ECB rate live (ADR-0029,
 * point 9): `drafts/` next to the ledger on the desktop, a store of IndexedDB
 * in the browser. **Outside the ledger**: nothing here is a fact.
 *
 * On the disk every write goes under the lock of the ledger folder (decision
 * (t) of prompt 012): the console and the web share the folder.
 */
export interface PendingDraftStore {
  /** Every draft, oldest first, and the names of the ones that cannot be read. */
  list(): Promise<{ drafts: PendingDraft[]; unreadable: string[] }>;
  /** A new draft: never over one with the same id. */
  save(draft: PendingDraft): Promise<void>;
  /** The same draft, written again: the id its confirmation stamped (`pending_event_id`). */
  update(draft: PendingDraft): Promise<void>;
  /** Removing one that is not there is not an error: it is already gone. */
  remove(id: string): Promise<void>;
}
