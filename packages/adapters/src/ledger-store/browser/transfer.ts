// `@atlas/adapters/transfer`: the export and the import of the ledger of this
// browser, a subpath of its own and loaded lazily — the boot opens and writes
// the ledger, it never exports or imports it (review of PR #75, which found
// both on the boot path).
//
// Both are one read-write transaction over the same record the ledger lives
// in (`indexeddb.ts`), for the reasons of feature 012, block 0.

import { sha256Hex } from "@atlas/domain";
import { openAtlasDb } from "./idb.js";
import {
  CURRENT_KEY,
  META_KEY,
  type Opener,
  type StoredLedger,
  type StoredMeta,
  transact,
} from "./indexeddb.js";

const encoder = new TextEncoder();

/**
 * The text to export, and the date of this export recorded **in the same
 * transaction**: the date can never claim an export that did not include the
 * last line recorded (feature 012, D4). Only the date is written; the text of
 * the ledger is not touched. No date when there is no ledger.
 */
export const exportLedgerText = (when: Date, open: Opener = openAtlasDb): Promise<string> =>
  transact<string>(open, "readwrite", (store, _tx, settle) => {
    const get = store.get(CURRENT_KEY);
    get.onsuccess = () => {
      const stored = get.result as StoredLedger | undefined;
      if (stored !== undefined) {
        const meta: StoredMeta = { lastExportAt: when.toISOString() };
        store.put(meta, META_KEY);
      }
      settle.ok(stored?.text ?? "");
    };
  });

/** The ledger of this browser changed between the question and the yes. */
export class LedgerChangedSinceAsked extends Error {
  constructor(
    /** Lines of the ledger now, which the user did not see when saying yes. */
    readonly lines: number,
  ) {
    super(`the ledger changed since the import was asked for; it now has ${lines} lines`);
    this.name = "LedgerChangedSinceAsked";
  }
}

/** The etag of a text, as the import plan records it. */
export const etagOfText = (text: string): string => sha256Hex(encoder.encode(text));

/**
 * Replaces the whole ledger with an imported file: a deliberate overwrite,
 * asked for with the numbers of the ledger **as it was when asking** — so it
 * is refused, and nothing written, if another tab recorded a line between the
 * question and the yes (review of PR #75): the confirmation was about another
 * ledger. The caller validates the text before. The date of the last export
 * belonged to the ledger being replaced, so it goes with it (D4).
 */
export const replaceLedgerText = (
  text: string,
  expectedEtag: string,
  open: Opener = openAtlasDb,
): Promise<void> =>
  transact<void>(open, "readwrite", (store, _tx, settle) => {
    const get = store.get(CURRENT_KEY);
    get.onsuccess = () => {
      const current = (get.result as StoredLedger | undefined)?.text ?? "";
      if (etagOfText(current) !== expectedEtag) {
        settle.fail(
          new LedgerChangedSinceAsked(current.split("\n").filter((line) => line !== "").length),
        );
        return;
      }
      const record: StoredLedger = { text, updatedAt: new Date().toISOString() };
      store.put(record, CURRENT_KEY);
      store.delete(META_KEY).onsuccess = () => settle.ok(undefined);
    };
  });
