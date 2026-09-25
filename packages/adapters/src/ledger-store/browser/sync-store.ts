// The web's sync state in keys of its own of the `ledger` store of IndexedDB
// (ADR-0026, Part B; §6.3 (V3) of prompt 014): the marker, what is held back
// and what was discarded, next to the ledger and **without raising
// `DB_VERSION`**, whose upgrade runs at boot. So the ledger, what is held back
// and the marker are written in **one** read-write transaction, compared and
// written together, with `durability: "strict"`: no browser flushes to disk by
// default, and what is held back has to be on disk before the ledger loses the
// line (block 0 of the feature: `specs/014-ledger-sync-core/questions.md` §1).
//
// The transaction is opened here, not through `transact` of `indexeddb.ts`,
// which is on the boot path: an option more there is a byte more of the boot.
// Loaded lazily; the web never writes in a folder of the disk.

import {
  ArchiveExistsError,
  ConflictError,
  CURRENT_LEDGER_SCHEMA,
  decodeLines,
  type LedgerSchema,
  rawLinesText,
  sha256Hex,
} from "@atlas/domain";
import type { DeviceChange, DeviceState, SyncStateStore } from "@atlas/domain/sync";
import {
  linesOfText,
  parseMarker,
  recordsText,
  type SyncPresence,
  serializeMarker,
  syncConfiguredByText,
} from "@atlas/domain/sync";

import { LEDGER_STORE, openAtlasDb, StorageUnavailable } from "./idb.js";
import { CURRENT_KEY, type Opener, type StoredLedger } from "./indexeddb.js";

export const SYNC_STATE_KEY = "sync:state";
export const SYNC_HELD_KEY = "sync:held";
export const SYNC_DISCARDED_KEY = "sync:discarded";
const ARCHIVE_PREFIX = "archive/";

const encoder = new TextEncoder();

/** The keys, read in one transaction: the raw texts, as they are. */
interface Raw {
  ledger: StoredLedger | undefined;
  marker: string | undefined;
  held: string | undefined;
  discarded: string | undefined;
}

const presenceOf = (raw: Raw): SyncPresence => {
  if (raw.marker === undefined && raw.held === undefined && raw.discarded === undefined) {
    return { present: false };
  }
  if (raw.marker === undefined) {
    return { present: true, marker: "missing" };
  }
  try {
    return { present: true, marker: parseMarker(raw.marker) };
  } catch {
    return { present: true, marker: "unreadable" };
  }
};

/** Reads the four keys in `tx`, then calls `then` with them, inside the same transaction. */
const readRaw = (store: IDBObjectStore, then: (raw: Raw) => void): void => {
  const ledger = store.get(CURRENT_KEY);
  const marker = store.get(SYNC_STATE_KEY);
  const held = store.get(SYNC_HELD_KEY);
  const discarded = store.get(SYNC_DISCARDED_KEY);
  discarded.onsuccess = () =>
    then({
      ledger: ledger.result as StoredLedger | undefined,
      marker: marker.result as string | undefined,
      held: held.result as string | undefined,
      discarded: discarded.result as string | undefined,
    });
};

/**
 * Whether this browser's ledger is synced, as `acceptInvalid` asks (V7): the
 * raw keys, read in one transaction, and the rule of the domain over them.
 */
export const browserSyncConfigured = (open: Opener = openAtlasDb): Promise<boolean> =>
  open().then(
    (db) =>
      new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(LEDGER_STORE, "readonly");
        let configured = false;
        readRaw(tx.objectStore(LEDGER_STORE), (raw) => {
          configured = syncConfiguredByText(
            raw.marker !== undefined || raw.held !== undefined || raw.discarded !== undefined,
            raw.marker,
          );
        });
        tx.oncomplete = () => resolve(configured);
        // The error as the browser gives it: this read sits on the path of a
        // write that already reports storage failures in its own words.
        tx.onabort = () => reject(tx.error);
      }),
  );

/** Whether this browser's ledger is synced, with the marker read whole (the import asks, P2). */
export const browserSyncPresence = (open: Opener = openAtlasDb): Promise<SyncPresence> =>
  open().then(
    (db) =>
      new Promise<SyncPresence>((resolve, reject) => {
        const tx = db.transaction(LEDGER_STORE, "readonly");
        let presence: SyncPresence = { present: false };
        readRaw(tx.objectStore(LEDGER_STORE), (raw) => {
          presence = presenceOf(raw);
        });
        tx.oncomplete = () => resolve(presence);
        tx.onabort = () => reject(new StorageUnavailable(tx.error));
      }),
  );

export class BrowserSyncStore implements SyncStateStore {
  constructor(
    private readonly open: Opener = openAtlasDb,
    private readonly schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
  ) {}

  async read(): Promise<DeviceState> {
    const db = await this.open();
    const raw = await new Promise<Raw>((resolve, reject) => {
      const tx = db.transaction(LEDGER_STORE, "readonly");
      let read: Raw | undefined;
      readRaw(tx.objectStore(LEDGER_STORE), (value) => {
        read = value;
      });
      tx.oncomplete = () => resolve(read as Raw);
      tx.onabort = () => reject(new StorageUnavailable(tx.error));
    });
    const text = raw.ledger?.text ?? "";
    const lines = linesOfText(text);
    return {
      ledger: {
        lines,
        events: decodeLines(lines, this.schema),
        etag: sha256Hex(encoder.encode(text)),
      },
      presence: presenceOf(raw),
      markerText: raw.marker,
      heldText: raw.held ?? "",
      discardedText: raw.discarded ?? "",
    };
  }

  /**
   * Step 6 and every resolution, in **one** read-write transaction with
   * `durability: "strict"`: the four keys are compared with what was read at
   * step 1 and, only if nothing changed, the archive (with `add`, which fails
   * if it exists and aborts everything), what is held back, what is
   * discarded, the ledger and the marker are written. It all commits or none
   * of it does.
   */
  async commit(expected: DeviceState, change: DeviceChange): Promise<void> {
    // The lines are checked before the transaction opens: nothing but
    // IndexedDB may sit between its read and its write.
    const ledgerText =
      change.ledger === undefined
        ? undefined
        : "append" in change.ledger
          ? rawLinesText(change.ledger.append, this.schema)
          : rawLinesText(change.ledger.replace, this.schema);
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LEDGER_STORE, "readwrite", { durability: "strict" });
      const store = tx.objectStore(LEDGER_STORE);
      let failure: unknown;
      const fail = (error: unknown): void => {
        failure = error;
        tx.abort();
      };
      readRaw(store, (raw) => {
        const current = raw.ledger?.text ?? "";
        if (
          sha256Hex(encoder.encode(current)) !== expected.ledger.etag ||
          (raw.held ?? "") !== expected.heldText ||
          (raw.discarded ?? "") !== expected.discardedText ||
          raw.marker !== expected.markerText
        ) {
          fail(new ConflictError());
          return;
        }
        if (change.held !== undefined && change.held.length > 0) {
          store.put(expected.heldText + recordsText(change.held), SYNC_HELD_KEY);
        }
        if (change.discarded !== undefined && change.discarded.length > 0) {
          store.put(expected.discardedText + recordsText(change.discarded), SYNC_DISCARDED_KEY);
        }
        if (change.ledger !== undefined && ledgerText !== undefined) {
          const next =
            "append" in change.ledger
              ? `${current}${current === "" || current.endsWith("\n") ? "" : "\n"}${ledgerText}`
              : ledgerText;
          if ("replace" in change.ledger) {
            const archive = change.ledger.archive;
            const add = store.add(
              { text: current, createdAt: new Date().toISOString() },
              `${ARCHIVE_PREFIX}${archive}`,
            );
            add.onerror = (event) => {
              // Cancelled and aborted by hand: the whole transaction goes,
              // with the error of the port, never half of it.
              event.preventDefault();
              fail(new ArchiveExistsError(archive));
            };
          }
          const record: StoredLedger = {
            text: next,
            updatedAt: new Date().toISOString(),
            ...(raw.ledger?.lastExportAt === undefined
              ? {}
              : { lastExportAt: raw.ledger.lastExportAt }),
          };
          store.put(record, CURRENT_KEY);
        }
        if (change.marker !== undefined) {
          store.put(serializeMarker(change.marker), SYNC_STATE_KEY);
        }
      });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? new StorageUnavailable(tx.error));
    });
  }
}
