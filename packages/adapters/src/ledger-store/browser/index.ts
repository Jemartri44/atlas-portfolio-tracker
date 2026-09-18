// Public API of @atlas/adapters/browser: the two byte-level handles the web
// composes with BlobLedgerStore, plus the storage helpers around them. Compiled
// by tsconfig.browser.json (DOM types, no node types), so nothing here can drag
// `node:fs` into the bundle.

export {
  DirectoryLedgerBlob,
  forgetDirectory,
  type HandlePermission,
  pickLedgerDirectory,
  queryDirectoryPermission,
  rememberDirectory,
  rememberedDirectory,
  requestDirectoryPermission,
  supportsDirectoryPicker,
} from "./directory.js";
export {
  openAtlasDb,
  requestPersistentStorage,
  StorageUnavailable,
} from "./idb.js";
export { BrowserLedgerBlob, type StoredLedger } from "./indexeddb.js";
