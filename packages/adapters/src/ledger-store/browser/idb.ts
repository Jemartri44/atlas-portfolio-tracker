// Minimal promise wrapper over IndexedDB. One database (`atlas`, version 1)
// with two stores: `ledger` (the ledger text and its archives) and `handles`
// (the directory handle of the File System Access path, which is
// structured-cloneable). No dependency: it is thirty lines of callbacks.

export const DB_NAME = "atlas";
export const DB_VERSION = 1;
export const LEDGER_STORE = "ledger";
export const HANDLE_STORE = "handles";

/** Raised when the browser has no usable IndexedDB (Safari in private mode, blocked site data). */
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
        if (!db.objectStoreNames.contains(LEDGER_STORE)) {
          db.createObjectStore(LEDGER_STORE);
        }
        if (!db.objectStoreNames.contains(HANDLE_STORE)) {
          db.createObjectStore(HANDLE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new StorageUnavailable(request.error));
      request.onblocked = () => reject(new StorageUnavailable());
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
