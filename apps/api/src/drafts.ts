// The routes of the drafts in the cloud (feature 027, E6 of ADR-0035;
// `docs/api.md` §6.1). They decide nothing about the operation: its shape is
// the domain's (`ecb/cloud-drafts.ts`), and what a rate is worth is the
// client's preview. They reach S3 only through `DraftObjects`: read, create
// once, list. **Nothing is overwritten and nothing is deleted.**

import type { DraftObjects } from "@atlas/adapters/aws";
import { isUlid, utf8Encode } from "@atlas/domain";
import { refusal } from "@atlas/domain/access";
import {
  composeDraft,
  type DraftEnd,
  draftKey,
  draftObjectText,
  endObjectText,
  listDraftNames,
  MAX_DRAFT_BYTES,
  parseCreateDraftBody,
  parseEndBody,
  parseStampBody,
  readEndObject,
  readStampObject,
  stampObjectText,
} from "@atlas/domain/ecb";
import { fail, type Outcome } from "./outcome.js";
import { json } from "./respond.js";

export interface DraftsContext {
  readonly objects: DraftObjects;
  readonly now: () => Date;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** The text of an object, or nothing if it is not there or not UTF-8. */
const textOf = async (objects: DraftObjects, key: string): Promise<string | undefined> => {
  const stored = await objects.get(key);
  if (stored === undefined) {
    return undefined;
  }
  try {
    return utf8.decode(stored.body);
  } catch {
    return "�";
  }
};

const sameEnd = (left: DraftEnd, right: DraftEnd): boolean =>
  left.outcome === right.outcome &&
  (left.outcome === "discarded" ||
    (right.outcome === "confirmed" && left.eventId === right.eventId));

const missing = (): Outcome => fail(refusal("not_found", { reason: "draft_missing" }));
const gone = (): Outcome => fail(refusal("draft_changed", { now: "gone" }));
const stamped = (): Outcome => fail(refusal("draft_changed", { now: "stamped" }));

export const draftRoutes = (context: DraftsContext) => {
  const { objects } = context;

  /** `GET /api/drafts` (§6.1): the pending ones, with their stamp, and the names that are not a draft. */
  const list = async (): Promise<Outcome> => {
    const listed = await objects.list();
    const { pending, unreadable } = listDraftNames(
      listed.map(({ key }) => key.slice("drafts/".length)),
    );
    const drafts = [];
    const lost = [...unreadable];
    for (const { id, stamped: hasStamp } of pending) {
      const saved = await textOf(objects, draftKey(id, "draft"));
      const stamp = hasStamp ? await textOf(objects, draftKey(id, "stamp")) : undefined;
      const pendingEventId = stamp === undefined ? undefined : readStampObject(id, stamp);
      const draft =
        saved === undefined || (hasStamp && pendingEventId === undefined)
          ? undefined
          : composeDraft(id, saved, pendingEventId);
      if (draft === undefined) {
        lost.push(`${id}.json`);
      } else {
        drafts.push(draft);
      }
    }
    return {
      result: json(200, { drafts, unreadable: lost.sort() }),
      code: "drafts_listed",
    };
  };

  /** `POST /api/drafts` (§6.1): the draft as saved, once. */
  const create = async (body: unknown): Promise<Outcome> => {
    const read = parseCreateDraftBody(body);
    if ("reason" in read) {
      return fail(refusal("body_invalid", { reason: read.reason }));
    }
    const bytes = utf8Encode(draftObjectText(read.value));
    if (bytes.length > MAX_DRAFT_BYTES) {
      return fail(refusal("body_too_large", { limit: MAX_DRAFT_BYTES }));
    }
    if ((await objects.create(draftKey(read.value.id, "draft"), bytes)) === "exists") {
      return fail(refusal("draft_exists"));
    }
    return { result: json(201, { id: read.value.id }), code: "draft_saved" };
  };

  /** `POST /api/drafts/{id}/stamp` (§6.1): the id its event will have, created once. */
  const stamp = async (id: string, body: unknown): Promise<Outcome> => {
    if (!isUlid(id)) {
      return fail(refusal("body_invalid", { reason: "draft_id" }));
    }
    const read = parseStampBody(body);
    if ("reason" in read) {
      return fail(refusal("body_invalid", { reason: read.reason }));
    }
    if ((await objects.get(draftKey(id, "draft"))) === undefined) {
      return missing();
    }
    if ((await objects.get(draftKey(id, "end"))) !== undefined) {
      return gone();
    }
    const created = await objects.create(
      draftKey(id, "stamp"),
      utf8Encode(stampObjectText(id, read.value, context.now())),
    );
    if (created === "created") {
      // Closed between the check and the stamp: the client never writes the event.
      if ((await objects.get(draftKey(id, "end"))) !== undefined) {
        return gone();
      }
      return {
        result: json(200, { id, pending_event_id: read.value, created: true }),
        code: "draft_stamped",
      };
    }
    const existing = await textOf(objects, draftKey(id, "stamp"));
    const held = existing === undefined ? undefined : readStampObject(id, existing);
    if (held !== read.value) {
      return stamped();
    }
    return {
      result: json(200, { id, pending_event_id: read.value, created: false }),
      code: "draft_stamped",
    };
  };

  /** `POST /api/drafts/{id}/end` (§6.1): confirmed or discarded, created once; the first one wins. */
  const end = async (id: string, body: unknown): Promise<Outcome> => {
    if (!isUlid(id)) {
      return fail(refusal("body_invalid", { reason: "draft_id" }));
    }
    const read = parseEndBody(body);
    if ("reason" in read) {
      return fail(refusal("body_invalid", { reason: read.reason }));
    }
    const ended = read.value;
    if ((await objects.get(draftKey(id, "draft"))) === undefined) {
      return missing();
    }
    /** What the end that is there says about the one asked for. */
    const against = async (): Promise<Outcome | undefined> => {
      const existing = await textOf(objects, draftKey(id, "end"));
      if (existing === undefined) {
        return undefined;
      }
      const held = readEndObject(id, existing);
      return held !== undefined && sameEnd(held, ended)
        ? {
            result: json(200, { id, outcome: ended.outcome, created: false }),
            code: "draft_ended",
          }
        : gone();
    };
    const already = await against();
    if (already !== undefined) {
      return already;
    }
    if (ended.outcome === "confirmed") {
      const text = await textOf(objects, draftKey(id, "stamp"));
      if (text === undefined) {
        return fail(refusal("body_invalid", { reason: "not_stamped" }));
      }
      if (readStampObject(id, text) !== ended.eventId) {
        return stamped();
      }
    }
    const created = await objects.create(
      draftKey(id, "end"),
      utf8Encode(endObjectText(id, ended, context.now())),
    );
    if (created === "exists") {
      // Another client closed it between the check and the write.
      return (await against()) ?? gone();
    }
    return {
      result: json(200, { id, outcome: ended.outcome, created: true }),
      code: "draft_ended",
    };
  };

  return { list, create, stamp, end };
};
