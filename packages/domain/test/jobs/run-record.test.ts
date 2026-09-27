// Feature 016, E1 (R10, mutant 5): the run record of a job and a period, read
// strictly, and what a retry does in each state.

import { describe, expect, it } from "vitest";
import {
  claimRecord,
  isClosed,
  nextStep,
  parseRunRecord,
  type RunRecord,
  recordIn,
  runRecordKey,
  serializeRunRecord,
} from "../../src/jobs/run-record.js";

const AT = "2026-10-01T06:00:00Z";
const LATER = "2026-10-01T06:00:05.123Z";

const claimed = claimRecord("monthly_reminder", "2026-10", AT);
/** Fifteen minutes, the longest a Lambda runs (review of PR #104, idempotence N3). */
const MAX_RUN = 900_000;
const LONG_AFTER = Date.parse(AT) + MAX_RUN;

describe("the run record", () => {
  it("lives under jobs/, by family, task and period", () => {
    expect(runRecordKey("monthly_reminder", "2026-10")).toBe(
      "jobs/mail/monthly_reminder/2026-10.json",
    );
    expect(runRecordKey("ecb_update", "2026-10-03")).toBe("jobs/ecb/ecb_update/2026-10-03.json");
  });

  it("is claimed with one attempt, taken up again with one more, and closed with its instant", () => {
    expect(claimed).toEqual({
      run_format: 1,
      task: "monthly_reminder",
      period: "2026-10",
      state: "claimed",
      claimed_at: AT,
      attempts: 1,
    });
    const again = claimRecord(
      "monthly_reminder",
      "2026-10",
      LATER,
      recordIn(claimed, "send_failed", AT),
    );
    expect(again.attempts).toBe(2);
    expect(again.claimed_at).toBe(LATER);
    expect(again.closed_at).toBeUndefined();
    const done = recordIn(claimed, "done", LATER, { outcome: { code: "mail_sent" } });
    expect(done).toEqual({
      ...claimed,
      state: "done",
      closed_at: LATER,
      outcome: { code: "mail_sent" },
    });
    expect(recordIn(done, "sending", LATER).closed_at).toBeUndefined();
  });

  it("reads back what it writes, and nothing it did not", () => {
    const full: RunRecord = {
      ...recordIn(claimed, "failed", LATER, {
        outcome: { code: "ledger_unreadable", counts: { lines: 3 } },
        frequencies: {
          ignored: [
            { code: "job_not_available", key: "reconciliation" },
            { code: "job_frequency_unknown_key" },
          ],
        },
        findings: [
          { code: "task_failed", subject: "ecb_update", counts: { n: 1 }, dates: ["2026-10-01"] },
        ],
      }),
    };
    expect(parseRunRecord(serializeRunRecord(full), "monthly_reminder", "2026-10")).toEqual({
      ok: true,
      record: full,
    });
    const text = serializeRunRecord(claimed);
    const unreadable = [
      "",
      "not json",
      "[]",
      text.replace('"attempts":1', '"attempts":1,"attempts":2'),
      text.replace('"attempts":1', '"attempts":0'),
      text.replace('"state":"claimed"', '"state":"lost"'),
      text.replace('"claimed_at":"2026-10-01T06:00:00Z"', '"claimed_at":"yesterday"'),
      text.replace('"run_format":1', '"run_format":1,"extra":1'),
      text.replace('"run_format":1', '"run_format":0'),
      text.replace("}", ',"closed_at":"never"}'),
      text.replace("}", ',"outcome":{"code":"Bad Code"}}'),
      text.replace("}", ',"outcome":{"code":"ok","counts":{"n":-1}}}'),
      text.replace("}", ',"outcome":{"code":"ok","why":"x"}}'),
      text.replace("}", ',"findings":[{"code":"x","subject":"ES0000000001 fund"}]}'),
      text.replace("}", ',"findings":[{"code":"x","subject":"s","dates":["2026-13-01"]}]}'),
      text.replace("}", ',"findings":{}}'),
      text.replace("}", ',"frequencies":{"ignored":[{"code":"x","key":"Bad Key"}]}}'),
      text.replace("}", ',"frequencies":{"ignored":{}}}'),
      text.replace("}", ',"frequencies":[]}'),
      text.replace('"state":"claimed"', '"state":"claimed\ud800"'),
    ];
    for (const bad of unreadable) {
      expect(parseRunRecord(bad, "monthly_reminder", "2026-10"), bad).toEqual({
        ok: false,
        code: "job_record_unreadable",
      });
    }
    expect(parseRunRecord(text, "monthly_reminder", "2026-11").ok).toBe(false);
    expect(parseRunRecord(text, "weekly_review", "2026-10").ok).toBe(false);
    expect(
      parseRunRecord(
        text.replace('"run_format":1', '"run_format":2'),
        "monthly_reminder",
        "2026-10",
      ),
    ).toEqual({
      ok: false,
      code: "job_record_newer_format",
    });
  });
});

describe("what a retry does in each state (R10, plan §5.3)", () => {
  const inState = (state: RunRecord["state"]) => recordIn(claimed, state, LATER);

  it("starts a period nobody claimed", () => {
    expect(nextStep(undefined, "at_least_once", LONG_AFTER, MAX_RUN)).toEqual({ kind: "start" });
    expect(nextStep(undefined, "at_most_once", LONG_AFTER, MAX_RUN)).toEqual({ kind: "start" });
  });

  it("does nothing more with a period closed, whatever the delivery", () => {
    for (const delivery of ["at_least_once", "at_most_once", "repeatable"] as const) {
      expect(nextStep(inState("done"), delivery, LONG_AFTER, MAX_RUN)).toEqual({
        kind: "skip",
        code: "job_already_done",
      });
      expect(nextStep(inState("send_unknown"), delivery, LONG_AFTER, MAX_RUN)).toEqual({
        kind: "skip",
        code: "job_send_unknown",
      });
    }
    expect(isClosed(inState("done"))).toBe(true);
    expect(isClosed(inState("send_unknown"))).toBe(true);
    expect(isClosed(inState("failed"))).toBe(false);
    expect(isClosed(inState("claimed"))).toBe(false);
  });

  it("never sends a warning twice: cut after `sending`, it is closed as unknown", () => {
    expect(nextStep(inState("sending"), "at_most_once", LONG_AFTER, MAX_RUN)).toEqual({
      kind: "close_unknown",
    });
    expect(nextStep(inState("sending"), "at_least_once", LONG_AFTER, MAX_RUN)).toEqual({
      kind: "resume",
    });
    expect(nextStep(inState("sending"), "repeatable", LONG_AFTER, MAX_RUN)).toEqual({
      kind: "resume",
    });
  });

  it("takes up again what was claimed and abandoned, refused, or failed before sending", () => {
    for (const state of ["claimed", "send_failed", "failed"] as const) {
      for (const delivery of ["at_least_once", "at_most_once", "repeatable"] as const) {
        expect(
          nextStep(inState(state), delivery, LONG_AFTER, MAX_RUN),
          `${state} ${delivery}`,
        ).toEqual({
          kind: "resume",
        });
      }
    }
  });

  it("leaves alone a run that may still be going on: claimed or sending less than its longest run ago (N3)", () => {
    for (const state of ["claimed", "sending"] as const) {
      for (const delivery of ["at_least_once", "at_most_once", "repeatable"] as const) {
        expect(
          nextStep(inState(state), delivery, LONG_AFTER - 1, MAX_RUN),
          `${state} ${delivery}`,
        ).toEqual({
          kind: "skip",
          code: "job_in_progress",
        });
      }
    }
    expect(nextStep(inState("claimed"), "at_least_once", LONG_AFTER, MAX_RUN)).toEqual({
      kind: "resume",
    });
    expect(nextStep(inState("sending"), "at_most_once", LONG_AFTER, MAX_RUN)).toEqual({
      kind: "close_unknown",
    });
    expect(nextStep(inState("send_failed"), "at_least_once", Date.parse(AT), MAX_RUN)).toEqual({
      kind: "resume",
    });
    expect(nextStep(inState("failed"), "at_most_once", Date.parse(AT), MAX_RUN)).toEqual({
      kind: "resume",
    });
  });
});
