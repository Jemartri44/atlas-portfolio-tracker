// `@atlas/adapters/transfer`: the export and the import of the ledger of this
// browser, a subpath of its own and loaded lazily — the boot opens and writes
// the ledger, it never exports or imports it (review of PR #75, which found
// both on the boot path).
//
// Both are one read-write transaction over the same record the ledger lives
// in (`indexeddb.ts`), for the reasons of feature 012, block 0.

import { sha256Hex } from "@atlas/domain";
import {
  importPermission,
  parseHeld,
  RefusedError,
  syncConfiguredByText,
  unresolvedHeld,
} from "@atlas/domain/sync";
import { openAtlasDb } from "./idb.js";
import {
  CURRENT_KEY,
  META_KEY,
  type Opener,
  type StoredLedger,
  type StoredMeta,
  transact,
} from "./indexeddb.js";

// The keys of the state of the sync (`sync-store.ts`), written again here so
// that the import and the export do not share a chunk with the store of the
// sync: a shared chunk is a name more in the table of the boot. The tests of
// the import hold them equal, by setting the keys of the store and expecting
// the refusal.
const SYNC_STATE_KEY = "sync:state";
const SYNC_HELD_KEY = "sync:held";
const SYNC_DISCARDED_KEY = "sync:discarded";
const SYNC_DEVICE_KEY = "sync:device";

const encoder = new TextEncoder();

/** What an export hands over (§6.2 P3; review of PR #97, security B2 and N3). */
export interface LedgerExport {
  /** The ledger, byte for byte. */
  readonly text: string;
  /** The text of what the sync holds back, when anything of it is unresolved. */
  readonly held?: string;
  /** How many operations are held back and unresolved: the lines of every unit. */
  readonly heldOperations?: number;
  /** What is held back cannot be read: the ledger goes anyway, and this says so. */
  readonly heldUnreadable?: true;
}

/** What is held back, read without throwing: a throw would abort the export of the ledger (N3). */
const heldOf = (heldText: string | undefined): Omit<LedgerExport, "text"> => {
  if (heldText === undefined) {
    return {};
  }
  try {
    const units = unresolvedHeld(parseHeld(heldText));
    const operations = units.reduce((sum, unit) => sum + unit.lines.length, 0);
    return operations === 0 ? {} : { held: heldText, heldOperations: operations };
  } catch {
    return { heldUnreadable: true };
  }
};

/**
 * The export **with what the sync holds back** (§6.2 P3): the text of the
 * ledger and, apart, the text of the held records when any is unresolved —
 * both read, and the date of this export written, in **one** transaction
 * (feature 012, D4): the date can never claim an export that did not include
 * the last line recorded. Only the date is written; no date when there is no
 * ledger. A `sync:held` that cannot be read never stops the ledger from going
 * (review of PR #97, N3): the export says it instead.
 */
export const exportLedgerAndHeld = (
  when: Date,
  open: Opener = openAtlasDb,
): Promise<LedgerExport> =>
  transact<LedgerExport>(open, "readwrite", (store, _tx, settle) => {
    const get = store.get(CURRENT_KEY);
    const held = store.get(SYNC_HELD_KEY);
    held.onsuccess = () => {
      const stored = get.result as StoredLedger | undefined;
      if (stored !== undefined) {
        const meta: StoredMeta = { lastExportAt: when.toISOString() };
        store.put(meta, META_KEY);
      }
      settle.ok({ text: stored?.text ?? "", ...heldOf(held.result as string | undefined) });
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
    const marker = store.get(SYNC_STATE_KEY);
    const held = store.get(SYNC_HELD_KEY);
    const discarded = store.get(SYNC_DISCARDED_KEY);
    const device = store.get(SYNC_DEVICE_KEY);
    device.onsuccess = () => {
      // A synced ledger is not replaced by a file (§6.2 P2): checked in this
      // same transaction, with the state of the sync next to the ledger.
      const refusal = importPermission(
        syncConfiguredByText(
          marker.result !== undefined ||
            held.result !== undefined ||
            discarded.result !== undefined ||
            device.result !== undefined,
          marker.result as string | undefined,
        ),
      );
      if (refusal !== undefined) {
        settle.fail(new RefusedError(refusal));
        return;
      }
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
