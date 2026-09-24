// `@atlas/adapters/reference`, a subpath of its own and not part of
// `./browser`: the browser store is on the boot path of the web, and nothing
// of the ECB may be (decision (r) of prompt 012).
//
// The ECB history **imported by hand** into this browser (feature 012, block
// 3): on a phone, until the cloud exists, it is the only way the history gets
// here — the web downloads nothing from a third party (ADR-0028, ADR-0029,
// point 3). Kept as text, exactly as imported, next to the ledger in the same
// database, under a key of its own. Losing it loses nothing of the ledger: it
// is imported again.

import { idbGet, idbPut, LEDGER_STORE } from "./idb.js";

const KEY = "reference:ecb";

export interface ImportedHistory {
  /** The CSV, byte for byte as a string (the history is ASCII). */
  text: string;
  /** `zip` for the CSV of the ZIP, `api` for the API's: said, never disguised. */
  source: "zip" | "api";
  /** The file the user chose. */
  file_name: string;
  /** ISO 8601 UTC. */
  imported_at: string;
}

export const saveImportedHistory = (history: ImportedHistory): Promise<void> =>
  idbPut(LEDGER_STORE, KEY, history);

export const importedHistory = (): Promise<ImportedHistory | undefined> =>
  idbGet<ImportedHistory>(LEDGER_STORE, KEY);
