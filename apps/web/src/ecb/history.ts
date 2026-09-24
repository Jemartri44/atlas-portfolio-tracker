// Where the web gets the ECB history (feature 012, block 3; ADR-0029, point 3).
//
// **The web downloads nothing from a third party.** On the desktop it reads
// the history the console downloaded, **from the folder linked for reading**
// (`reference/ecb/`, with the manifest that says which file is in force and
// its SHA-256); on the phone — or where no folder is linked — the copy the
// user **imported by hand**. Without either there is no history: nothing is
// proposed, and the rates are typed as always (decision (p)).
//
// Everything here is loaded lazily: nothing of the ECB is on the boot path
// (decision (r)), and the build fails if it ever is.

import { queryFolderPermission, readFolderText, rememberedFolder } from "@atlas/adapters/browser";
import { importedHistory, saveImportedHistory } from "@atlas/adapters/reference";
import { sha256Hex, utf8Encode } from "@atlas/domain";
import {
  asciiText,
  checkHistoryUpdate,
  DEFAULT_LOCAL_CONFIG,
  type EcbHistory,
  type EcbSource,
  type HistoryConflict,
  latestPublication,
  parseLocalConfig,
  readEcbHistory,
} from "@atlas/domain/ecb";
import { entryOfZip, isZip } from "./zip.js";

export interface WebHistory {
  history?: EcbHistory;
  /** Where it came from. */
  origin?: "folder" | "imported";
  source?: EcbSource;
  /** The last day it publishes. */
  latest?: string;
  /** When the console downloaded it, or when it was imported. */
  when?: string;
  /** The threshold of a currency the ECB stopped publishing (`atlas.config.json`, or its default). */
  staleDays: number;
  /**
   * Why no history could be read where one may be: the folder lost its
   * permission, its file is not the one its manifest records, it does not
   * read, or this browser keeps no data at all. Said, never swallowed.
   */
  problem?: "permission" | "damaged" | "unreadable" | "storage";
}

interface Manifest {
  active: { file: string; source: EcbSource; sha256: string; fetched_at: string };
}

const fromFolder = async (): Promise<WebHistory | undefined> => {
  const handle = await rememberedFolder();
  if (handle === undefined) {
    return undefined;
  }
  if ((await queryFolderPermission(handle)) !== "granted") {
    return { staleDays: DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days, problem: "permission" };
  }
  const config = await readFolderText(handle, ["atlas.config.json"]);
  const staleDays =
    config === undefined
      ? DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days
      : parseLocalConfig(config).ecb_stale_currency_days;
  const manifest = await readFolderText(handle, ["reference", "ecb", "manifest.json"]);
  if (manifest === undefined) {
    return undefined;
  }
  try {
    const { active } = JSON.parse(manifest) as Manifest;
    const text = await readFolderText(handle, ["reference", "ecb", ...active.file.split("/")]);
    if (text === undefined || sha256Hex(utf8Encode(text)) !== active.sha256) {
      return { staleDays, problem: "damaged" };
    }
    const history = readEcbHistory(text, active.source);
    return {
      history,
      origin: "folder",
      source: active.source,
      latest: latestPublication(history),
      when: active.fetched_at,
      staleDays,
    };
  } catch {
    // A manifest or a history that does not read: said as such.
    return { staleDays, problem: "unreadable" };
  }
};

const fromImport = async (staleDays: number): Promise<WebHistory | undefined> => {
  const stored = await importedHistory();
  if (stored === undefined) {
    return undefined;
  }
  const history = readEcbHistory(stored.text, stored.source);
  return {
    history,
    origin: "imported",
    source: stored.source,
    latest: latestPublication(history),
    when: stored.imported_at,
    staleDays,
  };
};

let cached: Promise<WebHistory> | undefined;

/** The history in force for the web: the folder's, else the imported one, else none. */
export const loadWebHistory = (): Promise<WebHistory> => {
  cached ??= load().catch(
    // Without a store to read from (private mode, blocked site data) there is
    // no history: the form types the rate as always, and the card says why.
    (): WebHistory => ({
      staleDays: DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days,
      problem: "storage",
    }),
  );
  return cached;
};

const load = (): Promise<WebHistory> =>
  (async () => {
    const folder = await fromFolder();
    if (folder?.history !== undefined) {
      return folder;
    }
    const staleDays = folder?.staleDays ?? DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days;
    const imported = await fromImport(staleDays);
    return imported === undefined
      ? { staleDays, ...(folder?.problem === undefined ? {} : { problem: folder.problem }) }
      : { ...imported, ...(folder?.problem === undefined ? {} : { problem: folder.problem }) };
  })();

/** Forget what was read, after linking a folder or importing a file. */
export const reloadWebHistory = (): Promise<WebHistory> => {
  cached = undefined;
  return loadWebHistory();
};

export type ImportOutcome =
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
