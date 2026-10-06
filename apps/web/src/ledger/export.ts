// Export and import of the ledger file.
//
// The export hands over the stored text **byte for byte** (FR-013): not a
// re-serialisation, because the file the CLI reads and the file the browser
// gives back have to be the same bytes. The import validates by loading before
// replacing anything, so a wrong file never destroys the ledger in place.

import { BlobLedgerStore } from "@atlas/adapters/blob";
import { BrowserLedgerBlob } from "@atlas/adapters/browser";
import {
  etagOfText,
  exportLedgerAndHeld,
  heldDownloaded,
  replaceLedgerText,
} from "@atlas/adapters/transfer";
import { countOf } from "../format/number.js";
import { loadInto } from "./actions.js";
import { store } from "./state.js";
import { openBrowserStorage } from "./store.js";

export const EXPORT_FILE_NAME = "ledger.jsonl";
/** The operations the sync holds back, exported beside the ledger when there are any. */
export const EXPORT_HELD_FILE_NAME = "ledger.held.jsonl";

const download = (text: string, name: string): void => {
  const file = new Blob([text], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

/** What the sync holds back, found at the export and handed over with its own button. */
export interface HeldExport {
  readonly text: string;
  readonly operations: number;
}

/** What an export did: the ledger always; what is held back apart, or that it could not be read. */
export interface ExportResult {
  readonly held?: HeldExport;
  readonly heldUnreadable?: true;
}

/** The export as the chip reads it: its date, and what it still owes. */
const markSource = (lastExportAt: string, heldOwed: number | undefined): void => {
  const current = store.load();
  if (current.phase !== "ready" || current.source.kind !== "browser") {
    return;
  }
  const { heldOwed: _paid, ...rest } = current.source;
  store.setLoad({
    ...current,
    source: { ...rest, lastExportAt, ...(heldOwed === undefined ? {} : { heldOwed }) },
  });
};

/**
 * Downloads what is held back, from its own gesture (review of PR #97,
 * security B2), and marks it downloaded: until then the export is not
 * complete, and the chip says so (round 2, N2).
 */
export const downloadHeld = async (held: HeldExport): Promise<void> => {
  download(held.text, EXPORT_HELD_FILE_NAME);
  await heldDownloaded();
  const current = store.load();
  if (
    current.phase === "ready" &&
    current.source.kind === "browser" &&
    current.source.lastExportAt !== undefined
  ) {
    markSource(current.source.lastExportAt, undefined);
  }
};

/**
 * What the export says, in one sentence: the file of the ledger and, when
 * the sync holds something back, **how many operations and in which file**
 * they go apart, with its own button — a second download from the same
 * gesture is one the browser may block without a word (review of PR #97,
 * security B2).
 */
export const exportSaid = (
  result: ExportResult,
): { readonly severity: "info" | "caution"; readonly text: string } => {
  const ledger = `Tus datos van en ${EXPORT_FILE_NAME}. Guárdalo donde tengas la copia de seguridad.`;
  if (result.heldUnreadable === true) {
    return {
      severity: "caution",
      text: `${ledger} Lo retenido por la sincronización no se ha podido leer, así que no se ha exportado: revísalo en Ajustes › Sincronización antes de borrar nada de este navegador.`,
    };
  }
  if (result.held === undefined) {
    return { severity: "info", text: ledger };
  }
  return {
    severity: "caution",
    text: `${ledger} La sincronización retiene ${countOf(result.held.operations, "operación", "operaciones")} que no van en ese archivo: descárgalas aparte en ${EXPORT_HELD_FILE_NAME} con «Descargar lo retenido» y guárdalo junto a él.`,
  };
};

/**
 * Triggers the download of the exact text and records the export date — the
 * text and the date in **one** transaction (feature 012, D4), so the date can
 * never claim an export that left out a line another tab recorded meanwhile.
 * What the sync holds back is **not** downloaded from this gesture: it is
 * returned, for its own button (§6.2 P3; review of PR #97, security B2).
 */
export const exportLedger = async (): Promise<ExportResult> => {
  const when = new Date();
  const exported = await exportLedgerAndHeld(when);
  download(exported.text, EXPORT_FILE_NAME);
  markSource(when.toISOString(), exported.heldOperations);
  if (exported.heldUnreadable === true) {
    return { heldUnreadable: true };
  }
  return exported.held === undefined
    ? {}
    : { held: { text: exported.held, operations: exported.heldOperations ?? 0 } };
};

/** What an import would do, said before doing it. */
export interface ImportPlan {
  /** Movements in the file. */
  events: number;
  /** Lines of the ledger this browser holds now, which the import would replace. */
  replaces: number;
  /**
   * The etag of that ledger: the yes is to replacing **this** one, and the
   * import is refused if another tab changed it in between (review of PR #75).
   */
  etag: string;
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
  return {
    events,
    replaces: current.split("\n").filter((line) => line !== "").length,
    etag: etagOfText(current),
  };
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
export const importLedger = async (text: string, plan: ImportPlan): Promise<number> => {
  const events = await validateImport(text);
  await replaceLedgerText(text, plan.etag);
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
