// Minimal promise wrapper over IndexedDB. One database (`atlas`, version 2)
// with three stores: `ledger` (the ledger text and its archives), `handles`
// (the directory handle of the File System Access path, which is
// structured-cloneable) and, since version 2 (feature 012, block 5), `drafts`
// (operations recorded before their ECB rate, outside the ledger). No
// dependency: it is thirty lines of callbacks.

export const DB_NAME = "atlas";
export const DB_VERSION = 2;
export const LEDGER_STORE = "ledger";
export const HANDLE_STORE = "handles";
export const DRAFT_STORE = "drafts";

/** The cause of a `StorageUnavailable` that is only another tab holding an older version. */
export const BLOCKED = "blocked";

/**
 * Raised when the browser has no usable IndexedDB (Safari in private mode,
 * blocked site data) — or, with the cause `BLOCKED`, when another tab keeps
 * the previous version of the database open and the upgrade cannot run.
 */
export class StorageUnavailable extends Error {
  constructor(cause?: unknown) {
    super("el navegador no permite guardar datos de este sitio");
    this.name = "StorageUnavailable";
    this.cause = cause;
  }
}

const wrap = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new StorageUnavailable());
  });

let open: Promise<IDBDatabase> | undefined;

export const openAtlasDb = (): Promise<IDBDatabase> => {
  if (open === undefined) {
    open = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new StorageUnavailable());
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        // Whatever version it comes from, what is missing is created and
        // nothing that exists is touched.
        for (const name of [LEDGER_STORE, HANDLE_STORE, DRAFT_STORE]) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new StorageUnavailable(request.error));
      // Another tab still has the previous version open: said apart (the
      // cause "blocked"), never as a browser that keeps no data, which is
      // false and sends the user to change a setting that is fine.
      request.onblocked = () => reject(new StorageUnavailable(BLOCKED));
    }).catch((error: unknown) => {
      open = undefined;
      throw error;
    });
  }
  return open;
};

export const idbGet = async <T>(store: string, key: string): Promise<T | undefined> => {
  const db = await openAtlasDb();
  return wrap<T | undefined>(db.transaction(store, "readonly").objectStore(store).get(key));
};

export const idbPut = async (store: string, key: string, value: unknown): Promise<void> => {
  const db = await openAtlasDb();
  const transaction = db.transaction(store, "readwrite");
  await wrap(transaction.objectStore(store).put(value, key));
};

/** `add` instead of `put`: an existing key must fail, which is how archives are never overwritten. */
export const idbAdd = async (store: string, key: string, value: unknown): Promise<void> => {
  const db = await openAtlasDb();
  const transaction = db.transaction(store, "readwrite");
  await wrap(transaction.objectStore(store).add(value, key));
};

export const idbDelete = async (store: string, key: string): Promise<void> => {
  const db = await openAtlasDb();
  const transaction = db.transaction(store, "readwrite");
  await wrap(transaction.objectStore(store).delete(key));
};

/**
 * Asks the browser not to evict this origin's data under storage pressure
 * (Baseline since 2021). It is **not** a guarantee: clearing the site data
 * still wipes the ledger, which is why the export reminder exists (ADR-0019).
 */
export const requestPersistentStorage = async (): Promise<boolean> => {
  if (typeof navigator === "undefined" || navigator.storage?.persist === undefined) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
};
