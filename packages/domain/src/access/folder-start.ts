// Which remote a folder of the console syncs with, and which entry of
// `credentials.json` each order may use (feature 015, E3, block 4; plan §7;
// §7 P7 and P16; §7.1 bis, B2 and N4). **By identity, never by resemblance**:
// the remote is what `sync/remote.json` says or what the user names, never
// deduced; the entry is the one of that device and that origin, or — to start
// — the one whose hint is exactly this folder.
//
// The four states of plan §7, every one of them failsafe and recognised:
// - `unsynced` (S0): no `sync/`;
// - `half` (S1): `remote.json` without a marker — an initialisation or a join
//   cut between its two writes;
// - `synced` (S2): both;
// - `unknown_remote` (S3): a marker without `remote.json` — a folder of
//   feature 014 or before —; nothing is deduced, the user names the remote.

import type { SyncPresence } from "../sync/marker.js";
import {
  type CredentialEntry,
  type CredentialsFile,
  entryForRemote,
  entryForStart,
  type RemoteJson,
} from "./credentials.js";

export type FolderSyncState =
  | { readonly state: "unsynced" }
  | { readonly state: "half"; readonly remote: RemoteJson }
  | { readonly state: "synced"; readonly remote: RemoteJson; readonly enabled: boolean }
  | { readonly state: "unknown_remote" };

export const folderSyncState = (
  presence: SyncPresence,
  remote: RemoteJson | undefined,
): FolderSyncState => {
  if (!presence.present) {
    return { state: "unsynced" };
  }
  if (remote === undefined) {
    return { state: "unknown_remote" };
  }
  if (presence.marker === "missing") {
    return { state: "half", remote };
  }
  return {
    state: "synced",
    remote,
    // An unreadable marker counts as configured: the safe side (D-Q6).
    enabled: typeof presence.marker === "string" || presence.marker.status === "enabled",
  };
};

export type EntryChoice =
  | { readonly entry: CredentialEntry; readonly remote: RemoteJson }
  | {
      readonly refused:
        | "sync_not_configured"
        | "sync_remote_unknown"
        | "sync_credential_missing"
        | "sync_already_configured"
        | "sync_remote_mismatch"
        | "sync_origin_missing"
        | "credentials_no_entry_for_folder";
    }
  | { readonly refused: "credentials_several_for_folder"; readonly devices: readonly string[] };

/** The entry `remote.json` names, and only that one (B2). */
const named = (file: CredentialsFile, remote: RemoteJson): EntryChoice => {
  const entry = entryForRemote(file, remote);
  return entry === undefined ? { refused: "sync_credential_missing" } : { entry, remote };
};

/** Syncing, its status and downloading again: only with the entry `sync/remote.json` names. */
export const entryToSync = (state: FolderSyncState, file: CredentialsFile): EntryChoice => {
  if (state.state === "unsynced") {
    return { refused: "sync_not_configured" };
  }
  if (state.state === "unknown_remote") {
    return { refused: "sync_remote_unknown" };
  }
  return named(file, state.remote);
};

/**
 * Initialising and joining. In a half start (S1), only to finish it, with the
 * device and origin of `remote.json`. Never synced (S0), or synced without
 * `remote.json` (S3, joining only: that associates the folder), only with
 * the entry whose hint is exactly this folder, of the origin the user names.
 * A synced folder does neither; after deactivating, joining is the way back.
 */
export const entryToStart = (
  how: "init" | "join",
  state: FolderSyncState,
  file: CredentialsFile,
  folder: string,
  asked: { readonly origin?: string; readonly device?: string },
): EntryChoice => {
  if (state.state === "synced" && (state.enabled || how === "init")) {
    return { refused: "sync_already_configured" };
  }
  if (state.state === "unknown_remote" && how === "init") {
    return { refused: "sync_remote_unknown" };
  }
  if (state.state === "half" || state.state === "synced") {
    if (
      (asked.origin !== undefined && asked.origin !== state.remote.origin) ||
      (asked.device !== undefined && asked.device !== state.remote.device_id)
    ) {
      return { refused: "sync_remote_mismatch" };
    }
    return named(file, state.remote);
  }
  if (asked.origin === undefined) {
    return { refused: "sync_origin_missing" };
  }
  const start = entryForStart(file, asked.origin, folder, asked.device);
  if ("refused" in start) {
    return start;
  }
  return {
    entry: start.entry,
    remote: { format: 1, origin: start.entry.origin, device_id: start.entry.device_id },
  };
};
