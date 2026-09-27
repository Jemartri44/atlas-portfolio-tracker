// The sync of this browser with the API (feature 015, E4; ADR-0026, Part B):
// the orchestration of the 014 (`@atlas/adapters/sync-client`) over this
// browser's store — IndexedDB, one transaction per write — and the HTTP
// client of E3 with the cookie, to the page's own origin. **Every order is
// explicit**: nothing runs at boot, on a timer or when the connection comes
// back. The device is the session's (`GET /api/session`); the browser keeps
// the one it joined with, and a session with another does not sync: joining
// again is the way out (§27.4). Loaded lazily from Ajustes (Q7).

import { BrowserSyncStore } from "@atlas/adapters/sync";
import {
  deactivateSync,
  finishInitialisation,
  initialiseRemote,
  joinWithOwnLines,
  replaceFromRemote,
  type SyncOptions,
  type SyncOutcome,
  syncDevice,
} from "@atlas/adapters/sync-client";
import { httpRemote } from "@atlas/adapters/sync-http";
import { CURRENT_LEDGER_SCHEMA } from "@atlas/domain";
import {
  initState,
  parseHeld,
  type Refusal,
  RemoteError,
  remoteFailed,
  unresolvedHeld,
  webJoinRefusal,
  webSyncRefusal,
} from "@atlas/domain/sync";
import { readSession } from "./session.js";

export interface WebSyncEnv {
  /** The network: only the API of this origin, with the cookie. */
  readonly fetch: typeof fetch;
  /** IndexedDB; the browser's own when absent. */
  readonly open?: () => Promise<IDBDatabase>;
  readonly now?: () => Date;
}

export type StartHow = "init" | "join_from_remote" | "join_with_mine";

export type WebOutcome =
  | (SyncOutcome & {
      /** Operations held back by this order: joining from the cloud or downloading it again (review of PR #97, N3). */
      readonly retained?: number;
    })
  | { readonly status: "refused"; readonly refusal: Refusal };

/** What the card shows: whether it syncs, as which device, and its queue. */
export interface WebSyncStatus {
  readonly configured: boolean;
  readonly enabled: boolean;
  /** The marker is missing: a start cut before its end, which starting again finishes. */
  readonly half: boolean;
  readonly joined: string | undefined;
  /** Lines not in the cloud yet; unknown without a marker. */
  readonly pending: number | undefined;
  readonly held: number;
  readonly lastSyncAt: string | undefined;
}

export const storeOf = (env: WebSyncEnv): BrowserSyncStore =>
  env.open === undefined ? new BrowserSyncStore() : new BrowserSyncStore(env.open);

/** The remote as this device: every request names it, and the API refuses another (§5.4). */
const remoteOf = (env: WebSyncEnv, device: string) =>
  httpRemote({ origin: "", fetch: env.fetch, expectedDevice: device });

/** What a session that is not signed in is, as the failure of the remote it would be. */
const SIGNED_OUT: Readonly<Record<string, string>> = {
  signed_out: "unauthenticated",
  expired: "session_invalid",
  not_allowed: "not_allowed",
  forgotten: "device_forgotten",
};

/**
 * The device of the session **now**, read again before every order (review
 * of PR #97, security B1): the page may have been painted under another
 * session, signed in again in another tab. The API checks it as well.
 */
const sessionNow = async (env: WebSyncEnv): Promise<string | WebOutcome> => {
  const session = await readSession(env.fetch);
  if (session.kind === "signed_in") {
    return session.deviceId;
  }
  const code =
    session.kind === "unavailable" ? session.code : (SIGNED_OUT[session.kind] ?? "unauthenticated");
  return {
    status: "stopped",
    stop: { code: "remote_failed", details: { remote_code: code } },
  };
};

const unresolvedOf = (heldText: string): number => unresolvedHeld(parseHeld(heldText)).length;

/** The operations held back and not resolved: the lines of every unit. */
const heldLinesOf = (heldText: string): number =>
  unresolvedHeld(parseHeld(heldText)).reduce((sum, unit) => sum + unit.lines.length, 0);

/** Joins from the cloud or downloads it again, and says how many units it held back. */
const replaceCounting = async (
  store: BrowserSyncStore,
  remote: ReturnType<typeof remoteOf>,
  options: SyncOptions,
  how: "join" | "redownload",
): Promise<WebOutcome> => {
  const before = heldLinesOf((await store.read()).heldText);
  const outcome = await replaceFromRemote(store, remote, options, how);
  if (outcome.status !== "synced") {
    return outcome;
  }
  return { ...outcome, retained: heldLinesOf((await store.read()).heldText) - before };
};

export const optionsOf = (env: WebSyncEnv, device?: string): SyncOptions => ({
  schema: CURRENT_LEDGER_SCHEMA,
  now: env.now ?? (() => new Date()),
  ...(device === undefined ? {} : { remoteJson: device }),
});

export const webSyncStatus = async (env: WebSyncEnv): Promise<WebSyncStatus> => {
  const state = await storeOf(env).read();
  const marker =
    state.presence.present && typeof state.presence.marker === "object"
      ? state.presence.marker
      : undefined;
  return {
    configured: state.presence.present,
    enabled: marker === undefined ? state.presence.present : marker.status === "enabled",
    half: state.presence.present && state.presence.marker === "missing",
    joined: state.remoteText,
    pending: marker === undefined ? undefined : state.ledger.lines.length - marker.synced_lines,
    held: unresolvedOf(state.heldText),
    lastSyncAt: marker?.last_sync_at,
  };
};

/** Sincronizar: only as the device this browser joined with, which the session must still be. */
export const syncNow = async (env: WebSyncEnv): Promise<WebOutcome> => {
  const session = await sessionNow(env);
  if (typeof session !== "string") {
    return session;
  }
  const store = storeOf(env);
  const state = await store.read();
  const refusal = webSyncRefusal(state.presence, state.remoteText, session);
  if (refusal !== undefined) {
    return { status: "refused", refusal };
  }
  return syncDevice(store, remoteOf(env, session), optionsOf(env));
};

/**
 * Empezar, always an explicit choice: upload the whole ledger to an empty
 * cloud, or join one that has a ledger — from the cloud, or with this
 * browser's operations as pending. The device of the session, read now, is
 * recorded in the same transaction as the marker.
 */
export const startSync = async (env: WebSyncEnv, how: StartHow): Promise<WebOutcome> => {
  const session = await sessionNow(env);
  if (typeof session !== "string") {
    return session;
  }
  const store = storeOf(env);
  const state = await store.read();
  const refusal = webJoinRefusal(
    state.presence,
    state.remoteText,
    session,
    how === "init" ? "init" : "join",
  );
  if (refusal !== undefined) {
    return { status: "refused", refusal };
  }
  const remote = remoteOf(env, session);
  const options = optionsOf(env, session);
  if (how === "join_from_remote") {
    return replaceCounting(store, remote, options, "join");
  }
  if (how === "join_with_mine") {
    return (await joinWithOwnLines(store, remote, options)).outcome;
  }
  let snapshot: Awaited<ReturnType<typeof remote.read>>;
  try {
    snapshot = await remote.read();
  } catch (error) {
    if (error instanceof RemoteError) {
      return { status: "stopped", stop: remoteFailed(error) };
    }
    throw error;
  }
  const found = initState(state.ledger.lines, snapshot.text);
  if (found === "other") {
    return { status: "refused", refusal: { code: "init_remote_not_empty", details: {} } };
  }
  return found === "same"
    ? finishInitialisation(store, snapshot, options)
    : initialiseRemote(store, remote, options);
};

/** Volver a descargar, only when the user asks, after the cloud was rewritten; as the joined device. */
export const redownload = async (env: WebSyncEnv): Promise<WebOutcome> => {
  const session = await sessionNow(env);
  if (typeof session !== "string") {
    return session;
  }
  const store = storeOf(env);
  const state = await store.read();
  const refusal = webSyncRefusal(state.presence, state.remoteText, session);
  if (refusal !== undefined) {
    return { status: "refused", refusal };
  }
  return replaceCounting(store, remoteOf(env, session), optionsOf(env), "redownload");
};

/** Desactivar: refused with pending lines; what is held stays here. */
export const deactivate = async (env: WebSyncEnv): Promise<Refusal | undefined> =>
  deactivateSync(storeOf(env), optionsOf(env));
