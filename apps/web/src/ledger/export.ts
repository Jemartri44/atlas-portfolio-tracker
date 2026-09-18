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

/** Triggers the download of the exact text and records the export date. */
export const exportLedger = async (blob: BrowserLedgerBlob): Promise<void> => {
  const text = await blob.text();
  const file = new Blob([text], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = EXPORT_FILE_NAME;
  anchor.click();
  URL.revokeObjectURL(url);
  const when = new Date();
  await blob.markExported(when);
  const current = store.load();
  if (current.phase === "ready" && current.source.kind === "browser") {
    store.setLoad({
      ...current,
      source: { ...current.source, lastExportAt: when.toISOString() },
    });
  }
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
 * state the user had is exactly the state they keep.
 */
export const importLedger = async (text: string): Promise<number> => {
  const events = (await new BlobLedgerStore(new MemoryText(text)).load()).events;
  const opened = await openBrowserStorage();
  await new BrowserLedgerBlob().replaceText(text);
  await loadInto(opened);
  return events.length;
};

/** A read-only blob over a string, to validate an import before it lands. */
class MemoryText {
  readonly label = "fichero importado";
  private readonly bytes: Uint8Array;

  constructor(text: string) {
    this.bytes = new TextEncoder().encode(text);
  }

  async read(): Promise<Uint8Array> {
    return this.bytes;
  }

  async write(): Promise<void> {
    throw new Error("el fichero importado no se escribe");
  }

  async writeArchive(): Promise<void> {
    throw new Error("el fichero importado no se archiva");
  }
}
