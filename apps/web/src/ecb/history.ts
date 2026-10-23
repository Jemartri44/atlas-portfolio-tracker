// Where the web gets the ECB history (ADR-0029, point 3).
//
// **The web downloads nothing from a third party.** It uses the public copy
// kept in this browser: imported by hand, or downloaded from our own cloud
// (`./cloud.ts`). Without one there is no history: nothing is proposed, and
// the rates are typed as always.
//
// Everything here is loaded lazily: nothing of the ECB is on the boot path, and the build fails if
// it ever is.

import {
  forgetImportedHistory,
  importedHistory,
  saveImportedHistory,
} from "@atlas/adapters/reference";
import { DomainError } from "@atlas/domain";
import {
  asciiText,
  checkHistoryUpdate,
  DEFAULT_LOCAL_CONFIG,
  type EcbHistory,
  type EcbSource,
  type HistoryConflict,
  latestPublication,
  readEcbHistory,
} from "@atlas/domain/ecb";
import { entryOfZip, isZip } from "./zip.js";

export interface WebHistory {
  history?: EcbHistory;
  /** Where it came from: a copy imported by hand, or the cloud. */
  origin?: "imported" | "cloud";
  source?: EcbSource;
  /** The last day it publishes. */
  latest?: string;
  /** When it was imported or downloaded. */
  when?: string;
  /** The threshold of a currency the ECB stopped publishing (the default of the domain). */
  staleDays: number;
  /**
   * Why no history could be read where one may be: this browser keeps no site data at all
   * (`storage`), or the copy it keeps is not a history that reads (`unreadable`, to be erased and
   * downloaded again). Said, never swallowed.
   */
  problem?: "storage" | "unreadable";
}

const fromImport = async (staleDays: number): Promise<WebHistory | undefined> => {
  const stored = await importedHistory();
  if (stored === undefined) {
    return undefined;
  }
  const history = readEcbHistory(stored.text, stored.source);
  return {
    history,
    origin: stored.origin === "cloud" ? "cloud" : "imported",
    source: stored.source,
    latest: latestPublication(history),
    when: stored.imported_at,
    staleDays,
  };
};

let cached: Promise<WebHistory> | undefined;

/** The history in force for the web: the copy of this browser (public), else none. */
export const loadWebHistory = (): Promise<WebHistory> => {
  cached ??= load().catch(
    // Without a store to read from (private mode, blocked site data), or with a copy that does not
    // read, there is no history: the form types the rate as always, and the card says why.
    (error: unknown): WebHistory => ({
      staleDays: DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days,
      problem: error instanceof DomainError ? "unreadable" : "storage",
    }),
  );
  return cached;
};

const load = async (): Promise<WebHistory> =>
  (await fromImport(DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days)) ?? {
    staleDays: DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days,
  };

/** Forget what was read, after importing a file. */
export const reloadWebHistory = (): Promise<WebHistory> => {
  cached = undefined;
  return loadWebHistory();
};

type ImportOutcome =
  | { kind: "imported"; latest: string; source: EcbSource }
  | { kind: "rejected"; total: number; conflicts: HistoryConflict[] };

/**
 * Imports the history the user chose: the ECB's ZIP or its CSV, or the CSV of
 * its API. It is read **before** anything is kept; and a file that changes a
 * rate the imported one already has is **not** kept (ADR-0029, point 2).
 */
export const importHistoryFile = async (
  name: string,
  bytes: Uint8Array,
): Promise<ImportOutcome> => {
  const csv = isZip(bytes) ? await entryOfZip(bytes, ".csv") : bytes;
  const text = asciiText(csv);
  const source: EcbSource = text.startsWith("Date,") ? "zip" : "api";
  const next = readEcbHistory(text, source);
  const stored = await importedHistory();
  const previous = stored === undefined ? undefined : readEcbHistory(stored.text, stored.source);
  const check = checkHistoryUpdate(previous, next);
  if (check.kind === "rejected") {
    return { kind: "rejected", total: check.total, conflicts: check.conflicts };
  }
  await saveImportedHistory({
    text,
    source,
    file_name: name,
    imported_at: new Date().toISOString(),
  });
  await reloadWebHistory();
  return { kind: "imported", latest: check.latest, source };
};

/** Erases the copy of this browser (imported or from the cloud) and reads again. */
export const forgetWebCopy = async (): Promise<void> => {
  await forgetImportedHistory();
  await reloadWebHistory();
};
