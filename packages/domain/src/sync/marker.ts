// The marker of a synced device (`sync/state.json`, and the key `sync:state`
// of the browser): how many lines of the ledger are synced and the hash of
// their bytes (ADR-0026, Part B). It is **not a mere cache**: when it cannot be
// read, `compact` refuses (second amendment), and so does everything that
// relies on "the ledger is not synced". To sync, it can be rebuilt: the part in
// common with the remote is what is synced.
//
// It also remembers the confirmations the user gave while resolving what was
// held back (plan §10.1): a line of the ledger does not keep them.

import { ValidationError } from "../errors.js";
import { isRecord } from "../guards.js";
import { prefixSha256 } from "./lines.js";

export const SYNC_FORMAT = 1;

/** A confirmation given to a line held back, until the remote has it. */
export interface SyncConfirmation {
  /** SHA-256 of the bytes of the line. */
  readonly line_sha256: string;
  /** Ids whose fingerprint the line repeats, confirmed. */
  readonly duplicates: readonly string[];
  /** Filings in force of the years the line falls in, confirmed. */
  readonly closed: readonly string[];
  readonly confirmed_at: string;
}

export interface SyncMarker {
  readonly sync_format: 1;
  /** `disabled` after the explicit deactivation: what is held back stays (D-Q6). */
  readonly status: "enabled" | "disabled";
  readonly synced_lines: number;
  readonly synced_sha256: string;
  readonly remote_etag?: string;
  readonly last_sync_at?: string;
  readonly disabled_at?: string;
  readonly confirmations: readonly SyncConfirmation[];
}

const unreadable = (reason: string): ValidationError =>
  new ValidationError("sync_marker_unreadable", `the sync marker cannot be read: ${reason}`, {
    reason,
  });

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

/**
 * Reads a marker, strictly: anything that is not exactly a marker of a format
 * this code knows is unreadable, and unreadable is the safe side (compact and
 * `acceptInvalid` refuse; a sync rebuilds it).
 */
export const parseMarker = (text: string): SyncMarker => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw unreadable("json");
  }
  if (!isRecord(value) || value.sync_format !== SYNC_FORMAT) {
    throw unreadable("format");
  }
  const { status, synced_lines, synced_sha256, confirmations } = value;
  if (
    (status !== "enabled" && status !== "disabled") ||
    typeof synced_lines !== "number" ||
    !Number.isSafeInteger(synced_lines) ||
    synced_lines < 0 ||
    typeof synced_sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(synced_sha256) ||
    !Array.isArray(confirmations)
  ) {
    throw unreadable("fields");
  }
  for (const key of ["remote_etag", "last_sync_at", "disabled_at"]) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      throw unreadable("fields");
    }
  }
  for (const entry of confirmations) {
    if (
      !isRecord(entry) ||
      typeof entry.line_sha256 !== "string" ||
      !isStringList(entry.duplicates) ||
      !isStringList(entry.closed) ||
      typeof entry.confirmed_at !== "string"
    ) {
      throw unreadable("confirmations");
    }
  }
  return value as unknown as SyncMarker;
};

export const serializeMarker = (marker: SyncMarker): string => `${JSON.stringify(marker)}\n`;

/** The marker of a device whose first `count` lines are the remote's. */
export const markerFor = (
  lines: readonly string[],
  count: number,
  extra: Partial<Omit<SyncMarker, "sync_format" | "synced_lines" | "synced_sha256">> = {},
): SyncMarker => ({
  sync_format: SYNC_FORMAT,
  status: "enabled",
  confirmations: [],
  ...extra,
  synced_lines: count,
  synced_sha256: prefixSha256(lines, count),
});

/**
 * How many leading lines the local ledger and the remote have in common, byte
 * for byte: the synced prefix, rebuilt when the marker is lost or unreadable.
 */
export const commonPrefix = (local: readonly string[], remote: readonly string[]): number => {
  let count = 0;
  while (count < local.length && count < remote.length && local[count] === remote[count]) {
    count += 1;
  }
  return count;
};

/**
 * What a device knows about its own sync state, as its store reads it: nothing
 * (never synced), or a folder `sync/` (or keys `sync:*`) with a marker that is
 * missing, unreadable or read.
 */
export type SyncPresence =
  | { readonly present: false }
  | { readonly present: true; readonly marker: SyncMarker | "missing" | "unreadable" };

/**
 * **Sync configured** (§6.3 (V7), decision D-Q6 of the direction): the folder
 * `sync/` exists and the marker does not say `disabled`. A missing or
 * unreadable marker counts as configured: that is the safe side.
 */
export const syncConfigured = (presence: SyncPresence): boolean =>
  presence.present &&
  !(typeof presence.marker === "object" && presence.marker.status === "disabled");

/**
 * The same rule over the raw texts a store keeps, without reading the marker
 * whole: a store that only has to answer «configured?» — the web, before an
 * `acceptInvalid` — does not need to load the parser. Present and not saying
 * `disabled` is configured; unreadable is configured too.
 */
export const syncConfiguredByText = (present: boolean, markerText: string | undefined): boolean => {
  if (!present) {
    return false;
  }
  try {
    return (JSON.parse(markerText ?? "null") as { status?: unknown } | null)?.status !== "disabled";
  } catch {
    return true;
  }
};
