// The draft of an operation recorded before the ECB publishes its rate
// (ADR-0029, point 9, option B; block 5 of prompt 012).
//
// An operation in a foreign currency whose reference date has no rate **yet**
// cannot be recorded without inventing one. It is kept, complete and **without
// the rate**, as a draft **outside the ledger**: `drafts/` next to it on the
// desktop, IndexedDB in the browser.
//
// - **A draft is not a fact.** Nothing projects it: no position, no cash, no
//   weight, no tax figure reads the drafts, because none of them reads
//   anything but the ledger. It is always shown as pending.
// - **It is never confirmed on its own**, not even once the rate is published:
//   `pendingDraftStatus` only says that it *can* be confirmed, with the
//   official rate already in place, and writing is always the user's act
//   (`recordPendingDraft`, called by an interface after a yes).
// - **Its own validation** (decision (x)): the ledger's is not loosened —
//   `validateShape` still demands `fx_rate` —, and nothing persisted carries a
//   stand-in rate. The draft is checked by running the ledger's own preview on
//   a **copy that lives only in memory**, where each rate still to be published
//   holds a stand-in; the copy is thrown away and the draft is saved as it
//   came. What the check proves is everything **but** the rate: the shape, the
//   position it sells, the order it fills, the duplicates.
// - **Recording and then removing**, in that order: a cut between the two
//   leaves the operation in both places, never in none, and confirming the
//   draft again is refused by the duplicate fingerprint, which does not
//   include the rate (ADR-0012). The same reasoning ADR-0026 applies to
//   `held.jsonl`.

import { type CivilDate, isCivilDate } from "../dates/civil-date.js";
import { DomainError, ValidationError } from "../errors.js";
import { createUlidGenerator, isUlid, type Ulid } from "../ids/ulid.js";
import type { PendingDraftStore } from "../ports/draft-store.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { LedgerState } from "../projections/state.js";
import type { Draft, LedgerEvent } from "../schema/events.js";
import type { UseCaseDeps } from "../usecases/deps.js";
import { previewEvent } from "../usecases/preview-event.js";
import { type RecordOptions, type RecordResult, recordEvent } from "../usecases/record-event.js";
import type { EcbHistory } from "./history.js";
import { ratePointsOf } from "./ledger-rates.js";
import { type OfficialRate, officialRatesOf, proposeRates, setPath } from "./propose.js";

type Fields = Readonly<Record<string, unknown>>;

/** The version of the file of a draft: its own, not the ledger's `schema_version`. */
export const DRAFT_FORMAT = 1;

export interface PendingDraft {
  readonly draft_format: typeof DRAFT_FORMAT;
  readonly id: Ulid;
  /** ISO 8601 UTC. */
  readonly saved_at: string;
  /** The operation as it would be recorded, **without** the rates still to be published. */
  readonly event: Fields;
  /** The id its confirmation writes it with, stamped before writing (`recordPendingDraft`). */
  readonly pending_event_id?: Ulid;
}

/**
 * The draft is no longer as it was read: removed, or stamped with another id —
 * almost surely confirmed somewhere else meanwhile (third review of PR #75).
 * The confirmation stops: it never writes the draft again, and never records
 * the operation as a new one.
 */
export class DraftChangedError extends DomainError {
  constructor(id: string, now: "gone" | "stamped") {
    super(
      "draft_changed",
      now === "gone"
        ? `draft ${id} is no longer there: it was confirmed or discarded elsewhere`
        : `draft ${id} was stamped with another id: it is being confirmed elsewhere`,
      { id, now },
    );
  }
}

const unreadable = (message: string): ValidationError =>
  new ValidationError("draft_unreadable", message);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads the file of a draft; anything this code does not understand is refused, never guessed. */
export const parsePendingDraft = (text: string): PendingDraft => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw unreadable("the draft is not JSON");
  }
  if (!isRecord(parsed) || parsed.draft_format !== DRAFT_FORMAT) {
    throw unreadable("the draft is not of a known format");
  }
  const { id, saved_at, event, pending_event_id } = parsed;
  if (
    !isUlid(id) ||
    typeof saved_at !== "string" ||
    !isRecord(event) ||
    typeof event.type !== "string"
  ) {
    throw unreadable("the draft lacks its id, its date or its operation");
  }
  if (pending_event_id !== undefined && !isUlid(pending_event_id)) {
    throw unreadable("the id stamped for its confirmation is not an id");
  }
  return {
    draft_format: DRAFT_FORMAT,
    id,
    saved_at,
    event,
    ...(pending_event_id === undefined ? {} : { pending_event_id }),
  };
};

export const serializePendingDraft = (draft: PendingDraft): string =>
  `${JSON.stringify(draft, null, 2)}\n`;

/** The rates of an operation the ECB has not published yet and nobody typed. */
const waitingRatesOf = (
  history: EcbHistory | undefined,
  state: LedgerState,
  event: Fields,
  staleDays: number,
): OfficialRate[] =>
  officialRatesOf(history, state, event, staleDays).filter(
    ({ point, resolution }) =>
      resolution.kind === "not_yet_published" &&
      point.rate === undefined &&
      point.rate_date === undefined,
  );

export interface PreparedDraft {
  draft: PendingDraft;
  /** Recorded events with the same fingerprint: said before saving, as a record says them. */
  duplicates: string[];
}

/**
 * Checks an operation to be saved as a draft and gives the draft to save.
 *
 * Refused with `draft_not_needed` when no rate of it is waiting for the ECB:
 * then it is recorded as always, and a draft would only be a second copy.
 */
export const preparePendingDraft = async (
  deps: UseCaseDeps,
  history: EcbHistory | undefined,
  staleDays: number,
  event: Fields,
): Promise<PreparedDraft> => {
  const { events } = await deps.store.load();
  const state = projectLedger(events, { collectErrors: true });
  const waiting = waitingRatesOf(history, state, event, staleDays);
  if (waiting.length === 0) {
    throw new ValidationError(
      "draft_not_needed",
      "no rate of this operation is waiting for the ECB: record it as always",
    );
  }
  // The copy for the ledger's own check, which is never saved: each rate
  // still to be published holds a stand-in dated on its reference date. A
  // deep copy through JSON, lossless here because every amount is a string,
  // so not even an effect of the draft is touched.
  const copy: Record<string, unknown> = JSON.parse(JSON.stringify(event));
  for (const { point } of waiting) {
    setPath(copy, point.path, "1");
    setPath(copy, point.datePath, point.reference);
  }
  const preview = await previewEvent(deps, copy as unknown as Draft);
  return {
    draft: {
      draft_format: DRAFT_FORMAT,
      id: createUlidGenerator(deps).next(),
      saved_at: deps.clock.now().toISOString(),
      event,
    },
    duplicates: preview.duplicates,
  };
};

export type DraftStatus =
  /** Without a history nothing can be said: the draft waits, and the interface says why. */
  | { kind: "no_history" }
  /** The ECB has not published the rate of its reference date yet. */
  | {
      kind: "waiting";
      rates: { currency: string; reference: CivilDate; latest: CivilDate }[];
    }
  /**
   * The history has every rate: the operation **with the official rate already
   * in place**, ready to be recorded as always — when the user says so.
   */
  | { kind: "confirmable"; event: Record<string, unknown>; proposed: OfficialRate[] }
  /**
   * The ECB will not publish it (a currency it does not list, or stopped
   * listing): the rate has to be typed, which is recording it by hand.
   */
  | { kind: "needs_rate"; currencies: string[] };

/** What a draft is waiting for, today. Pure: it reads, it never records. */
export const pendingDraftStatus = (
  history: EcbHistory | undefined,
  state: LedgerState,
  draft: PendingDraft,
  staleDays: number,
): DraftStatus => {
  if (history === undefined) {
    return { kind: "no_history" };
  }
  const waiting = waitingRatesOf(history, state, draft.event, staleDays);
  if (waiting.length > 0) {
    return {
      kind: "waiting",
      rates: waiting.map(({ point, resolution }) => ({
        currency: point.currency,
        reference: point.reference,
        // `waitingRatesOf` keeps only this kind.
        latest: (resolution as { latest: CivilDate }).latest,
      })),
    };
  }
  const { draft: event, proposed } = proposeRates(history, state, draft.event, staleDays);
  const missing = ratePointsOf(state, event).filter(
    (point) => point.rate === undefined || !isCivilDate(point.rate_date),
  );
  if (missing.length > 0) {
    return { kind: "needs_rate", currencies: [...new Set(missing.map((point) => point.currency))] };
  }
  return { kind: "confirmable", event, proposed };
};

/**
 * The event of the ledger that **is** this draft: the one with exactly the id
 * its confirmation stamped on it before writing (`pending_event_id`). That is
 * a confirmation whose removal of the draft did not happen — a cut, or a
 * failure of the store of drafts —, and confirming again only removes the
 * draft. Nothing else is: an identical operation has another id, and it goes
 * through the duplicate question of ADR-0012 like any other (review of PR #75,
 * which found that guessing by the fingerprint deleted the only copy of an
 * operation).
 */
export const draftRecordedAs = (events: readonly LedgerEvent[], draft: PendingDraft): string[] =>
  draft.pending_event_id === undefined
    ? []
    : events.filter((event) => event.id === draft.pending_event_id).map((event) => event.id);

export interface DraftRecord extends RecordResult {
  /** False when the line was written and the draft could not be removed: said, never swallowed. */
  draftRemoved: boolean;
}

/**
 * Records a confirmable draft — the event `pendingDraftStatus` gave, after the
 * user's yes — with every validation of a record, in three steps:
 *
 * 1. **the draft keeps the id the event will have** (`pending_event_id`),
 *    stamped before anything is written — the same one on every retry;
 * 2. the event is recorded **with that id**, with the duplicate question of
 *    ADR-0012 if its fingerprint repeats;
 * 3. the draft is removed.
 *
 * A refusal leaves the draft where it was. A cut after 2 leaves it in both
 * places, and `draftRecordedAs` then knows, without guessing, that it is this
 * one.
 */
export const recordPendingDraft = async (
  deps: UseCaseDeps,
  drafts: PendingDraftStore,
  draft: PendingDraft,
  event: Fields,
  options: RecordOptions = {},
): Promise<DraftRecord> => {
  // Reused when the draft carries one — a cut, or another console — and
  // stamped **conditionally**: only over the draft as it was read. The ledger
  // refuses a second event with the same id (`duplicate_id`).
  const id = draft.pending_event_id ?? createUlidGenerator(deps).next();
  await drafts.update({ ...draft, pending_event_id: id }, draft.pending_event_id);
  const result = await recordEvent(deps, event as unknown as Draft, { ...options, id });
  try {
    await drafts.remove(draft.id);
  } catch {
    return { ...result, draftRemoved: false };
  }
  return { ...result, draftRemoved: true };
};
