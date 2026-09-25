// Resolving what was held back (ADR-0026, Part B; plan §10): **confirm** (a
// new duplicate, a year now filed), **redo** on the current state (a
// concurrent photo, a line that seals, what a rewrite left behind) or
// **discard**, which is explicit and leaves the line in `discarded`.
//
// Pure: each resolution returns what to write, and the store writes it under
// one hold of the lock or in one transaction. None of them needs a valid local
// ledger (decision D-Q1): the user can always get out of where the sync left
// them.

import { ValidationError } from "../errors.js";
import type { Draft, LedgerEvent, ReversalEvent, SupportedEvent } from "../schema/events.js";
import {
  DISCARDED_FORMAT,
  type DiscardedRecord,
  HELD_FORMAT,
  type HeldRecord,
  type HeldUnit,
  holdRecords,
} from "./held.js";
import { lineSha256 } from "./lines.js";
import type { SyncConfirmation } from "./marker.js";

export type Resolution = "confirm" | "redo" | "discard";

/** The warnings a user may confirm (decision D-Q3), and the refusal of the remote that is one of them. */
const CONFIRMABLE = new Set(["new_duplicate", "new_closed_year", "duplicate_unconfirmed"]);

/**
 * What can be done with a held unit. Discarding always; confirming only a
 * warning; redoing, anything **except a filing the remote already has**
 * (§6.3 (V16)): it would be another `tax_return_filed` replacing the one in
 * force, a filing that did not happen.
 */
export const resolutionsFor = (
  unit: HeldUnit,
  events: readonly LedgerEvent[],
  remoteIds: ReadonlySet<string>,
): Resolution[] => {
  const filingInRemote = events.some(
    (event) => event.type === "tax_return_filed" && remoteIds.has(event.id),
  );
  return [
    ...(CONFIRMABLE.has(unit.reason.code) ? (["confirm"] as const) : []),
    ...(filingInRemote ? [] : (["redo"] as const)),
    "discard" as const,
  ];
};

const refuse = (resolution: Resolution, unit: HeldUnit): ValidationError =>
  new ValidationError("resolution_not_offered", `${resolution} is not offered for this held unit`, {
    resolution,
    reason: unit.reason.code,
  });

const resolved = (
  line: string,
  resolution: "confirmed" | "redone" | "discarded",
  at: string,
  eventId?: string,
): HeldRecord => ({
  held_format: HELD_FORMAT,
  kind: "resolved",
  at,
  line_sha256: lineSha256(line),
  resolution,
  ...(eventId === undefined ? {} : { event_id: eventId }),
});

const discarded = (
  line: string,
  reason: DiscardedRecord["reason"],
  at: string,
  replacedBy?: string,
): DiscardedRecord => ({
  discarded_format: DISCARDED_FORMAT,
  at,
  reason,
  ...(replacedBy === undefined ? {} : { replaced_by: replacedBy }),
  line,
});

/**
 * **Confirm**: the unit goes back into the queue in its local order —right
 * after the synced prefix, before what is still pending— and the marker
 * remembers what was confirmed, by the hash of each line (plan §10.1): the
 * next sync uploads it with `confirm_duplicate` and holds it again only if a
 * **different** warning shows up.
 */
export const confirmHeld = (
  unit: HeldUnit,
  events: readonly LedgerEvent[],
  remoteIds: ReadonlySet<string>,
  local: { readonly lines: readonly string[]; readonly synced: number },
  at: string,
): {
  lines: string[];
  records: HeldRecord[];
  confirmations: SyncConfirmation[];
} => {
  if (!resolutionsFor(unit, events, remoteIds).includes("confirm")) {
    throw refuse("confirm", unit);
  }
  const details = unit.reason.details as { existing?: string[]; filings?: string[] };
  return {
    lines: [
      ...local.lines.slice(0, local.synced),
      ...unit.lines,
      ...local.lines.slice(local.synced),
    ],
    records: unit.lines.map((line) => resolved(line, "confirmed", at)),
    confirmations: unit.lines.map((line) => ({
      line_sha256: lineSha256(line),
      duplicates: details.existing ?? [],
      closed: details.filings ?? [],
      confirmed_at: at,
    })),
  };
};

/**
 * **Discard**, explicit: the whole unit, or only the reversal of a pair —
 * whose correction is then **held again** on its own (`partner_discarded`),
 * never uploaded alone.
 */
export const discardHeld = (
  unit: HeldUnit,
  at: string,
  only: "unit" | "reversal" = "unit",
): { records: HeldRecord[]; discarded: DiscardedRecord[] } => {
  if (only === "reversal") {
    if (unit.lines.length !== 2) {
      throw refuse("discard", unit);
    }
    const [reversal, correction] = unit.lines as [string, string];
    return {
      records: [
        resolved(reversal, "discarded", at),
        ...holdRecords(
          [correction],
          unit.origin,
          {
            code: "partner_discarded",
            details: { discarded: lineSha256(reversal) },
          },
          at,
        ),
      ],
      discarded: [discarded(reversal, { code: "discarded_by_user" }, at)],
    };
  }
  return {
    records: unit.lines.map((line) => resolved(line, "discarded", at)),
    discarded: unit.lines.map((line) => discarded(line, { code: "discarded_by_user" }, at)),
  };
};

const withoutEnvelope = (event: LedgerEvent): Record<string, unknown> => {
  const {
    schema_version: _version,
    id: _id,
    recorded_at: _recorded,
    fingerprint: _fingerprint,
    corrects_id: _corrects,
    ...rest
  } = event as LedgerEvent & { fingerprint?: string; corrects_id?: string };
  return rest;
};

/** What redoing a unit records, on the current state: a new event, a correction or a reversal. */
export type RedoPlan =
  | { readonly kind: "record"; readonly draft: Draft<SupportedEvent> }
  | { readonly kind: "correct"; readonly target_id: string; readonly draft: Draft<SupportedEvent> }
  | { readonly kind: "reverse"; readonly target_id: string; readonly reason: string };

/**
 * **Redo**: the draft the interface preloads (feature 015). A pair is redone
 * as a correction of the same target; a lone reversal, as that reversal; a
 * line, as a new event. A chain is not redone as one: its pairs are redone one
 * by one, so only the first pair is planned here. Refused for a filing the
 * remote already has (V16).
 */
export const redoPlan = (
  unit: HeldUnit,
  events: readonly LedgerEvent[],
  remoteIds: ReadonlySet<string>,
): RedoPlan => {
  if (!resolutionsFor(unit, events, remoteIds).includes("redo")) {
    throw new ValidationError("redo_filing_in_remote", "the remote already has this filing", {
      reason: unit.reason.code,
    });
  }
  const first = events[0] as LedgerEvent;
  if (first.type !== "reversal") {
    return { kind: "record", draft: withoutEnvelope(first) as unknown as Draft<SupportedEvent> };
  }
  const reversal = first as ReversalEvent;
  const correction = events[1];
  return correction === undefined
    ? { kind: "reverse", target_id: reversal.reverses_id, reason: reversal.reason }
    : {
        kind: "correct",
        target_id: reversal.reverses_id,
        draft: withoutEnvelope(correction) as unknown as Draft<SupportedEvent>,
      };
};

/**
 * Before recording the redo of a **line**, the id it will be recorded with is
 * sealed in the held records (plan §10.2, as the drafts of the ECB after
 * §11.1 and §12.1 of feature 012): after a cut, only an event with
 * **exactly** that id is "the redo, already recorded". A pair or a reversal
 * needs no seal: redoing it reverses its target, and a second attempt after a
 * cut fails on its own with `already_reversed`.
 */
export const redoStarted = (unit: HeldUnit, eventId: string, at: string): HeldRecord[] =>
  unit.lines.map((line) => ({
    held_format: HELD_FORMAT,
    kind: "redo_started" as const,
    at,
    line_sha256: lineSha256(line),
    event_id: eventId,
  }));

/** Once the redo is in the ledger: the held lines go to `discarded` with the id that replaced them. */
export const redoFinished = (
  unit: HeldUnit,
  eventId: string,
  at: string,
): { records: HeldRecord[]; discarded: DiscardedRecord[] } => ({
  records: unit.lines.map((line) => resolved(line, "redone", at, eventId)),
  discarded: unit.lines.map((line) => discarded(line, { code: "redone" }, at, eventId)),
});

/** Whether the redo that started with `unit.redo` is already in the ledger, by that exact id. */
export const redoRecorded = (unit: HeldUnit, ledger: readonly LedgerEvent[]): boolean =>
  unit.redo !== undefined && ledger.some((event) => event.id === unit.redo);

/** The unit held back with that id (the hash of its first line), or `held_unit_unknown`. */
export const heldUnitById = (units: readonly HeldUnit[], id: string): HeldUnit => {
  const unit = units.find((entry) => entry.unit === id);
  if (unit === undefined) {
    throw new ValidationError("held_unit_unknown", "nothing is held back with that id", {
      unit: id,
    });
  }
  return unit;
};

/**
 * A redo of a line is finished only by an event with **exactly** the id it
 * sealed (plan §10.2): otherwise `redo_not_recorded`, and nothing moves.
 */
export const assertRedoRecorded = (unit: HeldUnit, ledger: readonly LedgerEvent[]): void => {
  if (unit.redo !== undefined && !redoRecorded(unit, ledger)) {
    throw new ValidationError("redo_not_recorded", "the redo is not in the ledger yet", {
      event_id: unit.redo,
    });
  }
};
