// `@atlas/adapters/drafts`, a subpath of its own and not part of `./browser`:
// the browser store is on the boot path of the web, and nothing of the ECB
// may be (decision (r) of prompt 012).
//
// The drafts of this browser (feature 012, block 5): operations recorded
// before their ECB rate, **outside the ledger**, one record per draft in the
// `drafts` store of the same database (version 2). Clearing the site's data
// loses them, as it loses the ledger kept here; the interface says so.

import {
  DraftChangedError,
  type PendingDraft,
  type PendingDraftStore,
  parsePendingDraft,
} from "@atlas/domain/ecb";
import { DRAFT_STORE, openAtlasDb } from "./idb.js";

/** Settles when the transaction commits, or fails with what aborted it. */
const committed = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });

export class BrowserDraftStore implements PendingDraftStore {
  constructor(private readonly open: () => Promise<IDBDatabase> = openAtlasDb) {}

  async list(): Promise<{ drafts: PendingDraft[]; unreadable: string[] }> {
    const db = await this.open();
    const tx = db.transaction(DRAFT_STORE, "readonly");
    const store = tx.objectStore(DRAFT_STORE);
    // Both in one transaction: the keys and the values of the same moment.
    const keys = store.getAllKeys();
    const values = store.getAll();
    await committed(tx);
    const drafts: PendingDraft[] = [];
    const unreadable: string[] = [];
    // Keys are ULIDs, returned in key order: the order they were saved in.
    keys.result.forEach((key, index) => {
      try {
        const draft = parsePendingDraft(String(values.result[index]));
        if (draft.id === key) {
          drafts.push(draft);
        } else {
          unreadable.push(String(key));
        }
      } catch {
        unreadable.push(String(key));
      }
    });
    return { drafts, unreadable };
  }

  async save(draft: PendingDraft): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(DRAFT_STORE, "readwrite");
    // Kept as the text a file of `drafts/` would hold: one format for both.
    tx.objectStore(DRAFT_STORE).add(JSON.stringify(draft), draft.id);
    await committed(tx);
  }

  /**
   * The same draft again, with the id its confirmation stamped — only if it is
   * still there, without a stamp or with exactly `readStamp`: read and written
   * in **one** read-write transaction (third review of PR #75). Never
   * re-creates a draft another tab confirmed.
   */
  async update(draft: PendingDraft, readStamp: string | undefined): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(DRAFT_STORE, "readwrite");
    const store = tx.objectStore(DRAFT_STORE);
    let refusal: DraftChangedError | undefined;
    const get = store.get(draft.id);
    get.onsuccess = () => {
      if (get.result === undefined) {
        refusal = new DraftChangedError(draft.id, "gone");
      } else {
        const stamp = (JSON.parse(String(get.result)) as { pending_event_id?: string })
          .pending_event_id;
        if (stamp !== undefined && stamp !== readStamp) {
          refusal = new DraftChangedError(draft.id, "stamped");
        }
      }
      if (refusal === undefined) {
        store.put(JSON.stringify(draft), draft.id);
      }
    };
    await committed(tx);
    if (refusal !== undefined) {
      throw refusal;
    }
  }

  async remove(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(DRAFT_STORE, "readwrite");
    tx.objectStore(DRAFT_STORE).delete(id);
    await committed(tx);
  }
}
