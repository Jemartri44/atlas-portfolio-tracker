// Export and import of the ledger file.
//
// The export hands over the stored text **byte for byte** (FR-013): not a
// re-serialisation, because the file the CLI reads and the file the browser
// gives back have to be the same bytes. The import validates by loading before
// replacing anything, so a wrong file never destroys the ledger in place.

import { BlobLedgerStore } from "@atlas/adapters/blob";
import { BrowserLedgerBlob } from "@atlas/adapters/browser";
import { loadInto } from "./actions.js";
import { store } from "./state.js";
import { openBrowserStorage } from "./store.js";

export const EXPORT_FILE_NAME = "ledger.jsonl";

/**
 * Triggers the download of the exact text and records the export date — the
 * text and the date in **one** transaction (feature 012, D4), so the date can
 * never claim an export that left out a line another tab recorded meanwhile.
 */
export const exportLedger = async (blob: BrowserLedgerBlob): Promise<void> => {
  const when = new Date();
  const text = await blob.exportText(when);
  const file = new Blob([text], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = EXPORT_FILE_NAME;
  anchor.click();
  URL.revokeObjectURL(url);
  const current = store.load();
  if (current.phase === "ready") {
    store.setLoad({
      ...current,
      source: { ...current.source, lastExportAt: when.toISOString() },
    });
  }
};

/** What an import would do, said before doing it. */
export interface ImportPlan {
  /** Movements in the file. */
  events: number;
  /** Lines of the ledger this browser holds now, which the import would replace. */
  replaces: number;
}

/**
 * Reads the file as a ledger **before** anything else, and says what it would
 * replace. Importing is a deliberate overwrite of the whole ledger of this
 * browser, not a conditional write: when there is something to replace, the
 * interface asks for an explicit confirmation with these two numbers before
 * calling `importLedger` (feature 012, block 0). It used to replace without
 * asking.
 */
export const planImport = async (text: string): Promise<ImportPlan> => {
  const events = await validateImport(text);
  const current = await new BrowserLedgerBlob().text();
  return { events, replaces: current.split("\n").filter((line) => line !== "").length };
};

/**
 * Imports a file: **validate first, open nothing until it is a ledger**.
 *
 * The order is the whole point. It used to be the other way round — the screen
 * opened the browser storage and *then* validated — so a file that was not a
 * ledger left an **empty ledger open and remembered**: the warning was shown,
 * but navigating away landed on "El libro está vacío" as if there were one, and
 * the next start opened that emptiness without saying anything. It is the entry
 * path of a phone, so it is the worst place to leave a trap (inventory V6 of
 * `specs/006-web-shell/questions.md`).
 *
 * If the text is not a ledger this throws before touching anything, and the
 * state the user had is exactly the state they keep. Whoever calls it has
 * already confirmed the replacement (`planImport`).
 */
export const importLedger = async (text: string): Promise<number> => {
  const events = await validateImport(text);
  await new BrowserLedgerBlob().replaceText(text);
  // Opened after the replacement, so it reads the export date of the ledger
  // now there — none — and not the one of the ledger it replaced (D4).
  await loadInto(await openBrowserStorage());
  return events;
};

/**
 * Reads the text as a ledger and answers how many events it holds. Exported so
 * the half that decides whether a file is acceptable can be tested without a
 * browser: the other half needs IndexedDB and is checked in Chromium.
 */
export const validateImport = async (text: string): Promise<number> =>
  (await new BlobLedgerStore(new MemoryText(text)).load()).events.length;

/** A read-only blob over a string, to validate an import before it lands. */
class MemoryText {
  readonly label = "archivo importado";
  private readonly bytes: Uint8Array;

  constructor(text: string) {
    this.bytes = new TextEncoder().encode(text);
  }

  async read(): Promise<Uint8Array> {
    return this.bytes;
  }

  async update(): Promise<Uint8Array> {
    throw new Error("el archivo importado no se escribe");
  }
}
