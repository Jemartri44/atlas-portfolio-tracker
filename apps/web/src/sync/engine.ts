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
  confirmHeldUnit,
  deactivateSync,
  discardHeldUnit,
  finishInitialisation,
  finishRedo,
  type HeldView,
  heldUnits,
  initialiseRemote,
  joinWithOwnLines,
  recordRedoPlan,
  redoRecorded,
  replaceFromRemote,
  type SyncOptions,
  type SyncOutcome,
  startRedo,
  syncDevice,
} from "@atlas/adapters/sync-client";
import { httpRemote } from "@atlas/adapters/sync-http";
import {
  CURRENT_LEDGER_SCHEMA,
  createUlidGenerator,
  decodeLines,
  type LedgerEvent,
  type UseCaseDeps,
} from "@atlas/domain";
import {
  initState,
  parseHeld,
  type RedoPlan,
  type Refusal,
  RemoteError,
  type Resolution,
  remoteFailed,
  unresolvedHeld,
  webJoinRefusal,
  webSyncRefusal,
} from "@atlas/domain/sync";

export interface WebSyncEnv {
  /** The network: only the API of this origin, with the cookie. */
  readonly fetch: typeof fetch;
  /** IndexedDB; the browser's own when absent. */
  readonly open?: () => Promise<IDBDatabase>;
  readonly now?: () => Date;
}

export type StartHow = "init" | "join_from_remote" | "join_with_mine";

export type WebOutcome = SyncOutcome | { readonly status: "refused"; readonly refusal: Refusal };

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

const storeOf = (env: WebSyncEnv): BrowserSyncStore =>
  env.open === undefined ? new BrowserSyncStore() : new BrowserSyncStore(env.open);

const remoteOf = (env: WebSyncEnv) => httpRemote({ origin: "", fetch: env.fetch });

const optionsOf = (env: WebSyncEnv, device?: string): SyncOptions => ({
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
    held: unresolvedHeld(parseHeld(state.heldText)).length,
    lastSyncAt: marker?.last_sync_at,
  };
};

/** Sincronizar: only as the device this browser joined with. */
export const syncNow = async (env: WebSyncEnv, session: string): Promise<WebOutcome> => {
  const store = storeOf(env);
  const state = await store.read();
  const refusal = webSyncRefusal(state.presence, state.remoteText, session);
  if (refusal !== undefined) {
    return { status: "refused", refusal };
  }
  return syncDevice(store, remoteOf(env), optionsOf(env));
};

/**
 * Empezar, always an explicit choice: upload the whole ledger to an empty
 * cloud, or join one that has a ledger — from the cloud, or with this
 * browser's operations as pending. The device of the session is recorded in
 * the same transaction as the marker.
 */
export const startSync = async (
  env: WebSyncEnv,
  session: string,
  how: StartHow,
): Promise<WebOutcome> => {
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
  const remote = remoteOf(env);
  const options = optionsOf(env, session);
  if (how === "join_from_remote") {
    return replaceFromRemote(store, remote, options, "join");
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

/** Volver a descargar, only when the user asks, after the cloud was rewritten. */
export const redownload = async (env: WebSyncEnv, session: string): Promise<WebOutcome> => {
  const store = storeOf(env);
  const state = await store.read();
  const refusal = webSyncRefusal(state.presence, state.remoteText, session);
  if (refusal !== undefined) {
    return { status: "refused", refusal };
  }
  return replaceFromRemote(store, remoteOf(env), optionsOf(env), "redownload");
};

/** Desactivar: refused with pending lines; what is held stays here. */
export const deactivate = async (env: WebSyncEnv): Promise<Refusal | undefined> =>
  deactivateSync(storeOf(env), optionsOf(env));

export const heldList = (env: WebSyncEnv): Promise<HeldView[]> =>
  heldUnits(storeOf(env), optionsOf(env));

/** A held unit as the card shows it: why, what can be done, and its operations. */
export interface HeldItem {
  readonly unit: string;
  readonly reason: { readonly code: string; readonly details: Readonly<Record<string, unknown>> };
  readonly resolutions: readonly Resolution[];
  /** Each line read, or `undefined` when it cannot be read — held for exactly that. */
  readonly events: readonly (LedgerEvent | undefined)[];
}

const readable = (line: string): LedgerEvent | undefined => {
  try {
    return decodeLines([line], CURRENT_LEDGER_SCHEMA)[0];
  } catch {
    return undefined;
  }
};

export const heldItems = async (env: WebSyncEnv): Promise<HeldItem[]> =>
  (await heldList(env)).map((view) => ({
    unit: view.unit.unit,
    reason: view.unit.reason,
    resolutions: view.resolutions,
    events: view.unit.lines.map(readable),
  }));

export const confirmHeld = (env: WebSyncEnv, unit: string): Promise<void> =>
  confirmHeldUnit(storeOf(env), unit, optionsOf(env));

export const discardHeld = (
  env: WebSyncEnv,
  unit: string,
  only: "unit" | "reversal" = "unit",
): Promise<void> => discardHeldUnit(storeOf(env), unit, optionsOf(env), only);

/**
 * Rehacer, first half: the plan, with its ids sealed, for the user to see
 * before anything is recorded — or `recorded`, when a redo cut between
 * recording and finishing is already in the ledger by those ids, which only
 * finishes (review of PR #96, N1).
 */
export const planRedo = async (
  env: WebSyncEnv,
  deps: UseCaseDeps,
  unit: string,
): Promise<{ readonly plan: RedoPlan } | { readonly recorded: true }> => {
  const store = storeOf(env);
  const options = optionsOf(env);
  const ids = createUlidGenerator(deps);
  const plan = await startRedo(store, unit, () => ids.next(), options);
  if (await redoRecorded(store, unit, options)) {
    await finishRedo(store, unit, options);
    return { recorded: true };
  }
  return { plan };
};

/** Rehacer, second half, once the user confirmed the plan: exactly the sealed plan, then finished. */
export const recordRedo = async (
  env: WebSyncEnv,
  deps: UseCaseDeps,
  unit: string,
  plan: RedoPlan,
  confirmDuplicate: boolean,
): Promise<void> => {
  await recordRedoPlan(deps, plan, { confirmDuplicate });
  await finishRedo(storeOf(env), unit, optionsOf(env));
};
