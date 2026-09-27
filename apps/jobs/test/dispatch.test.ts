// Feature 016, E1 (R19; mutants 18, 18 bis): the warnings the other jobs
// leave in their records, sent by the mail function once per streak, never
// twice after a cut, and closed when the condition is gone.

import {
  claimRecord,
  noticeIn,
  recordIn,
  serializeNotice,
  serializeRunRecord,
} from "@atlas/domain/jobs";
import { describe, expect, it } from "vitest";
import { setupJobs } from "./harness.js";

const failedBackup = (period: string) =>
  serializeRunRecord(
    recordIn(
      claimRecord("monthly_backup", period, "2026-10-01T01:15:00Z"),
      "failed",
      "2026-10-01T01:16:00Z",
      {
        outcome: { code: "task_error" },
      },
    ),
  );
const doneBackup = (period: string) =>
  serializeRunRecord(
    recordIn(
      claimRecord("monthly_backup", period, "2026-11-01T01:15:00Z"),
      "done",
      "2026-11-01T01:16:00Z",
      {
        outcome: { code: "backup_written" },
      },
    ),
  );
const NOTICE = "jobs/mail/notices/task_failed--monthly_backup.json";

describe("the warnings of the other jobs (R19)", () => {
  it("sends a failed job once, not again the next day of the same streak", async () => {
    const jobs = setupJobs();
    jobs.s3.seed("jobs/backup/monthly_backup/2026-10.json", failedBackup("2026-10"));
    await jobs.run(["dispatch_findings"]);
    expect(jobs.ses.sent.map((mail) => mail.subject)).toEqual([
      "[Atlas] Aviso: tarea monthly_backup",
    ]);
    expect(jobs.ses.sent[0]?.body).toContain(
      "Ha fallado el volcado mensual en el periodo 2026-10 (código task_error), desde el 2026-10-01.",
    );
    expect(JSON.parse(jobs.s3.text(NOTICE) as string)).toMatchObject({
      state: "sent",
      streak_since: "2026-10-01",
    });
    jobs.setNow("2026-10-02T06:00:00Z");
    await jobs.run(["dispatch_findings"], "req-2");
    jobs.setNow("2026-10-03T06:00:00Z");
    await jobs.run(["dispatch_findings"], "req-3");
    expect(jobs.ses.sent).toHaveLength(1);
  });

  it("closes the streak when the job no longer fails, and opens another when it fails again", async () => {
    const jobs = setupJobs();
    jobs.s3.seed("jobs/backup/monthly_backup/2026-10.json", failedBackup("2026-10"));
    await jobs.run(["dispatch_findings"]);
    jobs.setNow("2026-11-02T06:00:00Z");
    jobs.s3.seed("jobs/backup/monthly_backup/2026-11.json", doneBackup("2026-11"));
    await jobs.run(["dispatch_findings"], "req-2");
    expect(JSON.parse(jobs.s3.text(NOTICE) as string).state).toBe("closed");
    jobs.setNow("2026-12-02T06:00:00Z");
    jobs.s3.seed("jobs/backup/monthly_backup/2026-12.json", failedBackup("2026-12"));
    await jobs.run(["dispatch_findings"], "req-3");
    expect(jobs.ses.sent).toHaveLength(2);
    expect(JSON.parse(jobs.s3.text(NOTICE) as string)).toMatchObject({
      state: "sent",
      streak_since: "2026-12-02",
    });
  });

  it("marks a streak `sending` before its mail goes, so a cut never sends it twice (at most once)", async () => {
    const jobs = setupJobs();
    jobs.s3.seed("jobs/backup/monthly_backup/2026-10.json", failedBackup("2026-10"));
    const seen: string[] = [];
    jobs.ses.beforeSend = () => seen.push(JSON.parse(jobs.s3.text(NOTICE) as string).state);
    await jobs.run(["dispatch_findings"]);
    expect(seen).toEqual(["sending"]);
  });

  it("does not send again a streak cut between sending and noting: it is closed as unknown", async () => {
    const jobs = setupJobs();
    jobs.s3.seed("jobs/backup/monthly_backup/2026-10.json", failedBackup("2026-10"));
    jobs.s3.seed(
      NOTICE,
      serializeNotice(
        noticeIn(
          { code: "task_failed", subject: "monthly_backup" },
          "sending",
          "2026-10-01T06:00:01Z",
          "2026-10-01",
        ),
      ),
    );
    jobs.setNow("2026-10-02T06:00:00Z");
    await jobs.run(["dispatch_findings"]);
    expect(jobs.ses.attempts).toEqual([]);
    expect(JSON.parse(jobs.s3.text(NOTICE) as string)).toMatchObject({
      state: "send_unknown",
      streak_since: "2026-10-01",
    });
  });

  it("sends again a streak SES refused, and never one whose fate is unknown", async () => {
    const jobs = setupJobs();
    jobs.s3.seed("jobs/backup/monthly_backup/2026-10.json", failedBackup("2026-10"));
    jobs.ses.refuseNext();
    await jobs.run(["dispatch_findings"]);
    expect(JSON.parse(jobs.s3.text(NOTICE) as string).state).toBe("send_failed");
    jobs.setNow("2026-10-02T06:00:00Z");
    jobs.ses.loseAfterSendingNext();
    await jobs.run(["dispatch_findings"], "req-2");
    expect(JSON.parse(jobs.s3.text(NOTICE) as string).state).toBe("send_unknown");
    jobs.setNow("2026-10-03T06:00:00Z");
    await jobs.run(["dispatch_findings"], "req-3");
    expect(jobs.ses.attempts).toHaveLength(2);
  });

  it("opens and closes nothing for a job that has not said anything yet", async () => {
    const jobs = setupJobs();
    jobs.s3.seed(
      NOTICE,
      serializeNotice(
        noticeIn(
          { code: "task_failed", subject: "monthly_backup" },
          "sent",
          "2026-09-01T06:00:00Z",
          "2026-09-01",
        ),
      ),
    );
    jobs.s3.seed(
      "jobs/backup/monthly_backup/2026-10.json",
      serializeRunRecord(claimRecord("monthly_backup", "2026-10", "2026-10-01T01:15:00Z")),
    );
    await jobs.run(["dispatch_findings"]);
    expect(JSON.parse(jobs.s3.text(NOTICE) as string).state).toBe("sent");
    expect(jobs.ses.attempts).toEqual([]);
  });

  it("writes its own record, and only under jobs/mail/", async () => {
    const jobs = setupJobs();
    jobs.s3.seed("jobs/backup/monthly_backup/2026-10.json", failedBackup("2026-10"));
    const before = jobs.s3.text("jobs/backup/monthly_backup/2026-10.json");
    await jobs.run(["dispatch_findings"]);
    expect(jobs.s3.text("jobs/backup/monthly_backup/2026-10.json")).toBe(before);
    expect(
      JSON.parse(jobs.s3.text("jobs/mail/dispatch_findings/2026-10-01.json") as string),
    ).toMatchObject({
      state: "done",
      outcome: {
        code: "findings_dispatched",
        counts: { sent: 1, closed: 0, refused: 0, unknown: 0, ignored: 0 },
      },
    });
    const writes = jobs.s3.conditions.map((condition) => condition.key);
    expect(writes.filter((key) => !key.startsWith("jobs/mail/"))).toEqual([]);
  });

  it("sends nothing a record says with a code it may not say, whatever the subject (privacy B1)", async () => {
    for (const subject of ["IE00B4L5Y983", "ast_xau", "constructor", "monthly_backup"]) {
      const jobs = setupJobs();
      jobs.s3.seed(
        "jobs/backup/monthly_backup/2026-10.json",
        serializeRunRecord(
          recordIn(
            claimRecord("monthly_backup", "2026-10", "2026-10-01T01:15:00Z"),
            "done",
            "2026-10-01T01:16:00Z",
            {
              outcome: { code: "backup_written" },
              findings: [
                { code: "task_failed", subject },
                { code: "record_unreadable", subject },
                { code: "source_failing", subject },
              ],
            },
          ),
        ),
      );
      await jobs.run(["dispatch_findings"]);
      expect(jobs.ses.sent, subject).toEqual([]);
      expect(
        jobs.s3.keys().filter((key) => key.startsWith("jobs/mail/notices/")),
        subject,
      ).toEqual([]);
    }
  });

  it("says a record of a producer that cannot be read, once, with the task and its period (N4)", async () => {
    const jobs = setupJobs();
    jobs.s3.seed("jobs/backup/monthly_backup/2026-10.json", "{}\n");
    await jobs.run(["dispatch_findings"]);
    expect(jobs.ses.sent.map((mail) => mail.subject)).toEqual([
      "[Atlas] Aviso: registro de monthly_backup",
    ]);
    expect(jobs.ses.sent[0]?.body).toContain(
      "El registro de monthly_backup (el volcado mensual) del periodo 2026-10 no se puede leer (código job_record_unreadable), desde el 2026-10-01.",
    );
    jobs.setNow("2026-10-02T06:00:00Z");
    await jobs.run(["dispatch_findings"], "req-2");
    expect(jobs.ses.sent).toHaveLength(1);
  });
});
