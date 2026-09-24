// The ledger in the browser's own storage (ADR-0019). Used on every phone,
// Firefox and Safari, and — since feature 012 — on the desktop too: the web
// never writes in the folder it shares with the console, because the browser
// cannot take the folder's lock exclusively (decision of the direction; see
// `specs/012-ecb-reference-rates/questions.md` §1 and §8).
//
// The ledger is stored as **text, exactly as it is**, not as parsed events: it
// is what lets `append` keep the previous bytes untouched and the export be
// byte-for-byte identical to what the CLI would read. Archives are separate
// records written with `add`, so one is never overwritten.
//
// **Every read followed by a write of the stored ledger is one read-write
// transaction** (feature 012, block 0). Before, `write` read the record in one
// transaction and wrote it in another, and so did the export date: a tab
// exporting while another recorded could put back the text without the new
// line. Here each of them is a single transaction, driven by plain request
// callbacks: an IndexedDB transaction commits by itself as soon as it has no
// pending request, so **nothing asynchronous that is not IndexedDB may sit
// between the read and the write** (`sha256Hex` is synchronous, and has to stay
// so on this path).
//
// This is never presented as a definitive store: the date of the last export
// travels next to the ledger so the interface can nag about exporting.

import { ConflictError, sha256Hex } from "@atlas/domain";
import { BlobArchiveExists, type LedgerBlob } from "../blob.js";
import { LEDGER_STORE, openAtlasDb, StorageUnavailable } from "./idb.js";

export const CURRENT_KEY = "current";
/** The date of the last export, apart from the text so that writing it never rewrites the ledger. */
export const META_KEY = "current:meta";
const ARCHIVE_PREFIX = "archive/";

export interface StoredLedger {
  text: string;
  updatedAt: string;
  /** Where it lived until feature 012. Still read, and carried along by every write. */
  lastExportAt?: string;
}

export interface StoredMeta {
  lastExportAt: string;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export type Opener = () => Promise<IDBDatabase>;

/**
 * One transaction over the ledger store. `body` issues requests with plain
 * callbacks and sets the outcome; the promise settles when the transaction
 * commits (with the outcome) or aborts (with the error that caused it).
 */
export const transact = <T>(
  open: Opener,
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore, tx: IDBTransaction, settle: Settle<T>) => void,
): Promise<T> =>
  open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(LEDGER_STORE, mode);
        const outcome: { value?: T; error?: unknown; set: boolean } = { set: false };
        const settle: Settle<T> = {
          ok: (value) => {
            outcome.value = value;
            outcome.set = true;
          },
          fail: (error) => {
            outcome.error = error;
            tx.abort();
          },
        };
        tx.oncomplete = () =>
          outcome.set ? resolve(outcome.value as T) : reject(new StorageUnavailable());
        tx.onabort = () => reject(outcome.error ?? new StorageUnavailable(tx.error));
        body(tx.objectStore(LEDGER_STORE), tx, settle);
      }),
  );

export interface Settle<T> {
  ok(value: T): void;
  /** Aborts the transaction: nothing it wrote stays. */
  fail(error: unknown): void;
}

export class BrowserLedgerBlob implements LedgerBlob {
  readonly label = "almacenamiento del navegador";

  constructor(private readonly open: Opener = openAtlasDb) {}

  async read(): Promise<Uint8Array> {
    return encoder.encode(await this.text());
  }

  update(
    expectedEtag: string,
    produce: (current: Uint8Array) => Uint8Array,
    archiveName?: string,
  ): Promise<Uint8Array> {
    return transact<Uint8Array>(this.open, "readwrite", (store, _tx, settle) => {
      const get = store.get(CURRENT_KEY);
      get.onsuccess = () => {
        const stored = get.result as StoredLedger | undefined;
        const text = stored?.text ?? "";
        const current = encoder.encode(text);
        if (sha256Hex(current) !== expectedEtag) {
          settle.fail(new ConflictError());
          return;
        }
        let next: Uint8Array;
        try {
          next = produce(current);
        } catch (error) {
          settle.fail(error);
          return;
        }
        const write = (): void => {
          const record: StoredLedger = {
            text: decoder.decode(next),
            updatedAt: new Date().toISOString(),
            ...(stored?.lastExportAt === undefined ? {} : { lastExportAt: stored.lastExportAt }),
          };
          store.put(record, CURRENT_KEY);
          settle.ok(next);
        };
        if (archiveName === undefined) {
          write();
          return;
        }
        const add = store.add(
          { text, createdAt: new Date().toISOString() },
          `${ARCHIVE_PREFIX}${archiveName}`,
        );
        add.onsuccess = write;
        add.onerror = (event) => {
          event.preventDefault();
          settle.fail(new BlobArchiveExists(archiveName, { cause: add.error }));
        };
      };
    });
  }

  /** Whole text. Never re-serialised. */
  text(): Promise<string> {
    return transact<string>(this.open, "readonly", (store, _tx, settle) => {
      const get = store.get(CURRENT_KEY);
      get.onsuccess = () => settle.ok((get.result as StoredLedger | undefined)?.text ?? "");
    });
  }

  lastExportAt(): Promise<string | undefined> {
    return transact<string | undefined>(this.open, "readonly", (store, _tx, settle) => {
      const meta = store.get(META_KEY);
      const current = store.get(CURRENT_KEY);
      current.onsuccess = () =>
        settle.ok(
          (meta.result as StoredMeta | undefined)?.lastExportAt ??
            (current.result as StoredLedger | undefined)?.lastExportAt,
        );
    });
  }

  /** True when this browser already holds a ledger, so the app can reopen it without asking. */
  exists(): Promise<boolean> {
    return transact<boolean>(this.open, "readonly", (store, _tx, settle) => {
      const get = store.get(CURRENT_KEY);
      get.onsuccess = () => settle.ok(get.result !== undefined);
    });
  }
}
