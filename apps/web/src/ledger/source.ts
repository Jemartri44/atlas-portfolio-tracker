// Where the ledger comes from, and what this browser can actually offer.
//
// **The ledger of the web always lives in the browser** (feature 012). Until
// then, on a desktop with the File System Access API, the web wrote the same
// `ledger.jsonl` as the console; it no longer does, because the browser cannot
// take the folder's lock exclusively and two writers could overwrite each
// other's line (decision of the direction; `specs/012-ecb-reference-rates/
// questions.md` §1 and §8). The folder can still be **linked for reading**, on
// the desktop only (research.md §4 of feature 006): to import the console's
// ledger and to read the ECB history. So the export reminder is the safety net
// everywhere, not only on the phone.

import { supportsDirectoryPicker } from "@atlas/adapters/browser";

/**
 * What a session remembers. `directory` is only ever **read**, from a session
 * of before feature 012: it is how the boot knows to say that the web no longer
 * writes in the folder instead of opening an empty ledger in silence.
 */
export type LedgerSourceKind = "directory" | "browser";

export interface BrowserSource {
  kind: "browser";
  /** Absent when it has never been exported: the worst case of ADR-0019. */
  lastExportAt?: string;
  /** Whether the browser agreed not to evict the data. */
  persisted: boolean;
}

export type LedgerSource = BrowserSource;

/** Whether this browser can link a folder to read, so the interface never shows a dead button. */
export const canLinkFolder = (): boolean => supportsDirectoryPicker();

const KEY = "atlas.source";

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    // Private mode with blocked storage: preferences are simply not remembered.
    return undefined;
  }
};

export const rememberedKind = (): LedgerSourceKind | undefined => {
  const value = storage()?.getItem(KEY);
  return value === "directory" || value === "browser" ? value : undefined;
};

export const rememberKind = (kind: "browser"): void => {
  try {
    storage()?.setItem(KEY, kind);
  } catch {
    // Not remembering the choice is a minor loss; failing to open is not.
  }
};

export const forgetKind = (): void => {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Same.
  }
};

/** How long without exporting before the chip nags (prompt §3.2). */
export const EXPORT_REMINDER_DAYS = 7;

/** Days since the last export, or `undefined` when it has never been exported. */
export const daysSinceExport = (source: BrowserSource, today: string): number | undefined => {
  if (source.lastExportAt === undefined) {
    return undefined;
  }
  const exported = source.lastExportAt.slice(0, 10);
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${exported}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
};

/** Whether the export reminder is due: never exported, or more than a week ago. */
export const exportIsOverdue = (source: LedgerSource, today: string): boolean => {
  const days = daysSinceExport(source, today);
  return days === undefined || days > EXPORT_REMINDER_DAYS;
};

/** Where the ledger is, written in full: the settings screen has the room. */
export const sourceLabel = (_source: LedgerSource): string => "Almacenamiento del navegador";

/**
 * The same thing in as few words as possible, for the chip of the status bar
 * (FR-011). "Almacenamiento del navegador" needed 229px of a 400px bar and came
 * out as "Almacenamiento del naveg…", which says less than "Navegador" does in
 * a third of the width (review of 2026-09-18). The full sentence stays one tap
 * away, in the chip's `title` and in Ajustes.
 */
export const sourceShortLabel = (_source: LedgerSource): string => "Navegador";
