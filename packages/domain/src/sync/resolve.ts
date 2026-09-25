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
  // A confirmation cut after the ledger got the line and before the line was
  // marked resolved leaves it in both (B1 of the review of PR #83): repeating
  // it does not put it in the ledger twice.
  const present = new Set(local.lines);
  const missing = unit.lines.filter((line) => !present.has(line));
  return {
    lines: [...local.lines.slice(0, local.synced), ...missing, ...local.lines.slice(local.synced)],
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

const withoutEnvelope = (event: LedgerEvent, keepCorrects: boolean): Record<string, unknown> => {
  const {
    schema_version: _version,
    id: _id,
    recorded_at: _recorded,
    fingerprint: _fingerprint,
    corrects_id: corrects,
    ...rest
  } = event as LedgerEvent & { fingerprint?: string; corrects_id?: string };
  // A correction held on its own (a partner discarded, a line a rewrite left
  // behind) is redone **as a correction**: it keeps what it corrects (review
  // of PR #83, non-blocking 5). A pair is redone by `correctEvent`, which
  // writes the link itself.
  return keepCorrects && corrects !== undefined ? { ...rest, corrects_id: corrects } : rest;
};

/** What redoing a unit records, on the current state: a new event, a correction or a reversal. */
export type RedoPlan =
  | { readonly kind: "record"; readonly draft: Draft<SupportedEvent> }
  | { readonly kind: "correct"; readonly target_id: string; readonly draft: Draft<SupportedEvent> }
  | { readonly kind: "reverse"; readonly target_id: string; readonly reason: string };

/**
 * The parts a unit is redone by: a line or a pair whole, a chain **pair by
 * pair** — each pair of a chain is a correction of its own target, and each is
 * redone, and finished, on its own (B2 of the review of PR #83).
 */
const partsOf = (
  unit: HeldUnit,
  events: readonly LedgerEvent[],
): { lines: string[]; events: LedgerEvent[] }[] => {
  const chained =
    unit.lines.length > 2 &&
    events.every((event, index) => (index % 2 === 0) === (event.type === "reversal"));
  if (!chained) {
    return [{ lines: [...unit.lines], events: [...events] }];
  }
  const parts: { lines: string[]; events: LedgerEvent[] }[] = [];
  for (let index = 0; index < unit.lines.length; index += 2) {
    parts.push({
      lines: unit.lines.slice(index, index + 2),
      events: events.slice(index, index + 2),
    });
  }
  return parts;
};

const planOf = (events: readonly LedgerEvent[]): RedoPlan => {
  const first = events[0] as LedgerEvent;
  if (first.type !== "reversal") {
    return {
      kind: "record",
      draft: withoutEnvelope(first, true) as unknown as Draft<SupportedEvent>,
    };
  }
  const reversal = first as ReversalEvent;
  const correction = events[1];
  return correction === undefined
    ? { kind: "reverse", target_id: reversal.reverses_id, reason: reversal.reason }
    : {
        kind: "correct",
        target_id: reversal.reverses_id,
        draft: withoutEnvelope(correction, false) as unknown as Draft<SupportedEvent>,
      };
};

/**
 * **Redo**: the draft the interface preloads (feature 015). A pair is redone
 * as a correction of the same target; a lone reversal, as that reversal; a
 * line, as a new event (a correction, if it was one). A chain, pair by pair:
 * this plans the first pair still held. Refused for a filing the remote
 * already has (V16).
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
  return planOf((partsOf(unit, events)[0] as { events: LedgerEvent[] }).events);
};

/**
 * Before recording the redo of a **line**, the id it will be recorded with is
 * sealed in the held records (plan §10.2, as the drafts of the ECB after
 * §11.1 and §12.1 of feature 012): after a cut, only an event with
 * **exactly** that id is "the redo, already recorded". A pair or a reversal
 * needs no seal: redoing it reverses its target, which the ledger then shows.
 */
export const redoStarted = (unit: HeldUnit, eventId: string, at: string): HeldRecord[] =>
  unit.lines.map((line) => ({
    held_format: HELD_FORMAT,
    kind: "redo_started" as const,
    at,
    line_sha256: lineSha256(line),
    event_id: eventId,
  }));

/**
 * The lines of a unit whose redo **is in the ledger** (B2 of the review of PR
 * #83), part by part: a line, by the exact id it sealed; a pair, by a
 * correction of its target that is not the held one; a lone reversal, by a
 * reversal of its target that is not the held one. What was not redone stays
 * held back: `discarded.jsonl` only keeps what the user decided.
 */
export const redoneLines = (
  unit: HeldUnit,
  events: readonly LedgerEvent[],
  ledger: readonly LedgerEvent[],
): string[] => {
  const own = new Set(events.map((event) => event.id));
  const others = ledger.filter((event) => !own.has(event.id));
  return partsOf(unit, events).flatMap((part) => {
    const plan = planOf(part.events);
    const done =
      plan.kind === "record"
        ? unit.redo !== undefined && ledger.some((event) => event.id === unit.redo)
        : plan.kind === "correct"
          ? others.some((event) => event.corrects_id === plan.target_id)
          : others.some(
              (event) => event.type === "reversal" && event.reverses_id === plan.target_id,
            );
    return done ? part.lines : [];
  });
};

/** Once a redo is in the ledger: **only its lines** go to `discarded`, with what replaced them. */
export const redoFinished = (
  lines: readonly string[],
  eventId: string | undefined,
  at: string,
): { records: HeldRecord[]; discarded: DiscardedRecord[] } => ({
  records: lines.map((line) => resolved(line, "redone", at, eventId)),
  discarded: lines.map((line) => discarded(line, { code: "redone" }, at, eventId)),
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
 * A redo is finished only when the ledger shows it (plan §10.2; B2 of the
 * review of PR #83): a line by exactly the id it sealed, a pair or a chain by
 * the corrections of their targets. Otherwise `redo_not_recorded`, and
 * nothing moves. Returns the lines to finish.
 */
export const assertRedoRecorded = (
  unit: HeldUnit,
  events: readonly LedgerEvent[],
  ledger: readonly LedgerEvent[],
): string[] => {
  const lines = redoneLines(unit, events, ledger);
  if (lines.length === 0) {
    throw new ValidationError("redo_not_recorded", "the redo is not in the ledger yet", {
      ...(unit.redo === undefined ? {} : { event_id: unit.redo }),
    });
  }
  return lines;
};
