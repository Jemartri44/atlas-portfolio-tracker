// Export and import of the ledger file.
//
// The export hands over the stored text **byte for byte** (FR-013): not a
// re-serialisation, because the file the CLI reads and the file the browser
// gives back have to be the same bytes. The import validates by loading before
// replacing anything, so a wrong file never destroys the ledger in place.

import { BlobLedgerStore } from "@atlas/adapters/blob";
import { BrowserLedgerBlob } from "@atlas/adapters/browser";
import { reloadLedger } from "./actions.js";
import { store } from "./state.js";

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
 * Validates the imported text and only then replaces the ledger. Returns the
 * number of events it holds, which is what the interface shows to confirm.
 */
export const importLedger = async (text: string): Promise<number> => {
  const candidate = new MemoryText(text);
  const events = (await new BlobLedgerStore(candidate).load()).events;
  const blob = new BrowserLedgerBlob();
  await blob.replaceText(text);
  await reloadLedger();
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
