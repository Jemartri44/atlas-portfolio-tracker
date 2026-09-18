// Where the ledger comes from, and what this browser can actually offer.
//
// Measured, not assumed (research.md §4): the File System Access API exists
// only in Chrome and Edge on the desktop — **not in any mobile browser** — so
// on the phone, which is the daily device, the ledger always lives in the
// browser and the export reminder is the only safety net (decision (l)).

import { supportsDirectoryPicker } from "@atlas/adapters/browser";

export type LedgerSourceKind = "directory" | "browser";

export interface DirectorySource {
  kind: "directory";
  /** Folder the user chose, to show it. */
  directoryName: string;
  fileName: string;
  permission: "granted" | "prompt" | "denied";
}

export interface BrowserSource {
  kind: "browser";
  /** Absent when it has never been exported: the worst case of ADR-0019. */
  lastExportAt?: string;
  /** Whether the browser agreed not to evict the data. */
  persisted: boolean;
}

export type LedgerSource = DirectorySource | BrowserSource;

/** Which paths this browser can offer, so the interface never shows a dead button. */
export const canUseDirectory = (): boolean => supportsDirectoryPicker();

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

export const rememberKind = (kind: LedgerSourceKind): void => {
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
  if (source.kind !== "browser") {
    return false;
  }
  const days = daysSinceExport(source, today);
  return days === undefined || days > EXPORT_REMINDER_DAYS;
};

/** What the chip of the status bar says (FR-011). */
export const sourceLabel = (source: LedgerSource): string =>
  source.kind === "directory"
    ? `${source.fileName} · ${source.directoryName}`
    : "Almacenamiento del navegador";
