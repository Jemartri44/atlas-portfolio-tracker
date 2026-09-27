// Feature 016, E1 (R19, mutant 18): the warnings of the other jobs, once per
// streak, and never twice after a cut.

import { describe, expect, it } from "vitest";
import {
  conditionsOf,
  type Notice,
  noticeIn,
  noticeKey,
  noticeStep,
  ownFindings,
  parseNotice,
  producerOf,
  serializeNotice,
} from "../../src/jobs/notices.js";
import { claimRecord, recordIn } from "../../src/jobs/run-record.js";

const AT = "2026-10-02T06:00:00Z";
const FAILED = { code: "task_failed", subject: "ecb_update" };
const inState = (state: Notice["state"]) => noticeIn(FAILED, state, AT, "2026-10-02");

describe("a streak", () => {
  it("has a key only when its code and subject cannot leave jobs/mail/notices/", () => {
    expect(noticeKey("task_failed", "ecb_update")).toBe(
      "jobs/mail/notices/task_failed--ecb_update.json",
    );
    for (const [code, subject] of [
      ["task_failed", "../ledger"],
      ["task_failed", "a/b"],
      ["task_failed", ""],
      ["Task", "x"],
      ["task_failed", "x".repeat(65)],
    ]) {
      expect(noticeKey(code as string, subject as string), `${code} ${subject}`).toBeUndefined();
    }
  });

  it("reads back what it writes, and nothing it did not", () => {
    const notice = inState("sent");
    const text = serializeNotice(notice);
    expect(parseNotice(text, "task_failed", "ecb_update")).toEqual({ ok: true, notice });
    for (const bad of [
      "x",
      text.replace('"state":"sent"', '"state":"lost"'),
      text.replace('"streak_since":"2026-10-02"', '"streak_since":"today"'),
      text.replace('"at":"2026-10-02T06:00:00Z"', '"at":"now"'),
      text.replace('"notice_format":1', '"notice_format":2'),
      text.replace('"notice_format":1', '"notice_format":1,"notice_format":1'),
      text.replace("}", ',"extra":1}'),
    ]) {
      expect(parseNotice(bad, "task_failed", "ecb_update"), bad).toEqual({
        ok: false,
        code: "notice_unreadable",
      });
    }
    expect(parseNotice(text, "task_failed", "prices_update").ok).toBe(false);
    expect(parseNotice(text, "source_failing", "ecb_update").ok).toBe(false);
  });
});

describe("once per streak (R19)", () => {
  it("opens and sends a condition that appears, again after it closed", () => {
    expect(noticeStep(undefined, true)).toEqual({ kind: "open_and_send" });
    expect(noticeStep(inState("closed"), true)).toEqual({ kind: "open_and_send" });
  });

  it("sends a streak not sent yet, or refused", () => {
    expect(noticeStep(inState("open"), true)).toEqual({ kind: "send" });
    expect(noticeStep(inState("send_failed"), true)).toEqual({ kind: "send" });
  });

  it("never sends the same streak twice, not even after a cut between sending and noting", () => {
    expect(noticeStep(inState("sent"), true)).toEqual({ kind: "nothing" });
    expect(noticeStep(inState("send_unknown"), true)).toEqual({ kind: "nothing" });
    expect(noticeStep(inState("sending"), true)).toEqual({ kind: "close_unknown" });
  });

  it("closes a streak whose condition is gone, and opens nothing it cannot see", () => {
    for (const state of ["open", "sending", "sent", "send_failed", "send_unknown"] as const) {
      expect(noticeStep(inState(state), false), state).toEqual({ kind: "close" });
    }
    expect(noticeStep(inState("closed"), false)).toEqual({ kind: "nothing" });
    expect(noticeStep(undefined, false)).toEqual({ kind: "nothing" });
    expect(noticeStep(undefined, undefined)).toEqual({ kind: "nothing" });
    expect(noticeStep(inState("sent"), undefined)).toEqual({ kind: "nothing" });
  });
});

describe("what a record of a producer says", () => {
  const claimed = claimRecord("ecb_update", "2026-10-01", AT);

  it("says nothing while it is not closed, or when there is none", () => {
    expect(conditionsOf(undefined)).toBeUndefined();
    expect(conditionsOf(claimed)).toBeUndefined();
    expect(conditionsOf(recordIn(claimed, "sending", AT))).toBeUndefined();
  });

  it("never takes a code it fabricates from the findings of a record (privacy B1)", () => {
    const forged = [
      { code: "task_failed", subject: "IE00B4L5Y983" },
      { code: "record_unreadable", subject: "ast_xau" },
    ];
    expect(conditionsOf(recordIn(claimed, "done", AT, { findings: forged }))).toEqual([]);
    expect(conditionsOf(recordIn(claimed, "failed", AT, { findings: forged }))).toEqual([
      { code: "task_failed", subject: "ecb_update" },
    ]);
  });

  it("says its findings, and that the job failed when it did", () => {
    const finding = { code: "ecb_update_rejected", subject: "ecb", counts: { conflicts: 3 } };
    expect(conditionsOf(recordIn(claimed, "done", AT))).toEqual([]);
    expect(conditionsOf(recordIn(claimed, "done", AT, { findings: [finding] }))).toEqual([finding]);
    expect(conditionsOf(recordIn(claimed, "failed", AT, { findings: [finding] }))).toEqual([
      { code: "task_failed", subject: "ecb_update" },
      finding,
    ]);
  });

  it("finds the producer of a streak by its code and subject, both in closed lists", () => {
    const codes = {
      ecb_update: { ecb_update_rejected: ["ecb"] },
      prices_update: { source_failing: ["eodhd", "alpha_vantage"] },
    };
    expect(producerOf({ code: "task_failed", subject: "monthly_backup" }, codes)).toBe(
      "monthly_backup",
    );
    expect(producerOf({ code: "record_unreadable", subject: "ecb_update" }, codes)).toBe(
      "ecb_update",
    );
    expect(producerOf({ code: "task_failed", subject: "monthly_reminder" }, codes)).toBeUndefined();
    expect(producerOf({ code: "task_failed", subject: "toString" }, codes)).toBeUndefined();
    expect(producerOf({ code: "source_failing", subject: "eodhd" }, codes)).toBe("prices_update");
    expect(producerOf({ code: "source_failing", subject: "IE00B4L5Y983" }, codes)).toBeUndefined();
    expect(producerOf({ code: "constructor", subject: "ecb" }, codes)).toBeUndefined();
    expect(producerOf({ code: "mystery", subject: "x" }, codes)).toBeUndefined();
  });

  it("keeps of a producer's findings only its own codes and subjects", () => {
    const codes = { prices_update: { source_failing: ["eodhd"] } };
    const findings = [
      { code: "source_failing", subject: "eodhd", counts: { consecutive_failures: 3 } },
      { code: "source_failing", subject: "ast_xau" },
      { code: "ecb_update_rejected", subject: "ecb" },
      { code: "task_failed", subject: "prices_update" },
    ];
    expect(ownFindings("prices_update", findings, codes)).toEqual([findings[0], findings[3]]);
    expect(ownFindings("ecb_update", findings, codes)).toEqual([]);
  });
});
