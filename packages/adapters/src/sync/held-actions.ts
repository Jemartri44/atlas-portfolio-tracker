// Resolving what the sync held back, and deactivating it, over a device's own
// store (ADR-0026, Part B; plan §10 and §12.4; §6.2 P4). Every action is one
// write of the store on what it read, and **none of them needs the ledger to
// be valid** (decision D-Q1): the user can always get out of where the sync
// left them. Which resolutions exist is the domain's (`resolutionsFor`).

import { decodeLines } from "@atlas/domain";
import type { DeviceState, SyncStateStore } from "@atlas/domain/sync";
import {
  assertRedoRecorded,
  confirmHeld,
  type DiscardedRecord,
  deactivatePermission,
  discardHeld,
  type HeldUnit,
  heldUnitById,
  markerFor,
  parseDiscarded,
  parseHeld,
  type RedoPlan,
  type Refusal,
  type Resolution,
  redoFinished,
  resolutionsFor,
  type SyncMarker,
  startRedoPlan,
  syncArchiveName,
  unresolvedHeld,
} from "@atlas/domain/sync";
import type { SyncOptions } from "./client.js";

const markerOf = (state: DeviceState): SyncMarker | undefined =>
  state.presence.present && typeof state.presence.marker === "object"
    ? state.presence.marker
    : undefined;

/** The ids the remote certainly has: those of the synced prefix. Known without a connection. */
const remoteIdsOf = (state: DeviceState): Set<string> =>
  new Set(
    state.ledger.events.slice(0, markerOf(state)?.synced_lines ?? 0).map((event) => event.id),
  );

export interface HeldView {
  readonly unit: HeldUnit;
  readonly resolutions: readonly Resolution[];
}

/** What is held back now, each unit with what can be done with it. */
export const heldUnits = async (
  store: SyncStateStore,
  options: SyncOptions,
): Promise<HeldView[]> => {
  const state = await store.read();
  const remoteIds = remoteIdsOf(state);
  return unresolvedHeld(parseHeld(state.heldText)).map((unit: HeldUnit) => ({
    unit,
    resolutions: resolutionsFor(unit, decodeLines(unit.lines, options.schema), remoteIds),
  }));
};

/**
 * The decisions not in `discarded.jsonl` yet: a resolution cut after writing
 * there and before marking the line resolved is repeated without recording
 * the same decision twice (B1 of the review of PR #83) — by the decision,
 * never by the bytes of the line: a new decision on the same bytes is always
 * recorded (second review of PR #83).
 */
const notYetIn = (state: DeviceState, records: readonly DiscardedRecord[]): DiscardedRecord[] => {
  const there = new Set(parseDiscarded(state.discardedText).map((record) => record.decision));
  return records.filter((record) => !there.has(record.decision));
};

const unitOf = (state: DeviceState, id: string): HeldUnit =>
  heldUnitById(unresolvedHeld(parseHeld(state.heldText)), id);

/**
 * **Confirm**: the unit goes back to the queue in its local order and the
 * marker remembers the confirmation; the next sync uploads it declared.
 */
export const confirmHeldUnit = async (
  store: SyncStateStore,
  id: string,
  options: SyncOptions,
): Promise<void> => {
  const state = await store.read();
  const unit = unitOf(state, id);
  const marker = markerOf(state) ?? markerFor(state.ledger.lines, 0);
  const now = options.now().toISOString();
  const done = confirmHeld(
    unit,
    decodeLines(unit.lines, options.schema),
    remoteIdsOf(state),
    { lines: state.ledger.lines, synced: marker.synced_lines },
    now,
  );
  const pending = state.ledger.lines.length > marker.synced_lines;
  const unchanged = done.lines.length === state.ledger.lines.length;
  const known = new Set(marker.confirmations.map((entry) => entry.line_sha256));
  await store.commit(state, {
    held: done.records,
    // Back in its local order, in front of what is still pending: a move,
    // so the bytes before are archived like any sync that reorders. Nothing
    // to move when a cut left it there already.
    ledger: unchanged
      ? undefined
      : pending
        ? {
            replace: done.lines,
            archive: syncArchiveName("sync", options.now(), state.ledger.etag),
          }
        : { append: done.lines.slice(state.ledger.lines.length) },
    marker: {
      ...marker,
      confirmations: [
        ...marker.confirmations,
        ...done.confirmations.filter((entry) => !known.has(entry.line_sha256)),
      ],
    },
  });
};

/** **Discard**, explicit: the unit, or only the reversal of a pair, whose correction stays held. */
export const discardHeldUnit = async (
  store: SyncStateStore,
  id: string,
  options: SyncOptions,
  only: "unit" | "reversal" = "unit",
): Promise<void> => {
  const state = await store.read();
  const done = discardHeld(unitOf(state, id), options.now().toISOString(), only);
  await store.commit(state, { held: done.records, discarded: notYetIn(state, done.discarded) });
};

/**
 * **Redo**, first half: the plan the interface preloads, with the ids its
 * events will carry, **sealed before anything is recorded** (`newId` gives
 * them: a ULID generator of the device). Started again, the same ids.
 */
export const startRedo = async (
  store: SyncStateStore,
  id: string,
  newId: () => string,
  options: SyncOptions,
): Promise<RedoPlan> => {
  const state = await store.read();
  const unit = unitOf(state, id);
  const { plan, records } = startRedoPlan(
    unit,
    decodeLines(unit.lines, options.schema),
    remoteIdsOf(state),
    state.ledger.events,
    newId,
    options.now().toISOString(),
  );
  if (records.length > 0) {
    await store.commit(state, { held: records });
  }
  return plan;
};

/**
 * **Redo**, second half, once the plan is recorded with its sealed ids: the
 * redone lines go to `discarded` with the id that replaced each. Only events
 * with **exactly** the sealed ids finish it.
 */
export const finishRedo = async (
  store: SyncStateStore,
  id: string,
  options: SyncOptions,
): Promise<void> => {
  const state = await store.read();
  const unit = unitOf(state, id);
  const lines = assertRedoRecorded(
    unit,
    decodeLines(unit.lines, options.schema),
    state.ledger.events,
  );
  const done = redoFinished(unit, lines, options.now().toISOString());
  await store.commit(state, { held: done.records, discarded: notYetIn(state, done.discarded) });
};

/**
 * **Deactivate** the sync, explicitly (ADR-0026, second amendment): refused
 * with pending lines (P4) or an unreadable marker; the marker stays, saying
 * `disabled`, and what is held back **stays** (D-Q6), so compact and the
 * import are admitted again and nothing the user has not resolved is lost.
 */
export const deactivateSync = async (
  store: SyncStateStore,
  options: SyncOptions,
): Promise<Refusal | undefined> => {
  const state = await store.read();
  if (!state.presence.present) {
    // Never synced: there is nothing to deactivate, and nothing is created.
    return undefined;
  }
  const marker = markerOf(state);
  const pending = marker === undefined ? 0 : state.ledger.lines.length - marker.synced_lines;
  const refusal = deactivatePermission(state.presence, pending);
  if (refusal !== undefined) {
    return refusal;
  }
  const base = marker ?? markerFor(state.ledger.lines, state.ledger.lines.length);
  await store.commit(state, {
    marker: { ...base, status: "disabled", disabled_at: options.now().toISOString() },
  });
  return undefined;
};
