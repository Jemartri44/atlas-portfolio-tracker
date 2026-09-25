// What a synced device may not do, decided in one place and each refusal with
// its own literal (ADR-0026, Part A and Part B; ADR-0032; §6.2 P2 to P5 and
// §6.3 (V5) of prompt 014). The orders that act on the remote (compact of the
// remote, restore, forget a device) are feature 015's; this is the pure
// function they will ask.

import type { DeviceQueueState } from "../ports/remote-ledger.js";
import type { SyncPresence } from "./marker.js";

export interface Refusal {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/** The marker a refusal is about: unreadable, or missing with `sync/` present. */
const markerState = (presence: SyncPresence): "unreadable" | "missing" | undefined =>
  presence.present && typeof presence.marker === "string" ? presence.marker : undefined;

/**
 * Whether `atlas compact` may rewrite **this folder**: never while it is
 * synced — it is a replica, and compacting it would leave the marker
 * meaningless and upload as pending the waivers it writes (ADR-0026, Part A) —,
 * nor with the marker unreadable, nor with `sync/` and no marker. A folder
 * whose sync was deactivated explicitly may compact again (D-Q6).
 */
export const compactPermission = (presence: SyncPresence): Refusal | undefined => {
  const marker = markerState(presence);
  if (marker === "unreadable") {
    return { code: "compact_refused_marker_unreadable", details: {} };
  }
  if (marker === "missing") {
    return { code: "compact_refused_marker_missing", details: {} };
  }
  return presence.present &&
    typeof presence.marker === "object" &&
    presence.marker.status === "enabled"
    ? { code: "compact_refused_folder_synced", details: {} }
    : undefined;
};

/**
 * Whether the **remote** may be rewritten (compacted or restored, from a
 * folder that administers it): refused with pending lines in this folder or
 * published by any known device. **Only what is pending blocks**; what a device
 * holds back lives there, is never uploaded alone and does not depend on the
 * remote being rewritten (§6.3 (V5)).
 */
export const rewritePermission = (
  presence: SyncPresence,
  pendingHere: number,
  devices: readonly (DeviceQueueState & { readonly device_id: string })[],
): Refusal | undefined => {
  const marker = markerState(presence);
  if (marker === "unreadable") {
    return { code: "rewrite_refused_marker_unreadable", details: {} };
  }
  if (marker === "missing") {
    return { code: "rewrite_refused_marker_missing", details: {} };
  }
  if (pendingHere > 0) {
    return { code: "rewrite_refused_pending_here", details: { pending: pendingHere } };
  }
  const blocking = devices.filter((device) => device.pending > 0).map((device) => device.device_id);
  return blocking.length > 0
    ? { code: "rewrite_refused_pending_devices", details: { devices: blocking } }
    : undefined;
};

/**
 * Whether an import may replace the ledger of a synced web: never (§6.2 P2).
 * It would wipe what is pending, and an import over a shared ledger is exactly
 * the rewrite the sync detects. Deactivate first, explicitly.
 */
export const importPermission = (presence: SyncPresence): Refusal | undefined =>
  presence.present &&
  !(typeof presence.marker === "object" && presence.marker.status === "disabled")
    ? { code: "import_refused_synced", details: {} }
    : undefined;

/**
 * Whether the sync may be deactivated: never with pending lines, which would
 * never reach the remote and nobody would know (§6.2 P4); nor with the marker
 * unreadable (sync first: it rebuilds it). What is held back **stays**.
 */
export const deactivatePermission = (
  presence: SyncPresence,
  pendingHere: number,
): Refusal | undefined => {
  if (markerState(presence) === "unreadable") {
    return { code: "deactivate_refused_marker_unreadable", details: {} };
  }
  return pendingHere > 0
    ? { code: "deactivate_refused_pending", details: { pending: pendingHere } }
    : undefined;
};
