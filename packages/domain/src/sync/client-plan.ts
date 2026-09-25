// The client's side of a sync, steps 1 to 3 and the settlement of steps 5 and
// 6 (ADR-0026, Part B), pure. The clients of the console and the web read
// their store and the remote, call these, and write what they return.
//
// Two identities, each in its place (§6.3 (V14)): **exact bytes** for whether
// a line of the queue is already in the remote or already held back; the
// hash of the bytes of the prefix for whether the remote was rewritten.

import type { CivilDate } from "../dates/civil-date.js";
import { SchemaTooNewError } from "../errors.js";
import { closedYearsTouched } from "../filings/touched.js";
import type { AppendEntry, RemoteError } from "../ports/remote-ledger.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { LedgerState } from "../projections/state.js";
import type { LedgerEvent } from "../schema/events.js";
import type { LedgerSchema } from "../schema/migrations/index.js";
import { decodeLines } from "../schema/raw-lines.js";
import { duplicatesOf } from "../usecases/record-event.js";
import { evaluateUnit } from "./evaluate.js";
import { lineSha256, linesOfText, prefixSha256 } from "./lines.js";
import { commonPrefix, type SyncConfirmation, type SyncMarker } from "./marker.js";
import { type ReapplyBase, reapplyUnits } from "./reapply.js";
import { sealsPrefix } from "./seal.js";
import { entriesOf, type QueueUnit, unitsOf } from "./units.js";

/** Why a sync stops. Every one leaves every line where it was: pending stays pending. */
export interface SyncStop {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/**
 * The remote answered something that is not a line-by-line answer: a 5xx, a
 * credential, a request refused before the API, the network (§6.3 (V4)). The
 * sync stops and **holds nothing back**; the code of the remote travels as it
 * came, and each interface says each one apart.
 */
export const remoteFailed = (error: RemoteError): SyncStop => ({
  code: "remote_failed",
  details: { remote_code: error.code, status: error.status },
});

/** Another device kept winning the race: the sync stops after a few `412` (decision D-Q9). */
export const remoteContention = (attempts: number): SyncStop => ({
  code: "remote_contention",
  details: { attempts },
});

/** The local ledger kept changing between step 1 and step 6 (D-Q9). */
export const localChanged = (attempts: number): SyncStop => ({
  code: "local_changed",
  details: { attempts },
});

/** The sync is written; only publishing the state of the queue failed, and the next sync publishes it. */
export const publishFailed = (error: RemoteError): SyncStop => ({
  code: "publish_failed",
  details: { remote_code: error.code, status: error.status },
});

/** Why a unit is held back, with its literal (§13 of the plan). */
export interface HoldReason {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/** The device as its store reads it at step 1. */
export interface LocalSide {
  readonly lines: readonly string[];
  readonly events: readonly LedgerEvent[];
  /** `undefined` when missing or unreadable: the synced prefix is then rebuilt. */
  readonly marker: SyncMarker | undefined;
  /** Exact lines held back and not resolved. */
  readonly held: readonly string[];
  readonly confirmations: readonly SyncConfirmation[];
}

export interface Inspection {
  readonly remoteLines: readonly string[];
  readonly remoteEvents: readonly LedgerEvent[];
  /** Lines of the synced prefix. */
  readonly synced: number;
  /** The queue after step 2, in local order, with its events. */
  readonly queue: readonly string[];
  readonly queueEvents: readonly LedgerEvent[];
  /** Lines of the queue the remote already had, byte for byte (an answer lost). */
  readonly alreadyRemote: readonly string[];
  /** Lines of the queue that were already held back (a cut between writing both). */
  readonly alreadyHeld: readonly string[];
  /** The lines of the remote after the synced prefix that did not come from this queue. */
  readonly foreign: readonly LedgerEvent[];
}

const stop = (reason: SyncStop): { stop: SyncStop } => ({ stop: reason });

/**
 * Step 1 and step 2: the synced prefix (from the marker, or rebuilt), the
 * check that neither side rewrote it, the remote read with this schema, and
 * the queue without what the remote or the held lines already have.
 */
export const inspect = (
  local: LocalSide,
  remoteText: string,
  schema: LedgerSchema,
): Inspection | { stop: SyncStop } => {
  const remoteLines = linesOfText(remoteText);
  const marker = local.marker;
  const synced = marker?.synced_lines ?? commonPrefix(local.lines, remoteLines);
  // An empty remote under a ledger with nothing synced is started by the
  // explicit initialisation, with the whole bytes (V6), never line by line.
  if (synced === 0 && remoteLines.length === 0 && local.lines.length > 0) {
    return stop({ code: "remote_empty", details: {} });
  }
  if (
    marker !== undefined &&
    (local.lines.length < synced || prefixSha256(local.lines, synced) !== marker.synced_sha256)
  ) {
    return stop({ code: "local_prefix_changed", details: { synced_lines: synced } });
  }
  if (
    marker !== undefined &&
    (remoteLines.length < synced || prefixSha256(remoteLines, synced) !== marker.synced_sha256)
  ) {
    return stop({
      code: "remote_rewritten",
      details: { synced_lines: synced, remote_lines: remoteLines.length },
    });
  }
  let remoteEvents: LedgerEvent[];
  try {
    remoteEvents = decodeLines(remoteLines, schema);
  } catch (error) {
    return error instanceof SchemaTooNewError
      ? stop({ code: "remote_schema_too_new", details: { ...error.details } })
      : stop({
          code: "remote_unreadable",
          details: { line: (error as { details: { line?: number } }).details.line },
        });
  }
  const invalid = projectLedger(remoteEvents, { collectErrors: true }).invalid.length;
  if (invalid > 0) {
    return stop({ code: "remote_ledger_invalid", details: { invalid_count: invalid } });
  }
  const tail = new Set(remoteLines.slice(synced));
  const held = new Set(local.held);
  const own = new Set(local.lines.slice(synced));
  const queue: string[] = [];
  const queueEvents: LedgerEvent[] = [];
  const alreadyRemote: string[] = [];
  const alreadyHeld: string[] = [];
  local.lines.slice(synced).forEach((line, index) => {
    if (tail.has(line)) {
      alreadyRemote.push(line);
    } else if (held.has(line)) {
      alreadyHeld.push(line);
    } else {
      queue.push(line);
      queueEvents.push(local.events[synced + index] as LedgerEvent);
    }
  });
  // Without a marker the synced prefix is rebuilt, and that says what is in
  // common, never that the rest may be merged: lines of its own that the
  // remote does not have make it the case of joining, which is always an
  // explicit choice (second review of PR #83), as for a device never synced.
  if (marker === undefined && queue.length > 0) {
    return stop({ code: "join_required", details: { own_lines: queue.length } });
  }
  const foreign = remoteLines
    .map((line, index) => ({ line, event: remoteEvents[index] as LedgerEvent }))
    .slice(synced)
    .filter((entry) => !own.has(entry.line))
    .map((entry) => entry.event);
  return {
    remoteLines,
    remoteEvents,
    synced,
    queue,
    queueEvents,
    alreadyRemote,
    alreadyHeld,
    foreign,
  };
};

/**
 * Case 4, **concurrent photos** (decision D-Q8): a pending `settings_changed`
 * when the remote won any `settings_changed` since the prefix, or the reversal
 * of one; an `account_updated` or `asset_updated` when the remote changed
 * **that** account or **that** asset — created, updated, or the reversal of
 * one of those.
 */
const concurrentPhoto = (
  unit: QueueUnit,
  foreign: readonly LedgerEvent[],
  remoteEvents: readonly LedgerEvent[],
): HoldReason | undefined => {
  const target = (event: LedgerEvent): LedgerEvent | undefined =>
    event.type === "reversal"
      ? remoteEvents.find((entry) => entry.id === event.reverses_id)
      : event;
  const changed = foreign.map(target).filter((event): event is LedgerEvent => event !== undefined);
  for (const event of unit.events) {
    if (
      event.type === "settings_changed" &&
      changed.some((entry) => entry.type === "settings_changed")
    ) {
      return { code: "concurrent_settings", details: { event_id: event.id } };
    }
    if (
      event.type === "account_updated" &&
      changed.some(
        (entry) =>
          (entry.type === "account_created" || entry.type === "account_updated") &&
          entry.account_id === event.account_id,
      )
    ) {
      return {
        code: "concurrent_account",
        details: { event_id: event.id, account_id: event.account_id },
      };
    }
    if (
      event.type === "asset_updated" &&
      changed.some(
        (entry) =>
          (entry.type === "asset_created" || entry.type === "asset_updated") &&
          entry.asset_id === event.asset_id,
      )
    ) {
      return {
        code: "concurrent_asset",
        details: { event_id: event.id, asset_id: event.asset_id },
      };
    }
  }
  return undefined;
};

const byDate = (
  before: readonly LedgerEvent[],
  unit: readonly LedgerEvent[],
  today: CivilDate,
  state: LedgerState,
): string[] =>
  closedYearsTouched(before, [...before, ...unit], today, state)
    .filter((entry) => entry.by_date)
    .map((entry) => entry.filing_id);

export interface UploadPlan {
  /** Nothing is uploaded: something held back is not resolved (third amendment). */
  readonly blocked: boolean;
  readonly entries: readonly AppendEntry[];
  /** The units uploaded, in order; the entries are theirs. */
  readonly units: readonly QueueUnit[];
  /** The first unit that cannot go, with its reason. What follows it stays pending. */
  readonly hold?: { readonly unit: QueueUnit; readonly reason: HoldReason };
}

/**
 * Step 3: re-applies the queue, unit by unit and in local order, **on top of
 * the remote**, with the validation of recording, and stops at the first
 * that fails. Nothing is uploaded while anything held back is unresolved.
 */
export const planUpload = (
  local: LocalSide,
  inspection: Inspection,
  today: CivilDate,
): UploadPlan => {
  if (local.held.length > 0) {
    return { blocked: true, entries: [], units: [] };
  }
  const units = unitsOf(inspection.queue, inspection.queueEvents);
  const position = new Map(local.lines.map((line, index) => [line, index]));
  const confirmation = (line: string): SyncConfirmation | undefined =>
    local.confirmations.find((entry) => entry.line_sha256 === lineSha256(line));
  const entries: AppendEntry[] = [];
  const outcome = reapplyUnits(
    { lines: inspection.remoteLines, events: inspection.remoteEvents },
    units,
    (unit, base: ReapplyBase): HoldReason | undefined => {
      if (unit.detached === true) {
        return { code: "pair_not_contiguous", details: { event_id: unit.events[0]?.id } };
      }
      const from = position.get(unit.lines[0] as string) as number;
      if (unit.events.some(sealsPrefix)) {
        const before = local.lines.slice(0, from);
        if (
          before.length !== base.lines.length ||
          before.some((line, index) => line !== base.lines[index])
        ) {
          return { code: "seals_prefix", details: { event_id: unit.events[0]?.id } };
        }
      }
      const photo = concurrentPhoto(unit, inspection.foreign, inspection.remoteEvents);
      if (photo !== undefined) {
        return photo;
      }
      const checked = evaluateUnit(base.events, unit.events);
      if (!checked.ok) {
        const { member, member_index, domain_code, affected } = checked.failure;
        const extra = affected === undefined ? {} : { affected };
        if (unit.kind !== "line") {
          return {
            code: "pair_rejected",
            details: {
              member,
              member_code: domain_code,
              ...(member_index === undefined ? {} : { member_index }),
              ...extra,
            },
          };
        }
        return domain_code === "newly_invalid_events"
          ? { code: "settings_leave_invalid", details: { ...extra } }
          : { code: "domain_rejected", details: { domain_code, ...extra } };
      }
      // Case 5: a warning that asks for confirmation and was not there when
      // the line was recorded (the list of the plan §8, decision D-Q3).
      const localBefore = local.events.slice(0, from);
      const localState = projectLedger(local.events.slice(0, from + unit.lines.length), {
        collectErrors: true,
      });
      const confirmed: boolean[] = [];
      for (const [index, event] of unit.events.entries()) {
        const given = confirmation(unit.lines[index] as string);
        const remote = duplicatesOf(checked.state.fingerprints, event);
        const known = new Set([
          ...duplicatesOf(localState.fingerprints, event),
          ...(given?.duplicates ?? []),
        ]);
        const fresh = remote.filter((id) => !known.has(id));
        if (fresh.length > 0) {
          return {
            code: "new_duplicate",
            details: { existing: fresh, ...(unit.kind === "line" ? {} : { member_index: index }) },
          };
        }
        confirmed.push(remote.length > 0);
      }
      const closedLocal = new Set([
        ...byDate(localBefore, unit.events, today, localState),
        ...unit.lines.flatMap((line) => confirmation(line)?.closed ?? []),
      ]);
      const closedFresh = byDate(base.events, unit.events, today, checked.state).filter(
        (id) => !closedLocal.has(id),
      );
      if (closedFresh.length > 0) {
        return { code: "new_closed_year", details: { filings: closedFresh } };
      }
      entries.push(...entriesOf(unit, (index) => confirmed[index] === true));
      return undefined;
    },
  );
  return {
    blocked: false,
    entries,
    units: outcome.accepted,
    ...(outcome.failed === undefined
      ? {}
      : { hold: { unit: outcome.failed.unit, reason: outcome.failed.reason } }),
  };
};

/** The unit of an upload an index of the request falls in: the remote rejects at a unit's first line. */
export const unitAtEntry = (units: readonly QueueUnit[], index: number): QueueUnit | undefined => {
  let offset = 0;
  for (const unit of units) {
    if (index < offset + unit.lines.length) {
      return unit;
    }
    offset += unit.lines.length;
  }
  return undefined;
};

/**
 * Steps 5 and 6: after reading the remote again, the queue is what is **not**
 * in it after the synced prefix, byte for byte, and not held back; the local
 * ledger becomes exactly the remote followed by that queue.
 */
export const settle = (
  local: LocalSide,
  synced: number,
  newRemote: readonly string[],
  held: readonly string[],
): { readonly lines: readonly string[]; readonly remaining: readonly string[] } => {
  const inRemote = new Set(newRemote.slice(synced));
  const out = new Set(held);
  const remaining = local.lines
    .slice(synced)
    .filter((line) => !inRemote.has(line) && !out.has(line));
  return { lines: [...newRemote, ...remaining], remaining };
};
