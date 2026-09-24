// Public API of @atlas/adapters/browser: the ledger in the browser's own
// storage, which the web composes with BlobLedgerStore, and whether the
// browser has folder pickers. What the boot does not need lives in subpaths
// of its own, loaded lazily: a folder of the disk, read only
// (`@atlas/adapters/folder`), and the export and import of the ledger
// (`@atlas/adapters/transfer`). Compiled by tsconfig.browser.json (DOM types,
// no node types), so nothing here can drag `node:fs` into the bundle.

export {
  BLOCKED,
  openAtlasDb,
  requestPersistentStorage,
  StorageUnavailable,
} from "./idb.js";
export { BrowserLedgerBlob, type StoredLedger } from "./indexeddb.js";
export { supportsDirectoryPicker } from "./picker.js";
