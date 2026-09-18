// Composition root of the ledger: the **only** file of the web that knows
// which adapter is which.
//
// It imports `@atlas/adapters` by subpath only. The barrel would pull
// `FileLedgerStore` and therefore `node:fs` into the bundle, so a rule in
// `tests/architecture.test.ts` forbids it and `scripts/check-bundle.mjs`
// verifies it on the real output (FR-014).

import { BlobLedgerStore } from "@atlas/adapters/blob";
import {
  BrowserLedgerBlob,
  DirectoryLedgerBlob,
  forgetDirectory,
  pickLedgerDirectory,
  queryDirectoryPermission,
  rememberDirectory,
  rememberedDirectory,
  requestDirectoryPermission,
  requestPersistentStorage,
} from "@atlas/adapters/browser";
import { systemClock } from "@atlas/adapters/clock";
import { webCryptoRandom } from "@atlas/adapters/random";
import type { UseCaseDeps } from "@atlas/domain";
import {
  type BrowserSource,
  type DirectorySource,
  forgetKind,
  type LedgerSource,
  rememberKind,
} from "./source.js";

export interface OpenedLedger {
  deps: UseCaseDeps;
  source: LedgerSource;
  /** Only for the browser path: export, import and the reminder live on it. */
  browser?: BrowserLedgerBlob;
}

const depsFor = (store: BlobLedgerStore): UseCaseDeps => ({
  store,
  clock: systemClock,
  random: webCryptoRandom,
});

const directorySource = (
  handle: FileSystemDirectoryHandle,
  permission: DirectorySource["permission"],
): DirectorySource => ({
  kind: "directory",
  directoryName: handle.name,
  fileName: "ledger.jsonl",
  permission,
});

const openedDirectory = (
  handle: FileSystemDirectoryHandle,
  permission: DirectorySource["permission"],
): OpenedLedger => ({
  deps: depsFor(new BlobLedgerStore(new DirectoryLedgerBlob(handle))),
  source: directorySource(handle, permission),
});

/** Asks for the folder (a user gesture) and remembers it. `undefined` if cancelled. */
export const chooseDirectory = async (): Promise<OpenedLedger | undefined> => {
  const handle = await pickLedgerDirectory();
  if (handle === undefined) {
    return undefined;
  }
  await rememberDirectory(handle);
  rememberKind("directory");
  return openedDirectory(handle, "granted");
};

export interface RememberedDirectory {
  handle: FileSystemDirectoryHandle;
  name: string;
  permission: DirectorySource["permission"];
}

/**
 * The folder of a previous session, with its permission **as it is now**. The
 * handle survives; the permission does not once every tab is closed, so this is
 * what tells the interface whether to show "Reconectar" (D5).
 */
export const rememberedDirectoryState = async (): Promise<RememberedDirectory | undefined> => {
  const handle = await rememberedDirectory();
  if (handle === undefined) {
    return undefined;
  }
  return { handle, name: handle.name, permission: await queryDirectoryPermission(handle) };
};

/** Re-asks for permission. **Must** be called from a user gesture. */
export const reconnectDirectory = async (
  handle: FileSystemDirectoryHandle,
): Promise<OpenedLedger | undefined> => {
  const permission = await requestDirectoryPermission(handle);
  return permission === "granted" ? openedDirectory(handle, permission) : undefined;
};

/** Opens the ledger held by this browser, asking for persistent storage (D6). */
export const openBrowserStorage = async (): Promise<OpenedLedger> => {
  const blob = new BrowserLedgerBlob();
  const persisted = await requestPersistentStorage();
  rememberKind("browser");
  const lastExportAt = await blob.lastExportAt();
  const source: BrowserSource = {
    kind: "browser",
    persisted,
    ...(lastExportAt === undefined ? {} : { lastExportAt }),
  };
  return { deps: depsFor(new BlobLedgerStore(blob)), source, browser: blob };
};

/** Forgets the ledger: the file is never touched, only the reference to it. */
export const forgetLedger = async (): Promise<void> => {
  forgetKind();
  await forgetDirectory();
};
