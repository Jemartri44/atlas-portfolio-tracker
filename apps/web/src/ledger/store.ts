// Composition root of the ledger: the **only** file of the web that knows
// which adapter is which.
//
// It imports `@atlas/adapters` by subpath only. The barrel would pull
// `FileLedgerStore` and therefore `node:fs` into the bundle, so a rule in
// `tests/architecture.test.ts` forbids it and `scripts/check-bundle.mjs`
// verifies it on the real output (FR-014).
//
// There is one store since feature 012: the browser's own. The web does not
// write in the console's folder any more (`source.ts`).

import { BlobLedgerStore } from "@atlas/adapters/blob";
import { BrowserLedgerBlob, requestPersistentStorage } from "@atlas/adapters/browser";
import { systemClock } from "@atlas/adapters/clock";
import { webCryptoRandom } from "@atlas/adapters/random";
import type { UseCaseDeps } from "@atlas/domain";
import { type BrowserSource, forgetKind, type LedgerSource, rememberKind } from "./source.js";

export interface OpenedLedger {
  deps: UseCaseDeps;
  source: LedgerSource;
  /** The browser store itself: export, import and the reminder live on it. */
  browser?: BrowserLedgerBlob;
}

const depsFor = (store: BlobLedgerStore): UseCaseDeps => ({
  store,
  clock: systemClock,
  random: webCryptoRandom,
});

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

/** Forgets which ledger was open: nothing stored is touched, only the choice. */
export const forgetLedger = (): void => {
  forgetKind();
};
