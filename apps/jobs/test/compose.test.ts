// Feature 016, E1 (R17, R18): the composition of the jobs refuses to start
// with what it does not understand, saying only the name of why; builds the
// sender of SES only for the mail family (§8.2 B2).

import { JOB_TASKS } from "@atlas/domain/jobs";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeS3 } from "../../../packages/adapters/test/aws/test-only-fake-s3.js";
import { TestOnlyFakeSes } from "../../../packages/adapters/test/aws/test-only-fake-ses.js";
import { TestOnlyFakeSsm } from "../../../packages/adapters/test/aws/test-only-fake-ssm.js";
import { composeOrFail, composeWith } from "../src/compose.js";
import { RUNNERS } from "../src/tasks/index.js";
import { MAIL_ENV } from "./harness.js";

const parts = (logs: string[], mailCalls: { n: number }) => ({
  objects: () => new TestOnlyFakeS3(),
  parameters: () => new TestOnlyFakeSsm(),
  mail: () => {
    mailCalls.n += 1;
    return new TestOnlyFakeSes();
  },
  fetch: () => Promise.reject(new Error("no network in the tests")),
  clock: { now: () => new Date(Date.parse("2026-10-01T06:00:00Z")) },
  log: (line: string) => logs.push(line),
});

describe("the composition of the jobs (R17, R18)", () => {
  it("refuses to start with a variable it does not know, one of another family or a task not built yet", () => {
    for (const [env, reason] of [
      [{ ...MAIL_ENV, ATLAS_EODHD_KEY: "sentinel-key-123" }, "unknown"],
      [{ ...MAIL_ENV, ATLAS_JOBS: "monthly_reminder,prices_update" }, "mixed_families"],
      [
        {
          ATLAS_ENV: "prod",
          ATLAS_DATA_BUCKET: "atlas-prod-data-test",
          ATLAS_JOBS: "quarterly_integrity",
          ATLAS_JOB_MAX_RUN_SECONDS: "900",
        },
        "missing",
      ],
      [{}, "missing"],
    ] as const) {
      const logs: string[] = [];
      expect(() => composeOrFail(env, parts(logs, { n: 0 })), reason).toThrow(/^compose_failed$/);
      expect(logs.map((line) => JSON.parse(line))).toEqual([
        {
          level: "ERROR",
          request_id: "startup",
          job: "startup",
          code: "compose_failed",
          error_name: "ValidationError",
          reason,
        },
      ]);
      expect(logs.join("\n")).not.toContain("sentinel-key-123");
    }
  });

  it("has a runner for every task of the catalog (E4), and refuses a task without one", () => {
    expect(Object.keys(RUNNERS).sort()).toEqual(Object.keys(JOB_TASKS).sort());
    for (const jobs of ["monthly_backup", "weekly_review", "tax_return_ready"]) {
      const env =
        jobs === "monthly_backup"
          ? {
              ATLAS_ENV: "prod",
              ATLAS_DATA_BUCKET: "atlas-prod-data-test",
              ATLAS_JOBS: jobs,
              ATLAS_JOB_MAX_RUN_SECONDS: "900",
            }
          : { ...MAIL_ENV, ATLAS_JOBS: jobs };
      expect(() => composeWith(env, parts([], { n: 0 }), {}), jobs).toThrow(
        expect.objectContaining({
          details: { variable: "ATLAS_JOBS", reason: "task_not_available" },
        }),
      );
      expect(() => composeWith(env, parts([], { n: 0 }), RUNNERS), jobs).not.toThrow();
    }
  });

  it("says only the name of a foreign failure, never its message", () => {
    const logs: string[] = [];
    expect(() =>
      composeOrFail(MAIL_ENV, {
        ...parts(logs, { n: 0 }),
        parameters: () => {
          throw Object.assign(new Error("arn:aws:iam::123456789012:role/x is not authorized"), {
            name: "AccessDeniedException",
          });
        },
      }),
    ).toThrow(/^compose_failed$/);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0] as string)).toEqual({
      level: "ERROR",
      request_id: "startup",
      job: "startup",
      code: "compose_failed",
      error_name: "AccessDeniedException",
    });
  });

  it("builds the sender of SES for the mail function only", () => {
    const mail = { n: 0 };
    composeOrFail(MAIL_ENV, parts([], mail));
    expect(mail.n).toBe(1);
    for (const extra of [
      { ATLAS_JOBS: "ecb_update" },
      { ATLAS_JOBS: "monthly_backup" },
      { ATLAS_JOBS: "quarterly_integrity", ATLAS_LEDGER_SIZE_WARNING_BYTES: "1048576" },
    ]) {
      const other = { n: 0 };
      composeOrFail(
        {
          ATLAS_ENV: "prod",
          ATLAS_DATA_BUCKET: "atlas-prod-data-test",
          ATLAS_JOB_MAX_RUN_SECONDS: "300",
          ...extra,
        },
        parts([], other),
      );
      expect(other.n, extra.ATLAS_JOBS).toBe(0);
    }
  });
});
