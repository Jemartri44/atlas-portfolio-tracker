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
 * Why redoing a unit is not offered, if it is not: a filing the remote
 * already has (§6.3 (V16)) — it would be another `tax_return_filed` replacing
 * the one in force, a filing that did not happen —, or a correction whose
 * reversal the user discarded (second review of PR #83): a correction without
 * its reversal corrects nothing, and recording it alone is refused
 * (`dangling_correction`), so only discarding it is offered.
 */
const redoRefusal = (
  unit: HeldUnit,
  events: readonly LedgerEvent[],
  remoteIds: ReadonlySet<string>,
): ValidationError | undefined =>
  events.some((event) => event.type === "tax_return_filed" && remoteIds.has(event.id))
    ? new ValidationError("redo_filing_in_remote", "the remote already has this filing", {
        reason: unit.reason.code,
      })
    : unit.reason.code === "partner_discarded"
      ? new ValidationError(
          "redo_partner_discarded",
          "a correction without its reversal corrects nothing",
          { reason: unit.reason.code },
        )
      : undefined;

/** What can be done with a held unit. Discarding always; confirming only a warning; redoing, unless refused. */
export const resolutionsFor = (
  unit: HeldUnit,
  events: readonly LedgerEvent[],
  remoteIds: ReadonlySet<string>,
): Resolution[] => [
  ...(CONFIRMABLE.has(unit.reason.code) ? (["confirm"] as const) : []),
  ...(redoRefusal(unit, events, remoteIds) === undefined ? (["redo"] as const) : []),
  "discard" as const,
];

const refuse = (resolution: Resolution, unit: HeldUnit): ValidationError =>
  new ValidationError("resolution_not_offered", `${resolution} is not offered for this held unit`, {
    resolution,
    reason: unit.reason.code,
  });

const resolved = (
  line: string,
  resolution: "confirmed" | "redone" | "discarded",
  at: string,
  redo?: { event_id: string | undefined; replaces: string },
): HeldRecord => ({
  held_format: HELD_FORMAT,
  kind: "resolved",
  at,
  line_sha256: lineSha256(line),
  resolution,
  ...(redo?.event_id === undefined ? {} : { event_id: redo.event_id, replaces: redo.replaces }),
});

/**
 * The id of a decision: this resolution of this hold of this line. Repeating
 * it after a cut gives the same id; a new hold of the same bytes, another.
 */
export const decisionOf = (
  unit: HeldUnit,
  line: string,
  resolution: DiscardedRecord["reason"]["code"],
): string => lineSha256(JSON.stringify([resolution, unit.unit, unit.held_at, lineSha256(line)]));

const discarded = (
  unit: HeldUnit,
  line: string,
  reason: DiscardedRecord["reason"],
  at: string,
  replacedBy?: string,
): DiscardedRecord => ({
  discarded_format: DISCARDED_FORMAT,
  at,
  decision: decisionOf(unit, line, reason.code),
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
      discarded: [discarded(unit, reversal, { code: "discarded_by_user" }, at)],
    };
  }
  return {
    records: unit.lines.map((line) => resolved(line, "discarded", at)),
    discarded: unit.lines.map((line) => discarded(unit, line, { code: "discarded_by_user" }, at)),
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

/**
 * What redoing a unit records, on the current state, **with the ids sealed
 * for it**: a new event, a correction (its reversal and the corrected event)
 * or a reversal. Only events with exactly these ids finish the redo.
 */
export type RedoPlan =
  | { readonly kind: "record"; readonly draft: Draft<SupportedEvent>; readonly id: string }
  | {
      readonly kind: "correct";
      readonly target_id: string;
      readonly draft: Draft<SupportedEvent>;
      readonly reversal_id: string;
      readonly id: string;
    }
  | {
      /**
       * A lone reversal: recorded by `recordEvent` with its draft and its
       * sealed id — `reverseEvent` takes no id, and giving it one costs the
       * boot of the web (second review of PR #83) —, which refuses what the
       * reversal itself would leave invalid and, like every event that is not
       * a `settings_changed`, any event that was invalid before and still is
       * after it (`checkInvalid`). The reversal of an invalid event repairs it,
       * so it passes.
       */
      readonly kind: "reverse";
      readonly target_id: string;
      readonly reason: string;
      readonly draft: Draft<ReversalEvent>;
      readonly id: string;
    };

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

/**
 * The version of `targetId` in force in the ledger: while it is reversed and
 * corrected, its correction. On the current state, the other device's
 * correction of the same event is what a held one has to correct (case 3).
 */
const inForce = (targetId: string, ledger: readonly LedgerEvent[]): string => {
  let current = targetId;
  for (;;) {
    const reversed = ledger.some(
      (event) => event.type === "reversal" && event.reverses_id === current,
    );
    const correction = reversed ? ledger.find((event) => event.corrects_id === current) : undefined;
    if (correction === undefined) {
      return current;
    }
    current = correction.id;
  }
};

/**
 * What a pair of a chain reverses, **translated within the unit** (third
 * review of PR #83): a later pair that corrects the held correction of an
 * earlier one — which never reached the ledger — points at the id that
 * earlier pair was redone with. If that pair is still held, the later one
 * **waits** (`redo_waits_for_pair`, «primero la pareja N»): nothing that is
 * bound to fail is offered.
 */
const targetOf = (
  unit: HeldUnit,
  parts: readonly { events: LedgerEvent[] }[],
  reversesId: string,
  ledger: readonly LedgerEvent[],
): string => {
  const waiting = parts.findIndex((part) => part.events.some((event) => event.id === reversesId));
  if (waiting >= 0) {
    throw new ValidationError("redo_waits_for_pair", "an earlier pair of the chain comes first", {
      pair: waiting + 1,
    });
  }
  return inForce(unit.redone?.[reversesId] ?? reversesId, ledger);
};

const planOf = (
  events: readonly LedgerEvent[],
  ids: readonly string[],
  target: (reversesId: string) => string,
): RedoPlan => {
  const first = events[0] as LedgerEvent;
  if (first.type !== "reversal") {
    return {
      kind: "record",
      draft: withoutEnvelope(first, true) as unknown as Draft<SupportedEvent>,
      id: ids[0] as string,
    };
  }
  const reversal = first as ReversalEvent;
  const correction = events[1];
  const targetId = target(reversal.reverses_id);
  return correction === undefined
    ? {
        kind: "reverse",
        target_id: targetId,
        reason: reversal.reason,
        draft: { type: "reversal", reverses_id: targetId, reason: reversal.reason },
        id: ids[0] as string,
      }
    : {
        kind: "correct",
        target_id: targetId,
        draft: withoutEnvelope(correction, false) as unknown as Draft<SupportedEvent>,
        reversal_id: ids[0] as string,
        id: ids[1] as string,
      };
};

/**
 * The ids of a correction, in the order `correctEvent` writes them — the
 * reversal, then the corrected event — for its option `ids`. Only the sealed
 * ids: a third would be an empty id, which no event is written with.
 */
export const sealedIds = (plan: Extract<RedoPlan, { kind: "correct" }>): { next(): string } => {
  const queue = [plan.reversal_id, plan.id];
  return { next: () => queue.shift() ?? "" };
};

/** The ids sealed for the lines of a part, or `undefined` if any is missing. */
const sealedOf = (unit: HeldUnit, lines: readonly string[]): string[] | undefined => {
  const ids = lines.map((line) => unit.sealed?.[lineSha256(line)]);
  return ids.every((id) => id !== undefined) ? (ids as string[]) : undefined;
};

/**
 * **Redo**, started: the draft the interface preloads (feature 015) and the
 * ids its events will carry, **sealed before anything is recorded** (plan
 * §10.2, as the drafts of the ECB after §11.1 and §12.1 of feature 012; the
 * second review of PR #83): the new event of a line; the reversal and the
 * corrected event of a pair; the reversal of a lone reversal. A chain, pair
 * by pair: this plans the first pair still held. Started again, the same ids:
 * nothing new is sealed until the part is finished. Refused when redoing is
 * not offered.
 */
export const startRedoPlan = (
  unit: HeldUnit,
  events: readonly LedgerEvent[],
  remoteIds: ReadonlySet<string>,
  ledger: readonly LedgerEvent[],
  newId: () => string,
  at: string,
): { plan: RedoPlan; records: HeldRecord[] } => {
  const refusal = redoRefusal(unit, events, remoteIds);
  if (refusal !== undefined) {
    throw refusal;
  }
  const [part, ...later] = partsOf(unit, events) as [
    { lines: string[]; events: LedgerEvent[] },
    ...{ lines: string[]; events: LedgerEvent[] }[],
  ];
  const plan = (ids: readonly string[]) =>
    planOf(part.events, ids, (reversesId) => targetOf(unit, [part, ...later], reversesId, ledger));
  const sealed = sealedOf(unit, part.lines);
  // Planned before sealing: a pair that has to wait seals nothing.
  plan(part.lines.map(() => ""));
  const ids = sealed ?? part.lines.map(() => newId());
  return {
    plan: plan(ids),
    records:
      sealed === undefined
        ? part.lines.map((line, index) => ({
            held_format: HELD_FORMAT,
            kind: "redo_started" as const,
            at,
            line_sha256: lineSha256(line),
            event_id: ids[index] as string,
          }))
        : [],
  };
};

/**
 * The lines of a unit whose redo **is in the ledger**, part by part, by
 * **exactly the ids sealed** for them — never deduced from the target (R1 of
 * the second review of PR #83: the other device's correction of the same
 * event is not this redo). What was not redone stays held back:
 * `discarded.jsonl` only keeps what the user decided.
 */
export const redoneLines = (
  unit: HeldUnit,
  events: readonly LedgerEvent[],
  ledger: readonly LedgerEvent[],
): string[] => {
  const recorded = new Set(ledger.map((event) => event.id));
  return partsOf(unit, events).flatMap((part) => {
    const sealed = sealedOf(unit, part.lines);
    return sealed?.every((id) => recorded.has(id)) ? part.lines : [];
  });
};

/** Once a redo is in the ledger: **only its lines** go to `discarded`, each with the id that replaced it. */
export const redoFinished = (
  unit: HeldUnit,
  events: readonly LedgerEvent[],
  lines: readonly string[],
  at: string,
): { records: HeldRecord[]; discarded: DiscardedRecord[] } => {
  const idOf = (line: string): string | undefined => unit.sealed?.[lineSha256(line)];
  const heldIdOf = (line: string): string => (events[unit.lines.indexOf(line)] as LedgerEvent).id;
  return {
    records: lines.map((line) =>
      resolved(line, "redone", at, { event_id: idOf(line), replaces: heldIdOf(line) }),
    ),
    discarded: lines.map((line) => discarded(unit, line, { code: "redone" }, at, idOf(line))),
  };
};

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
 * A redo is finished only when the ledger shows it, by the ids sealed (plan
 * §10.2; B2 and R1 of the reviews of PR #83). Otherwise `redo_not_recorded`,
 * and nothing moves. Returns the lines to finish.
 */
export const assertRedoRecorded = (
  unit: HeldUnit,
  events: readonly LedgerEvent[],
  ledger: readonly LedgerEvent[],
): string[] => {
  const lines = redoneLines(unit, events, ledger);
  if (lines.length === 0) {
    throw new ValidationError("redo_not_recorded", "the redo is not in the ledger yet", {
      ...(unit.sealed === undefined ? {} : { sealed: Object.values(unit.sealed) }),
    });
  }
  return lines;
};
