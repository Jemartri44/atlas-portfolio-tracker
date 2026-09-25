// The device id of this browser (feature 015; `docs/api.md` §5.4): the API
// assigns it at sign-in and signs it inside the cookie of the session; the web
// keeps a copy **here, where it is not a credential** — it is only presented
// at the next sign-in, and the API keeps it only if it issued it for a web
// device that is not forgotten. A key of its own in the `ledger` store,
// outside the `sync:*` keys: having signed in never configures the sync.

import { LEDGER_STORE, openAtlasDb } from "./idb.js";
import type { Opener } from "./indexeddb.js";

export const WEB_DEVICE_KEY = "web:device_id";

const WELL_FORMED = /^[A-Za-z0-9_-]{22}$/;

/** The id this browser keeps, or nothing (never kept, or not well formed). */
export const readWebDeviceId = (open: Opener = openAtlasDb): Promise<string | undefined> =>
  open().then(
    (db) =>
      new Promise<string | undefined>((resolve, reject) => {
        const tx = db.transaction(LEDGER_STORE, "readonly");
        const request = tx.objectStore(LEDGER_STORE).get(WEB_DEVICE_KEY);
        let value: unknown;
        request.onsuccess = () => {
          value = request.result;
        };
        tx.oncomplete = () =>
          resolve(typeof value === "string" && WELL_FORMED.test(value) ? value : undefined);
        tx.onabort = () => reject(tx.error);
      }),
  );

/** Adopts the id the API says this browser has (`GET /api/session`). */
export const saveWebDeviceId = (deviceId: string, open: Opener = openAtlasDb): Promise<void> => {
  if (!WELL_FORMED.test(deviceId)) {
    return Promise.reject(new Error("not a device id"));
  }
  return open().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(LEDGER_STORE, "readwrite");
        tx.objectStore(LEDGER_STORE).put(deviceId, WEB_DEVICE_KEY);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      }),
  );
};
