// The drafts in the cloud (ADR-0035, E6; `docs/api.md` §6.1 and
// `docs/data-schema.md` §1): a draft is up to **three immutable objects**,
// each created once with `If-None-Match: *` and never overwritten or deleted
// (the role of the API has no delete):
//
// - `drafts/<id>.json`       the draft as saved, with no stamp;
// - `drafts/<id>.stamp.json` the id its event will have (`pending_event_id`);
// - `drafts/<id>.end.json`   how it ended, `confirmed` or `discarded`.
//
// **Pending** is having the first and not the last. This file is the pure
// part, shared by the API (which writes and reads the objects) and by the
// clients (which read what the API answers): names, strict readers and the
// fold of the objects into the logical draft of ADR-0029,
// `{ draft_format, id, saved_at, event, pending_event_id? }`.

import { isRecord } from "../guards.js";
import { isUlid, type Ulid } from "../ids/ulid.js";
import type { DraftEnd } from "../ports/draft-store.js";
import { DRAFT_FORMAT, type PendingDraft, parsePendingDraft } from "./drafts.js";

export const DRAFTS_PREFIX = "drafts/";

/** A draft once serialized: far above a real one (a few hundred bytes). */
export const MAX_DRAFT_BYTES = 65_536;

export type DraftObjectKind = "draft" | "stamp" | "end";

const SUFFIX: Readonly<Record<DraftObjectKind, string>> = {
  draft: ".json",
  stamp: ".stamp.json",
  end: ".end.json",
};

export const draftKey = (id: Ulid, kind: DraftObjectKind): string =>
  `${DRAFTS_PREFIX}${id}${SUFFIX[kind]}`;

const NAME = /^([0-7][0-9A-HJKMNP-TV-Z]{25})(\.stamp|\.end)?\.json$/;

/** The id and kind a name under `drafts/` stands for, or nothing if it is not one of ours. */
export const parseDraftName = (name: string): { id: Ulid; kind: DraftObjectKind } | undefined => {
  const match = NAME.exec(name);
  if (match === null) {
    return undefined;
  }
  const kind = match[2] === ".stamp" ? "stamp" : match[2] === ".end" ? "end" : "draft";
  return { id: match[1] as Ulid, kind };
};

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

const isInstant = (value: unknown): value is string =>
  typeof value === "string" && INSTANT.test(value) && !Number.isNaN(Date.parse(value));

const hasOnly = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

/** What a body can fail on: a reason for `body_invalid`, never a sentence. */
export type Parsed<T> = { readonly value: T } | { readonly reason: string };

/** `POST /api/drafts`: `{ draft: { draft_format, id, saved_at, event } }`, exactly, with no stamp. */
export const parseCreateDraftBody = (body: unknown): Parsed<PendingDraft> => {
  if (!isRecord(body) || !hasOnly(body, ["draft"]) || !isRecord(body.draft)) {
    return { reason: "draft" };
  }
  const draft = body.draft;
  if (!hasOnly(draft, ["draft_format", "id", "saved_at", "event"])) {
    return { reason: "unknown_field" };
  }
  if (draft.draft_format !== DRAFT_FORMAT) {
    return { reason: "draft_format" };
  }
  if (!isUlid(draft.id)) {
    return { reason: "draft_id" };
  }
  if (!isInstant(draft.saved_at)) {
    return { reason: "saved_at" };
  }
  if (!isRecord(draft.event) || typeof draft.event.type !== "string") {
    return { reason: "event" };
  }
  return {
    value: {
      draft_format: DRAFT_FORMAT,
      id: draft.id,
      saved_at: draft.saved_at,
      event: draft.event,
    },
  };
};

/** `POST /api/drafts/{id}/stamp`: `{ pending_event_id }`. */
export const parseStampBody = (body: unknown): Parsed<Ulid> => {
  if (!isRecord(body) || !hasOnly(body, ["pending_event_id"]) || !isUlid(body.pending_event_id)) {
    return { reason: "pending_event_id" };
  }
  return { value: body.pending_event_id };
};

/** `POST /api/drafts/{id}/end`: `{ outcome: "confirmed", event_id }` or `{ outcome: "discarded" }`. */
export const parseEndBody = (body: unknown): Parsed<DraftEnd> => {
  if (!isRecord(body) || !hasOnly(body, ["outcome", "event_id"])) {
    return { reason: "outcome" };
  }
  if (body.outcome === "discarded") {
    return body.event_id === undefined
      ? { value: { outcome: "discarded" } }
      : { reason: "event_id" };
  }
  if (body.outcome !== "confirmed") {
    return { reason: "outcome" };
  }
  return isUlid(body.event_id)
    ? { value: { outcome: "confirmed", eventId: body.event_id } }
    : { reason: "event_id" };
};

/** The text of the object of a new draft; refused over `MAX_DRAFT_BYTES`. */
export const draftObjectText = (draft: PendingDraft): string =>
  `${JSON.stringify(
    {
      draft_format: DRAFT_FORMAT,
      id: draft.id,
      saved_at: draft.saved_at,
      event: draft.event,
    },
    null,
    2,
  )}\n`;

export const stampObjectText = (id: Ulid, pendingEventId: Ulid, stampedAt: Date): string =>
  `${JSON.stringify(
    {
      draft_format: DRAFT_FORMAT,
      id,
      pending_event_id: pendingEventId,
      stamped_at: stampedAt.toISOString(),
    },
    null,
    2,
  )}\n`;

export const endObjectText = (id: Ulid, end: DraftEnd, endedAt: Date): string =>
  `${JSON.stringify(
    {
      draft_format: DRAFT_FORMAT,
      id,
      outcome: end.outcome,
      ended_at: endedAt.toISOString(),
      ...(end.outcome === "confirmed" ? { event_id: end.eventId } : {}),
    },
    null,
    2,
  )}\n`;

const parseJson = (text: string): Readonly<Record<string, unknown>> | undefined => {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/** The id a stamp object holds, if it is a stamp of draft `id`. */
export const readStampObject = (id: Ulid, text: string): Ulid | undefined => {
  const value = parseJson(text);
  return value !== undefined &&
    hasOnly(value, ["draft_format", "id", "pending_event_id", "stamped_at"]) &&
    value.draft_format === DRAFT_FORMAT &&
    value.id === id &&
    isInstant(value.stamped_at) &&
    isUlid(value.pending_event_id)
    ? value.pending_event_id
    : undefined;
};

/** How an end object says draft `id` ended, if it is one. */
export const readEndObject = (id: Ulid, text: string): DraftEnd | undefined => {
  const value = parseJson(text);
  if (
    value === undefined ||
    !hasOnly(value, ["draft_format", "id", "outcome", "ended_at", "event_id"]) ||
    value.draft_format !== DRAFT_FORMAT ||
    value.id !== id ||
    !isInstant(value.ended_at)
  ) {
    return undefined;
  }
  if (value.outcome === "discarded") {
    return value.event_id === undefined ? { outcome: "discarded" } : undefined;
  }
  return value.outcome === "confirmed" && isUlid(value.event_id)
    ? { outcome: "confirmed", eventId: value.event_id }
    : undefined;
};

/**
 * The logical draft out of its saved object and, if there is one, its stamp.
 * Nothing if the saved object is not a draft of `id` or holds a stamp of its
 * own (the stamp lives in its object).
 */
export const composeDraft = (
  id: Ulid,
  draftText: string,
  stamp: Ulid | undefined,
): PendingDraft | undefined => {
  let draft: PendingDraft;
  try {
    draft = parsePendingDraft(draftText);
  } catch {
    return undefined;
  }
  if (draft.id !== id || draft.pending_event_id !== undefined) {
    return undefined;
  }
  return stamp === undefined ? draft : { ...draft, pending_event_id: stamp };
};

export interface DraftListing {
  /** Pending drafts, oldest first, and whether each has a stamp object. */
  readonly pending: readonly { readonly id: Ulid; readonly stamped: boolean }[];
  /** Names under `drafts/` that are not part of a draft: a stranger, an orphan stamp or end. */
  readonly unreadable: readonly string[];
}

/**
 * What the names under `drafts/` (first level) say: which drafts are pending,
 * and which names belong to nothing. An end or a stamp **without** its saved
 * object is named as unreadable, never skipped: it may mean the draft was lost.
 */
export const listDraftNames = (names: readonly string[]): DraftListing => {
  const drafts = new Map<Ulid, { stamped: boolean; ended: boolean }>();
  const parsed: { name: string; id: Ulid; kind: DraftObjectKind }[] = [];
  const unreadable: string[] = [];
  for (const name of names) {
    const read = parseDraftName(name);
    if (read === undefined) {
      unreadable.push(name);
    } else {
      parsed.push({ name, ...read });
      if (read.kind === "draft") {
        drafts.set(read.id, { stamped: false, ended: false });
      }
    }
  }
  for (const { name, id, kind } of parsed) {
    const state = drafts.get(id);
    if (state === undefined) {
      unreadable.push(name);
    } else if (kind === "stamp") {
      state.stamped = true;
    } else if (kind === "end") {
      state.ended = true;
    }
  }
  return {
    // A ULID sorts by time: the order of the ids is the order they were saved in.
    pending: [...drafts.keys()]
      .sort()
      .filter((id) => !(drafts.get(id) as { ended: boolean }).ended)
      .map((id) => ({ id, stamped: (drafts.get(id) as { stamped: boolean }).stamped })),
    unreadable: unreadable.sort(),
  };
};
