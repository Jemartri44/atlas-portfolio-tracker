// Feature 015, E3: what an HTTP client of the sync accepts as an answer of
// the API (`docs/api.md` §5 and §7). Anything without the shape is
// `transport_rejected` for the client — never a line held back (V4) — and
// only a `rejected.code` of the closed list of §7 holds a line.

import { describe, expect, it } from "vitest";
import { LINE_REJECTION_CODES, REMOTE_FAILURE_CODES } from "../../src/ports/remote-ledger.js";
import {
  etagOfHeader,
  parseAppendAnswer,
  parseErrorAnswer,
  parseInitAnswer,
  parsePublishAnswer,
} from "../../src/sync/answers.js";

const SHA = "c".repeat(64);

describe("the codes of a line (§7)", () => {
  it("are the twelve of the table, closed", () => {
    expect([...LINE_REJECTION_CODES]).toEqual([
      "line_unreadable",
      "schema_version_unsupported",
      "line_invalid",
      "recorded_at_in_future",
      "domain_rejected",
      "duplicate_unconfirmed",
      "pair_declaration_invalid",
      "pair_incomplete",
      "pair_not_contiguous",
      "pair_rejected",
      "seal_mismatch",
      "waiver_not_appendable",
    ]);
  });
});

describe("parseAppendAnswer (§5.2)", () => {
  it("reads an answer with and without a rejected line", () => {
    expect(parseAppendAnswer({ etag: SHA, lines: 3, accepted: 2 })).toEqual({
      etag: SHA,
      lines: 3,
      accepted: 2,
    });
    const rejected = { index: 2, id: "X", code: "pair_rejected", details: { member: "reversal" } };
    expect(parseAppendAnswer({ etag: SHA, lines: 3, accepted: 2, rejected })).toEqual({
      etag: SHA,
      lines: 3,
      accepted: 2,
      rejected,
    });
    expect(
      parseAppendAnswer({
        etag: SHA,
        lines: 1,
        accepted: 0,
        rejected: { index: 0, code: "line_unreadable", details: {} },
      }),
    ).toMatchObject({ rejected: { index: 0, code: "line_unreadable" } });
  });

  it("refuses anything else, and a code of a line that is not of the list", () => {
    for (const value of [
      null,
      "x",
      { etag: SHA, lines: 1 },
      { etag: "E".repeat(64), lines: 1, accepted: 1 },
      { etag: SHA, lines: -1, accepted: 0 },
      { etag: SHA, lines: 1, accepted: 1.5 },
      { etag: SHA, lines: 1, accepted: 1, extra: true },
      {
        etag: SHA,
        lines: 1,
        accepted: 0,
        rejected: { index: 0, code: "held_by_server", details: {} },
      },
      {
        etag: SHA,
        lines: 1,
        accepted: 0,
        rejected: { index: -1, code: "line_invalid", details: {} },
      },
      { etag: SHA, lines: 1, accepted: 0, rejected: { index: 0, code: "line_invalid" } },
      {
        etag: SHA,
        lines: 1,
        accepted: 0,
        rejected: { index: 0, id: 3, code: "line_invalid", details: {} },
      },
      {
        etag: SHA,
        lines: 1,
        accepted: 0,
        rejected: { index: 0, code: "line_invalid", details: {}, more: 1 },
      },
      { etag: SHA, lines: 1, accepted: 0, rejected: "line_invalid" },
    ]) {
      expect(parseAppendAnswer(value), JSON.stringify(value)).toBeUndefined();
    }
  });
});

describe("parseInitAnswer and parsePublishAnswer (§5.5 and §5.3)", () => {
  it("read the two answers and nothing else", () => {
    expect(parseInitAnswer({ etag: SHA, lines: 4 })).toEqual({ etag: SHA, lines: 4 });
    for (const value of [
      { etag: SHA },
      { etag: SHA, lines: 4, more: 1 },
      { etag: "x", lines: 4 },
      [],
    ]) {
      expect(parseInitAnswer(value)).toBeUndefined();
    }
    const published = { device_id: "D".repeat(22), published_at: "2026-10-01T10:00:00.000Z" };
    expect(parsePublishAnswer(published)).toEqual(published);
    for (const value of [
      { device_id: "D".repeat(22) },
      { ...published, more: 1 },
      { ...published, published_at: 5 },
      null,
    ]) {
      expect(parsePublishAnswer(value)).toBeUndefined();
    }
  });
});

describe("parseErrorAnswer (§7)", () => {
  it("reads an error of the closed list, with its details", () => {
    expect(
      parseErrorAnswer({ error: { code: "device_forgotten", details: { reason: "missing" } } }),
    ).toEqual({
      code: "device_forgotten",
      details: { reason: "missing" },
    });
  });

  it("refuses a code of no list, the two the client names itself, and any other shape", () => {
    expect(REMOTE_FAILURE_CODES).toContain("transport_rejected");
    for (const value of [
      { error: { code: "made_up", details: {} } },
      { error: { code: "transport_rejected", details: {} } },
      { error: { code: "network_failed", details: {} } },
      { error: { code: "internal" } },
      { error: { code: "internal", details: [] } },
      { error: { code: "internal", details: {}, more: 1 } },
      { error: "internal" },
      { message: "Forbidden" },
      "<html>",
    ]) {
      expect(parseErrorAnswer(value), JSON.stringify(value)).toBeUndefined();
    }
  });
});

describe("etagOfHeader (§5.1; block 0 of E3, §23.3)", () => {
  it("reads a strong or weak quoted SHA-256, and nothing else", () => {
    expect(etagOfHeader(`"${SHA}"`)).toBe(SHA);
    expect(etagOfHeader(`W/"${SHA}"`)).toBe(SHA);
    for (const value of [null, SHA, `"${SHA.toUpperCase()}"`, '"abc"', `"${SHA}", "${SHA}"`]) {
      expect(etagOfHeader(value), String(value)).toBeUndefined();
    }
  });
});
