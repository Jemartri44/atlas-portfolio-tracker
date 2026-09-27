// The device a browser syncs as (feature 015, E4, block 2; §7 P1, option
// (a); `docs/api.md` §5.4). The API takes it from the signed cookie; the web
// keeps, in its store, **the id it joined with**, written in the same
// transaction as the marker. A session that brings another id — the one it
// had was forgotten, or never accepted — never publishes the old queue as the
// new device as if nothing had happened: the sync refuses, and **joining
// again** (from the cloud, or with its own operations) is the way out. What
// is pending is never lost, and joining is always explicit. By identity,
// never by resemblance.

import type { SyncPresence } from "./marker.js";
import { type Refusal, syncPermission } from "./permission.js";

/** Syncing: the presence says first, then the device must be the one it joined with. */
export const webSyncRefusal = (
  presence: SyncPresence,
  joined: string | undefined,
  session: string,
): Refusal | undefined => {
  const refused = syncPermission(presence);
  if (refused !== undefined) {
    return refused;
  }
  if (joined === undefined) {
    return { code: "sync_device_unknown", details: {} };
  }
  return joined === session
    ? undefined
    : { code: "sync_device_changed", details: { joined, session } };
};

/**
 * Starting — initialising or joining. A browser that never synced, or whose
 * sync is deactivated, starts. A half start (the device written, the marker
 * not) is finished only as that same device. A synced browser **joins again**
 * only when its device changed, or it never recorded one; it never
 * initialises again.
 */
export const webJoinRefusal = (
  presence: SyncPresence,
  joined: string | undefined,
  session: string,
  how: "init" | "join",
): Refusal | undefined => {
  if (!presence.present) {
    return undefined;
  }
  if (presence.marker === "missing") {
    return joined === undefined || joined === session
      ? undefined
      : { code: "sync_device_changed", details: { joined, session } };
  }
  const disabled = typeof presence.marker === "object" && presence.marker.status === "disabled";
  if (disabled) {
    return undefined;
  }
  return how === "join" && joined !== session
    ? undefined
    : { code: "sync_already_configured", details: {} };
};
