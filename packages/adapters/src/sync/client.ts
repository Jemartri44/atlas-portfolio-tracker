// The seven steps of a sync (ADR-0026, Part B) over a device's own store and a
// remote, **the same for the console and the web**: the only thing that
// changes is the store of the device, and each client brings its own (the
// folder under its lock, IndexedDB in one transaction). No rule lives here —
// what is a unit, what is held back, what is refused is the domain's —; this
// only orders the reads and the writes.
//
// Two rules of the order, which the tests hold:
//
// - **Nothing of the remote with the local store held.** The remote is read
//   and written between the reads and the one write of the store, never
//   inside it: in feature 015 the remote is the network.
// - **Step 6 is one write** that demands everything read at step 1 is still
//   there (the ledger, what is held back, the marker). If anything changed —
//   another console, another tab —, nothing is written and the sync starts
//   again from step 1.

import {
  ArchiveExistsError,
  type CivilDate,
  ConflictError,
  type LedgerSchema,
  type LoadedLedger,
  madridDateOf,
} from "@atlas/domain";
import {
  type DeviceChange,
  type DeviceState,
  EMPTY_ETAG,
  type HeldUnit,
  holdRecords,
  initDuplicateIds,
  initRefusal,
  inspect,
  joinWithMine,
  lineSha256,
  linesOfText,
  localChanged,
  markerFor,
  parseHeld,
  planUpload,
  publishFailed,
  type Refusal,
  RemoteError,
  type RemoteLedger,
  remoteContention,
  remoteFailed,
  replaceWithRemote,
  type SyncMarker,
  type SyncPresence,
  type SyncStateStore,
  type SyncStop,
  settle,
  syncArchiveName,
  syncPermission,
  textOfLines,
  unitAtEntry,
  unresolvedHeld,
} from "@atlas/domain/sync";
import { MAX_ARCHIVE_NAMES, withArchiveNames } from "./archive-names.js";

/** How many times a sync starts again after a `412` or a local change (decision D-Q9). */
export const MAX_REMOTE_RACES = 3;
export const MAX_LOCAL_CHANGES = 3;

export { MAX_ARCHIVE_NAMES, withArchiveNames };

export interface SyncOptions {
  readonly schema: LedgerSchema;
  readonly now: () => Date;
  /**
   * The exact text of `sync/remote.json` that initialising or joining writes,
   * first of its one write (the console, feature 015, §7 P16). Never a sync's.
   */
  readonly remoteJson?: string;
}

/** What initialising and joining add to their one write: the folder's remote, first. */
const identityOf = (options: SyncOptions): { readonly remote?: string } =>
  options.remoteJson === undefined ? {} : { remote: options.remoteJson };

export type SyncOutcome =
  | {
      readonly status: "synced";
      /** Lines uploaded and found in the remote. */
      readonly uploaded: number;
      /** The unit held back in this sync, with its reason, if any. */
      readonly held?: { readonly lines: readonly string[]; readonly code: string };
      readonly pending: number;
      /** Something went wrong after writing: said, not fatal. */
      readonly notice?: SyncStop;
    }
  | { readonly status: "stopped"; readonly stop: SyncStop }
  | { readonly status: "refused"; readonly refusal: Refusal };

const markerOf = (presence: SyncPresence): SyncMarker | undefined =>
  presence.present && typeof presence.marker === "object" ? presence.marker : undefined;

const unresolvedOf = (state: DeviceState): HeldUnit[] => unresolvedHeld(parseHeld(state.heldText));

/** The ledger change that turns `current` into `next`: nothing, a pure append, or a replace that archives first. */
const ledgerChange = (
  current: LoadedLedger,
  next: readonly string[],
  kind: "sync" | "join" | "redownload",
  now: Date,
  attempt = 1,
): DeviceChange["ledger"] => {
  const prefix = current.lines.every((line, index) => next[index] === line);
  if (prefix && next.length === current.lines.length) {
    return undefined;
  }
  return prefix && next.length > current.lines.length
    ? { append: next.slice(current.lines.length) }
    : { replace: next, archive: syncArchiveName(kind, now, current.etag, attempt) };
};

const readRemote = async (remote: RemoteLedger) => {
  try {
    return { snapshot: await remote.read() };
  } catch (error) {
    if (error instanceof RemoteError) {
      return { stop: remoteFailed(error) };
    }
    throw error;
  }
};

/**
 * One sync, steps 1 to 7. It never holds a line back for anything but a
 * refusal of the domain or of the remote **for that line**; every other
 * failure stops it with everything pending where it was (§6.3 (V4)).
 */
export const syncDevice = async (
  store: SyncStateStore,
  remote: RemoteLedger,
  options: SyncOptions,
): Promise<SyncOutcome> => {
  let races = 0;
  let changes = 0;
  let archiveAttempt = 1;
  for (;;) {
    // Step 1: the device, then the remote, the store not held.
    const state = await store.read();
    const refusal = syncPermission(state.presence);
    if (refusal !== undefined) {
      return { status: "refused", refusal };
    }
    const held = unresolvedOf(state);
    const heldLines = held.flatMap((unit) => unit.lines);
    const local = {
      lines: state.ledger.lines,
      events: state.ledger.events,
      marker: markerOf(state.presence),
      held: heldLines,
      confirmations: markerOf(state.presence)?.confirmations ?? [],
    };
    const read = await readRemote(remote);
    if (read.stop !== undefined) {
      return { status: "stopped", stop: read.stop };
    }
    const inspection = inspect(local, read.snapshot.text, options.schema);
    if ("stop" in inspection) {
      return { status: "stopped", stop: inspection.stop };
    }
    // Steps 2 and 3.
    const now = options.now();
    const today: CivilDate = madridDateOf(now);
    const plan = planUpload(local, inspection, today);
    let hold:
      | {
          unit: (typeof plan.units)[number];
          reason: { code: string; details: Readonly<Record<string, unknown>> };
          origin: "client" | "remote";
        }
      | undefined = plan.hold === undefined ? undefined : { ...plan.hold, origin: "client" };
    // Step 4.
    if (plan.entries.length > 0) {
      let answer: Awaited<ReturnType<RemoteLedger["append"]>>;
      try {
        answer = await remote.append(plan.entries, read.snapshot.etag);
      } catch (error) {
        if (error instanceof RemoteError && error.code === "precondition_failed") {
          races += 1;
          if (races >= MAX_REMOTE_RACES) {
            return { status: "stopped", stop: remoteContention(races) };
          }
          continue;
        }
        if (error instanceof RemoteError) {
          return { status: "stopped", stop: remoteFailed(error) };
        }
        throw error;
      }
      const rejected = answer.rejected;
      const unit = rejected === undefined ? undefined : unitAtEntry(plan.units, rejected.index);
      if (rejected !== undefined && unit !== undefined) {
        hold = {
          unit,
          reason: { code: rejected.code, details: rejected.details },
          origin: "remote" as const,
        };
      }
    }
    // Step 5: what is in the remote is known by reading it again, never by the answer.
    const again = await readRemote(remote);
    if (again.stop !== undefined) {
      return { status: "stopped", stop: again.stop };
    }
    const newRemote = linesOfText(again.snapshot.text);
    if (inspection.remoteLines.some((line, index) => newRemote[index] !== line)) {
      return { status: "stopped", stop: { code: "remote_rewritten", details: {} } };
    }
    const newlyHeld = hold === undefined ? [] : [...hold.unit.lines];
    const settled = settle(local, inspection.synced, newRemote, [...heldLines, ...newlyHeld]);
    const inRemote = new Set(newRemote.map(lineSha256));
    const marker = markerFor(settled.lines, newRemote.length, {
      remote_etag: again.snapshot.etag,
      last_sync_at: now.toISOString(),
      confirmations: local.confirmations.filter((entry) => !inRemote.has(entry.line_sha256)),
    });
    // Step 6: one write, on everything read at step 1.
    try {
      await store.commit(state, {
        ...(hold === undefined
          ? {}
          : {
              held: holdRecords(hold.unit.lines, hold.origin, hold.reason, now.toISOString()),
            }),
        ledger: ledgerChange(state.ledger, settled.lines, "sync", now, archiveAttempt),
        marker,
      });
    } catch (error) {
      if (error instanceof ArchiveExistsError && archiveAttempt < MAX_ARCHIVE_NAMES) {
        // A write cut after archiving, retried within the same second: the
        // archive is there, and it is never overwritten. The next name.
        archiveAttempt += 1;
        continue;
      }
      if (error instanceof ConflictError) {
        changes += 1;
        if (changes >= MAX_LOCAL_CHANGES) {
          return { status: "stopped", stop: localChanged(changes) };
        }
        continue;
      }
      throw error;
    }
    // Step 7: the state of the queue; the device is the credential's, never ours.
    const heldCount = heldLines.length + newlyHeld.length;
    let notice: SyncStop | undefined;
    try {
      await remote.publish({
        pending: settled.remaining.length,
        held: heldCount,
        last_sync_at: now.toISOString(),
      });
    } catch (error) {
      if (!(error instanceof RemoteError)) {
        throw error;
      }
      notice = publishFailed(error);
    }
    const uploaded = inspection.queue.filter((line) => new Set(newRemote).has(line)).length;
    return {
      status: "synced",
      uploaded,
      pending: settled.remaining.length,
      ...(hold === undefined ? {} : { held: { lines: hold.unit.lines, code: hold.reason.code } }),
      ...(notice === undefined ? {} : { notice }),
    };
  }
};

/**
 * The first device: refuses **before calling** when its ledger is not valid
 * (V7), derives the confirmations of repeated fingerprints from the file
 * (V17), uploads the whole bytes on the etag of nothing, and marks everything
 * synced.
 */
export const initialiseRemote = async (
  store: SyncStateStore,
  remote: RemoteLedger,
  options: SyncOptions,
): Promise<SyncOutcome> => {
  const state = await store.read();
  const refusal = initRefusal(state.ledger.events);
  if (refusal !== undefined) {
    return { status: "refused", refusal };
  }
  let initialised: { etag: string; lines: number };
  try {
    initialised = await remote.init(
      textOfLines(state.ledger.lines),
      initDuplicateIds(state.ledger.events),
      EMPTY_ETAG,
    );
  } catch (error) {
    if (error instanceof RemoteError) {
      return { status: "stopped", stop: remoteFailed(error) };
    }
    throw error;
  }
  const now = options.now();
  await store.commit(state, {
    ...identityOf(options),
    marker: markerFor(state.ledger.lines, state.ledger.lines.length, {
      remote_etag: initialised.etag,
      last_sync_at: now.toISOString(),
    }),
  });
  return { status: "synced", uploaded: state.ledger.lines.length, pending: 0 };
};

/**
 * A device that joins with a ledger of its own **starting from the remote**
 * (decision D-Q5), or downloads a rewritten remote again — which only ever
 * happens when the user asks (ADR-0026, Part A). The local bytes are archived,
 * the ledger becomes the remote, and everything the device had that the remote
 * lacks, or has otherwise, is held back: never uploaded alone.
 */
export const replaceFromRemote = async (
  store: SyncStateStore,
  remote: RemoteLedger,
  options: SyncOptions,
  how: "join" | "redownload",
): Promise<SyncOutcome> => {
  const read = await readRemote(remote);
  if (read.stop !== undefined) {
    return { status: "stopped", stop: read.stop };
  }
  const inspection = inspect(
    { lines: [], events: [], marker: undefined, held: [], confirmations: [] },
    read.snapshot.text,
    options.schema,
  );
  if ("stop" in inspection) {
    return { status: "stopped", stop: inspection.stop };
  }
  const now = options.now();
  const lines = inspection.remoteLines;
  await withArchiveNames(async (attempt) => {
    const state = await store.read();
    await store.commit(state, {
      ...(how === "join" ? identityOf(options) : {}),
      held: replaceWithRemote(
        state.ledger,
        inspection.remoteEvents,
        how === "join" ? "join" : "rewrite",
        now.toISOString(),
      ),
      ledger: ledgerChange(state.ledger, lines, how, now, attempt),
      marker: markerFor(lines, lines.length, {
        remote_etag: read.snapshot.etag,
        last_sync_at: now.toISOString(),
      }),
    });
  });
  return { status: "synced", uploaded: 0, pending: 0 };
};

export interface JoinOutcome {
  readonly outcome: SyncOutcome;
  /** Local lines already invalid: they will be held back when re-applied (V7). */
  readonly invalid: readonly { readonly id: string; readonly code: string }[];
}

/** Joins **uploading the device's own lines as pending**: the next sync re-applies them. */
export const joinWithOwnLines = async (
  store: SyncStateStore,
  remote: RemoteLedger,
  options: SyncOptions,
): Promise<JoinOutcome> => {
  const read = await readRemote(remote);
  if (read.stop !== undefined) {
    return { outcome: { status: "stopped", stop: read.stop }, invalid: [] };
  }
  const now = options.now();
  const joined = await withArchiveNames(async (attempt) => {
    const state = await store.read();
    const mine = joinWithMine(state.ledger, linesOfText(read.snapshot.text));
    await store.commit(state, {
      ...identityOf(options),
      ledger: ledgerChange(state.ledger, mine.lines, "join", now, attempt),
      marker: markerFor(mine.lines, mine.synced, { remote_etag: read.snapshot.etag }),
    });
    return mine;
  });
  return {
    outcome: { status: "synced", uploaded: 0, pending: joined.lines.length - joined.synced },
    invalid: joined.invalid,
  };
};

export type { DeviceChange, DeviceState, SyncStateStore } from "@atlas/domain/sync";
export {
  confirmHeldUnit,
  deactivateSync,
  discardHeldUnit,
  finishRedo,
  type HeldView,
  heldUnits,
  recordRedoPlan,
  startRedo,
} from "./held-actions.js";
