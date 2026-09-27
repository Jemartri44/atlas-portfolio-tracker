// Feature 016, E1 (R10; mutant 5; review of PR #104, idempotence B1 and N1):
// the cuts of a delivery **at most once**. No task of E1 sends that way yet
// (the periodic warnings arrive in E4), so a runner of this test does: it
// marks `sending`, sends, and closes. A retry never sends it twice — not
// after a cut between marking and closing, not after a runner that throws
// once the mail may have gone — and sends it again only when nothing went.

import { describe, expect, it } from "vitest";
import type { TaskRunner } from "../src/run.js";
import { MAIL_ENV, setupJobs } from "./harness.js";

const ENV = { ...MAIL_ENV, ATLAS_JOBS: "weekly_review" };
const RECORD = "jobs/mail/weekly_review/2026-W40.json";

/** A warning sent at most once; `throwBefore`/`throwAfter` break it on either side of the send. */
const warning =
  (options: { throwBefore?: boolean; throwAfter?: boolean } = {}): TaskRunner =>
  async (context) => {
    if (options.throwBefore === true) {
      throw new Error("before");
    }
    await context.markSending();
    const sent = await (context.deps.notifier as NonNullable<typeof context.deps.notifier>).send({
      subject: "[Atlas] Aviso de prueba 2026-W40",
      body: "Prueba\n",
    });
    if (options.throwAfter === true) {
      throw new Error("after");
    }
    return sent.ok
      ? { state: "done", outcome: { code: "mail_sent" } }
      : { state: "send_failed", outcome: { code: sent.code } };
  };

const stateOf = (jobs: ReturnType<typeof setupJobs>) =>
  JSON.parse(jobs.s3.text(RECORD) as string).state as string;

describe("a delivery at most once, cut (R10)", () => {
  it("is marked `sending` before the mail goes", async () => {
    const jobs = setupJobs({ env: ENV, runners: { weekly_review: warning() } });
    const seen: string[] = [];
    jobs.ses.beforeSend = () => seen.push(stateOf(jobs));
    await jobs.run(["weekly_review"]);
    expect(seen).toEqual(["sending"]);
    expect(stateOf(jobs)).toBe("done");
  });

  it("is never sent again after a cut between sending and closing (mutants M1 and M2)", async () => {
    const jobs = setupJobs({ env: ENV, runners: { weekly_review: warning() } });
    const put = jobs.s3.putIfMatch.bind(jobs.s3);
    let cut = true;
    jobs.s3.putIfMatch = async (key, body, etag) => {
      if (cut && key === RECORD && new TextDecoder().decode(body).includes('"state":"done"')) {
        cut = false;
        throw new Error("the Lambda died here");
      }
      return put(key, body, etag);
    };
    await jobs.run(["weekly_review"]);
    expect(jobs.ses.sent).toHaveLength(1);
    expect(stateOf(jobs)).toBe("sending");
    jobs.setNow("2026-10-01T06:14:59Z");
    await jobs.run(["weekly_review"], "req-2");
    expect(stateOf(jobs)).toBe("sending");
    jobs.setNow("2026-10-01T06:15:00Z");
    await jobs.run(["weekly_review"], "req-3");
    expect(jobs.ses.attempts).toHaveLength(1);
    expect(stateOf(jobs)).toBe("send_unknown");
    jobs.setNow("2026-10-02T06:00:00Z");
    await jobs.run(["weekly_review"], "req-4");
    expect(jobs.ses.attempts).toHaveLength(1);
  });

  it("closes as `send_unknown`, not `failed`, when the runner throws after `sending` (B1)", async () => {
    const jobs = setupJobs({ env: ENV, runners: { weekly_review: warning({ throwAfter: true }) } });
    await jobs.run(["weekly_review"]);
    expect(jobs.ses.sent).toHaveLength(1);
    expect(JSON.parse(jobs.s3.text(RECORD) as string)).toMatchObject({
      state: "send_unknown",
      outcome: { code: "task_error" },
    });
    jobs.setNow("2026-10-02T06:00:00Z");
    await jobs.run(["weekly_review"], "req-2");
    expect(jobs.ses.attempts).toHaveLength(1);
  });

  it("is sent again when it failed before `sending`: nothing went", async () => {
    const jobs = setupJobs({
      env: ENV,
      runners: { weekly_review: warning({ throwBefore: true }) },
    });
    await jobs.run(["weekly_review"]);
    expect(stateOf(jobs)).toBe("failed");
    expect(jobs.ses.attempts).toEqual([]);
    const retry = setupJobs({ env: ENV, runners: { weekly_review: warning() } });
    retry.s3.seed(RECORD, jobs.s3.text(RECORD) as string);
    retry.setNow("2026-10-02T06:00:00Z");
    await retry.run(["weekly_review"]);
    expect(retry.ses.sent).toHaveLength(1);
    expect(JSON.parse(retry.s3.text(RECORD) as string)).toMatchObject({
      state: "done",
      attempts: 2,
    });
  });
});
