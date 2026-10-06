// The drafts in the cloud (ADR-0035, E6; `docs/api.md` §6.1): names, bodies
// read to the letter, and the fold of the names under `drafts/`.

import { describe, expect, it } from "vitest";
import {
  composeDraft,
  draftKey,
  draftObjectText,
  endObjectText,
  listDraftNames,
  parseCreateDraftBody,
  parseDraftName,
  parseEndBody,
  parseStampBody,
  readEndObject,
  readStampObject,
  stampObjectText,
} from "../../src/ecb/cloud-drafts.js";

const A = "01J0000000000000000000000A";
const B = "01J0000000000000000000000B";
const C = "01J0000000000000000000000C";
const AT = "2026-10-06T10:00:00.000Z";
const event = { type: "buy", asset_id: "ast_gold" };
const draft = { draft_format: 1, id: A, saved_at: AT, event } as const;

describe("the names of the objects", () => {
  it("builds the three keys and reads them back", () => {
    expect(draftKey(A, "draft")).toBe(`drafts/${A}.json`);
    expect(draftKey(A, "stamp")).toBe(`drafts/${A}.stamp.json`);
    expect(draftKey(A, "end")).toBe(`drafts/${A}.end.json`);
    expect(parseDraftName(`${A}.json`)).toEqual({ id: A, kind: "draft" });
    expect(parseDraftName(`${A}.stamp.json`)).toEqual({ id: A, kind: "stamp" });
    expect(parseDraftName(`${A}.end.json`)).toEqual({ id: A, kind: "end" });
  });

  it("reads no other name", () => {
    for (const name of [
      "",
      "x.json",
      `${A}.tmp`,
      `${A}.done.json`,
      `${A}.stamp.end.json`,
      `${A.toLowerCase()}.json`,
      `8${A.slice(1)}.json`,
      `${A}.json.bak`,
      `sub/${A}.json`,
    ]) {
      expect(parseDraftName(name), name).toBeUndefined();
    }
  });
});

describe("the body of a new draft", () => {
  it("accepts exactly a draft with no stamp", () => {
    expect(parseCreateDraftBody({ draft })).toEqual({ value: draft });
    expect(parseCreateDraftBody({ draft: { ...draft, saved_at: "2026-10-06T10:00:00Z" } })).toEqual(
      { value: { ...draft, saved_at: "2026-10-06T10:00:00Z" } },
    );
  });

  it.each([
    ["not an object", "x", "draft"],
    ["an array", [], "draft"],
    ["no draft", {}, "draft"],
    ["a draft that is not an object", { draft: 1 }, "draft"],
    ["another key beside the draft", { draft, device_id: "x" }, "draft"],
    ["a stamp at creation", { draft: { ...draft, pending_event_id: B } }, "unknown_field"],
    ["a field of its own", { draft: { ...draft, extra: 1 } }, "unknown_field"],
    ["another format", { draft: { ...draft, draft_format: 2 } }, "draft_format"],
    ["an id that is not a ULID", { draft: { ...draft, id: "abc" } }, "draft_id"],
    ["an instant with no Z", { draft: { ...draft, saved_at: "2026-10-06T10:00:00" } }, "saved_at"],
    [
      "an impossible instant",
      { draft: { ...draft, saved_at: "2026-13-45T10:00:00Z" } },
      "saved_at",
    ],
    ["a date as a number", { draft: { ...draft, saved_at: 5 } }, "saved_at"],
    ["no operation", { draft: { ...draft, event: 1 } }, "event"],
    ["an operation with no type", { draft: { ...draft, event: {} } }, "event"],
  ])("refuses %s", (_name, body, reason) => {
    expect(parseCreateDraftBody(body)).toEqual({ reason });
  });
});

describe("the body of a stamp and of an end", () => {
  it("reads a stamp", () => {
    expect(parseStampBody({ pending_event_id: B })).toEqual({ value: B });
    for (const body of [null, {}, { pending_event_id: "x" }, { pending_event_id: B, x: 1 }]) {
      expect(parseStampBody(body)).toEqual({ reason: "pending_event_id" });
    }
  });

  it("reads a confirmation with the event, and a discard with none", () => {
    expect(parseEndBody({ outcome: "confirmed", event_id: B })).toEqual({
      value: { outcome: "confirmed", eventId: B },
    });
    expect(parseEndBody({ outcome: "discarded" })).toEqual({ value: { outcome: "discarded" } });
  });

  it("refuses what is not exactly that", () => {
    expect(parseEndBody({ outcome: "confirmed" })).toEqual({ reason: "event_id" });
    expect(parseEndBody({ outcome: "confirmed", event_id: "x" })).toEqual({ reason: "event_id" });
    expect(parseEndBody({ outcome: "discarded", event_id: B })).toEqual({ reason: "event_id" });
    expect(parseEndBody({ outcome: "gone" })).toEqual({ reason: "outcome" });
    expect(parseEndBody({ outcome: "discarded", more: 1 })).toEqual({ reason: "outcome" });
    expect(parseEndBody(null)).toEqual({ reason: "outcome" });
    expect(parseEndBody([])).toEqual({ reason: "outcome" });
  });
});

describe("the objects as written and read", () => {
  it("writes the draft with no stamp even if given one, in the format of ADR-0029", () => {
    const text = draftObjectText({ ...draft, pending_event_id: B });
    expect(JSON.parse(text)).toEqual(draft);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("round-trips a stamp and refuses another draft's or a malformed one", () => {
    const at = new Date(AT);
    expect(JSON.parse(stampObjectText(A, B, at))).toEqual({
      draft_format: 1,
      id: A,
      pending_event_id: B,
      stamped_at: AT,
    });
    expect(readStampObject(A, stampObjectText(A, B, at))).toBe(B);
    expect(readStampObject(C, stampObjectText(A, B, at))).toBeUndefined();
    expect(readStampObject(A, "{")).toBeUndefined();
    expect(readStampObject(A, "[]")).toBeUndefined();
    for (const change of [
      { draft_format: 2 },
      { pending_event_id: "x" },
      { stamped_at: "yesterday" },
      { extra: 1 },
    ]) {
      const bad = JSON.stringify({ ...JSON.parse(stampObjectText(A, B, at)), ...change });
      expect(readStampObject(A, bad), JSON.stringify(change)).toBeUndefined();
    }
  });

  it("round-trips an end, and refuses the incoherent", () => {
    const at = new Date(AT);
    const confirmed = endObjectText(A, { outcome: "confirmed", eventId: B }, at);
    expect(JSON.parse(confirmed)).toEqual({
      draft_format: 1,
      id: A,
      outcome: "confirmed",
      ended_at: AT,
      event_id: B,
    });
    expect(readEndObject(A, confirmed)).toEqual({ outcome: "confirmed", eventId: B });
    const discarded = endObjectText(A, { outcome: "discarded" }, at);
    expect(JSON.parse(discarded)).not.toHaveProperty("event_id");
    expect(readEndObject(A, discarded)).toEqual({ outcome: "discarded" });
    expect(readEndObject(C, discarded)).toBeUndefined();
    expect(readEndObject(A, "{")).toBeUndefined();
    const base = JSON.parse(discarded);
    for (const bad of [
      { ...base, event_id: B },
      { ...base, outcome: "confirmed" },
      { ...base, outcome: "confirmed", event_id: "x" },
      { ...base, outcome: "lost" },
      { ...base, ended_at: "no" },
      { ...base, draft_format: 3 },
      { ...base, extra: 1 },
    ]) {
      expect(readEndObject(A, JSON.stringify(bad)), JSON.stringify(bad)).toBeUndefined();
    }
  });
});

describe("the draft out of its objects", () => {
  const text = draftObjectText(draft);

  it("is the saved draft, with the stamp as `pending_event_id` when there is one", () => {
    expect(composeDraft(A, text, undefined)).toEqual(draft);
    expect(composeDraft(A, text, B)).toEqual({ ...draft, pending_event_id: B });
  });

  it("is nothing when the object is not that draft", () => {
    expect(composeDraft(A, "{", undefined)).toBeUndefined();
    expect(composeDraft(C, text, undefined)).toBeUndefined();
    // A stamp inside the saved object is not where a stamp lives.
    expect(
      composeDraft(A, JSON.stringify({ ...draft, pending_event_id: B }), undefined),
    ).toBeUndefined();
  });
});

describe("the names under drafts/", () => {
  it("lists the pending ones, oldest first, and says which carry a stamp", () => {
    expect(
      listDraftNames([`${C}.json`, `${A}.json`, `${A}.stamp.json`, `${B}.json`, `${B}.end.json`]),
    ).toEqual({
      pending: [
        { id: A, stamped: true },
        { id: C, stamped: false },
      ],
      unreadable: [],
    });
  });

  it("names, and never skips, what belongs to no draft", () => {
    expect(
      listDraftNames([`${A}.json`, `${B}.stamp.json`, `${C}.end.json`, "stranger.txt"]),
    ).toEqual({
      pending: [{ id: A, stamped: false }],
      unreadable: [`${B}.stamp.json`, `${C}.end.json`, "stranger.txt"].sort(),
    });
  });

  it("is empty when there is nothing", () => {
    expect(listDraftNames([])).toEqual({ pending: [], unreadable: [] });
  });
});
