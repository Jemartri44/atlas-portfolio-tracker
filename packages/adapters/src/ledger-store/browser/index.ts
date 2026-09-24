// Public API of @atlas/adapters/browser: the ledger in the browser's own
// storage, which the web composes with BlobLedgerStore, and a folder of the
// disk **read only** (feature 012). Compiled by tsconfig.browser.json (DOM
// types, no node types), so nothing here can drag `node:fs` into the bundle.

export {
  forgetFolder,
  type HandlePermission,
  pickFolder,
  queryFolderPermission,
  readFolderText,
  rememberedFolder,
  rememberFolder,
  requestFolderPermission,
  supportsDirectoryPicker,
} from "./folder.js";
export {
  openAtlasDb,
  requestPersistentStorage,
  StorageUnavailable,
} from "./idb.js";
export { BrowserLedgerBlob, type StoredLedger } from "./indexeddb.js";
