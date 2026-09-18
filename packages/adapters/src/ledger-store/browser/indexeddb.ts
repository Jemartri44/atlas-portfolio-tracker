// The ledger in the browser's own storage (ADR-0019). Used on every phone,
// Firefox and Safari, because the File System Access API does not exist there.
//
// The ledger is stored as **text, exactly as it is**, not as parsed events: it
// is what lets `append` keep the previous bytes untouched and the export be
// byte-for-byte identical to what the CLI would read. Archives are separate
// records written with `add`, so one is never overwritten.
//
// This is never presented as a definitive store: `lastExportAt` travels with
// the ledger so the interface can nag about exporting (ADR-0019).

import { BlobArchiveExists, type LedgerBlob } from "../blob.js";
import { idbAdd, idbGet, idbPut, LEDGER_STORE } from "./idb.js";

const CURRENT_KEY = "current";
const ARCHIVE_PREFIX = "archive/";

export interface StoredLedger {
  text: string;
  updatedAt: string;
  lastExportAt?: string;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class BrowserLedgerBlob implements LedgerBlob {
  readonly label = "almacenamiento del navegador";

  async read(): Promise<Uint8Array> {
    const stored = await idbGet<StoredLedger>(LEDGER_STORE, CURRENT_KEY);
    return encoder.encode(stored?.text ?? "");
  }

  async write(bytes: Uint8Array): Promise<void> {
    const previous = await idbGet<StoredLedger>(LEDGER_STORE, CURRENT_KEY);
    const next: StoredLedger = {
      text: decoder.decode(bytes),
      updatedAt: new Date().toISOString(),
      ...(previous?.lastExportAt === undefined ? {} : { lastExportAt: previous.lastExportAt }),
    };
    await idbPut(LEDGER_STORE, CURRENT_KEY, next);
  }

  async writeArchive(name: string, bytes: Uint8Array): Promise<void> {
    try {
      await idbAdd(LEDGER_STORE, `${ARCHIVE_PREFIX}${name}`, {
        text: decoder.decode(bytes),
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      throw new BlobArchiveExists(name, { cause: error });
    }
  }

  /** Whole text, for the export. Never re-serialised. */
  async text(): Promise<string> {
    const stored = await idbGet<StoredLedger>(LEDGER_STORE, CURRENT_KEY);
    return stored?.text ?? "";
  }

  /** Replaces the whole ledger with an imported file. The caller validates it **before** calling. */
  async replaceText(text: string): Promise<void> {
    await this.write(encoder.encode(text));
  }

  async lastExportAt(): Promise<string | undefined> {
    return (await idbGet<StoredLedger>(LEDGER_STORE, CURRENT_KEY))?.lastExportAt;
  }

  async markExported(when: Date): Promise<void> {
    const stored = await idbGet<StoredLedger>(LEDGER_STORE, CURRENT_KEY);
    if (stored === undefined) {
      return;
    }
    await idbPut(LEDGER_STORE, CURRENT_KEY, { ...stored, lastExportAt: when.toISOString() });
  }

  /** True when this browser already holds a ledger, so the app can reopen it without asking. */
  async exists(): Promise<boolean> {
    return (await idbGet<StoredLedger>(LEDGER_STORE, CURRENT_KEY)) !== undefined;
  }
}
