import type { PendingDraft } from "../ecb/drafts.js";
import type { Ulid } from "../ids/ulid.js";

/**
 * How a draft ends. The local stores just take it away; the cloud store
 * (ADR-0035, E6) cannot delete anything, so it records the way it ended.
 * `eventId` is the id the draft was stamped with: the event it became.
 */
export type DraftEnd =
  | { readonly outcome: "confirmed"; readonly eventId: Ulid }
  | { readonly outcome: "discarded" };

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
  /**
   * The same draft, written again with the id its confirmation stamped
   * (`pending_event_id`) — **only if it is still there and as it was read**:
   * without a stamp, or with exactly `readStamp`. Checked and written in one
   * step (under the lock of the folder; in one transaction of IndexedDB). If
   * not, `DraftChangedError`, and nothing is written: never re-created.
   */
  update(draft: PendingDraft, readStamp: string | undefined): Promise<void>;
  /**
   * Removing one that is not there is not an error: it is already gone.
   * `end` says how it ended (`discarded` when absent); a store that deletes
   * ignores it.
   */
  remove(id: string, end?: DraftEnd): Promise<void>;
}
