// Feature 016, block 1 of E1 (G7, R15; mutant 9): **the log of the jobs never
// carries** the recipient, the sender, the subject or the body of a mail, an
// amount, an `asset_id`, an account, a key, a token, a mail address or a `sub`,
// nor the message of a foreign error — on the happy path **and on every path
// of failure**: SSM that throttles, SES that refuses or does not answer, S3
// that denies, a function without configuration, an event with a sentinel in
// it. `stdout` and `stderr` are captured too, not only the logger.

import { claimRecord, recordIn, serializeRunRecord } from "@atlas/domain/jobs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestOnlyFakeS3 } from "../../../packages/adapters/test/aws/test-only-fake-s3.js";
import { TestOnlyFakeSes } from "../../../packages/adapters/test/aws/test-only-fake-ses.js";
import { TestOnlyFakeSsm } from "../../../packages/adapters/test/aws/test-only-fake-ssm.js";
import { composeOrFail } from "../src/compose.js";
import { MAIL_ENV, RECIPIENT, SENDER, SENTINELS, setupJobs } from "./harness.js";

const KEY = "sentinel-key-of-the-source";
const SUB = "108234567890123456789";
const FOREIGN = `${RECIPIENT} arn:aws:s3:::atlas-prod-data-test/ledger/ledger.jsonl ${KEY} ${SUB}`;

let written: string[] = [];
beforeEach(() => {
  written = [];
  for (const stream of [process.stdout, process.stderr]) {
    vi.spyOn(stream, "write").mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
  }
});
// The console of Node too: vitest takes it before it reaches a stream, so a
// `console.log` would never be seen above (mutant 15 of E2 survived that way).
beforeEach(() => {
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      written.push(
        args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "),
      );
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

const forbidden = (subjects: readonly string[]): string[] => [
  RECIPIENT,
  SENDER,
  KEY,
  SUB,
  "@example.test",
  "arn:aws",
  "Recordatorio",
  "Aportación",
  ...SENTINELS.amounts,
  ...SENTINELS.ids,
  ...subjects,
];

const check = (logs: readonly string[], subjects: readonly string[] = []) => {
  const text = [...logs, ...written].join("\n");
  expect(logs.length).toBeGreaterThan(0);
  for (const sentinel of forbidden(subjects)) {
    expect(text, sentinel).not.toContain(sentinel);
  }
};

/** A failed backup, and a record that tries to put an id and an ISIN in a warning. */
const seedProducers = (jobs: ReturnType<typeof setupJobs>) => {
  jobs.s3.seed(
    "jobs/backup/monthly_backup/2026-10.json",
    serializeRunRecord(
      recordIn(
        claimRecord("monthly_backup", "2026-10", "2026-10-01T01:15:00Z"),
        "failed",
        "2026-10-01T01:16:00Z",
        {
          outcome: { code: "task_error" },
          findings: [
            { code: "task_failed", subject: "ast_world" },
            { code: "source_failing", subject: "IE00B4L5Y983" },
          ],
        },
      ),
    ),
  );
  jobs.s3.seed("jobs/integrity/quarterly_integrity/2026-Q4.json", "{}\n");
};

describe("the log of the jobs (G7, R15)", () => {
  it("carries none of them when the mail function sends warnings, is refused or loses them (privacy N3)", async () => {
    for (const trouble of ["none", "refuse", "lose"] as const) {
      const jobs = setupJobs();
      seedProducers(jobs);
      if (trouble === "refuse") {
        jobs.ses.refuseNext(2);
      }
      if (trouble === "lose") {
        jobs.ses.loseAfterSendingNext();
      }
      await jobs.run(["dispatch_findings", "monthly_reminder"]);
      expect(jobs.ses.attempts.length, trouble).toBeGreaterThan(1);
      const subjects = jobs.ses.attempts.map((mail) => mail.subject);
      check(jobs.logs, [...subjects, "IE00B4L5Y983", "Ha fallado", "no se puede leer"]);
      expect(jobs.ses.attempts.map((mail) => mail.body).join("\n")).not.toContain("IE00B4L5Y983");
      expect(jobs.ses.attempts.map((mail) => mail.body).join("\n")).not.toContain("ast_world");
    }
  });

  it("carries none of them when the reminder goes, amounts on", async () => {
    const jobs = setupJobs();
    jobs.ssm.set("/atlas/prod/mail/amounts", "on");
    await jobs.run(["dispatch_findings", "monthly_reminder"]);
    expect(jobs.ses.sent).toHaveLength(1);
    check(
      jobs.logs,
      jobs.ses.sent.map((mail) => mail.subject),
    );
  });

  it("carries none of them when SSM throttles, SES refuses or loses the mail", async () => {
    const throttled = setupJobs();
    throttled.ssm.throttleNext(5);
    await throttled.run(["monthly_reminder"]);
    check(throttled.logs);
    const refused = setupJobs();
    refused.ses.refuseNext();
    await refused.run(["monthly_reminder"]);
    check(refused.logs);
    const lost = setupJobs();
    lost.ses.loseAfterSendingNext();
    await lost.run(["monthly_reminder"]);
    check(
      lost.logs,
      lost.ses.sent.map((mail) => mail.subject),
    );
  });

  it("carries none of them when S3 denies, with a message full of them", async () => {
    const jobs = setupJobs();
    jobs.s3.get = async () => {
      throw Object.assign(new Error(FOREIGN), { name: "AccessDenied" });
    };
    await jobs.run(["monthly_reminder"]);
    check(jobs.logs);
    const writes = setupJobs();
    writes.s3.putIfNoneMatch = async () => {
      throw Object.assign(new Error(FOREIGN), { name: "AccessDenied" });
    };
    await writes.run(["dispatch_findings", "monthly_reminder"]);
    check(writes.logs);
    expect(writes.logs.map((line) => JSON.parse(line).error_name)).toContain("AccessDenied");
  });

  it("carries none of them when a task throws with a message full of them", async () => {
    const jobs = setupJobs();
    jobs.ssm.listByPath = async () => {
      throw new Error(FOREIGN);
    };
    jobs.s3.list = async () => {
      throw new Error(FOREIGN);
    };
    await jobs.run(["dispatch_findings", "monthly_reminder"]);
    check(jobs.logs);
  });

  it("carries none of them when a source of prices or the ECB fails with a message full of them (E2)", async () => {
    const symbols = JSON.stringify({
      symbols_format: 2,
      assets: {
        ast_world: {
          eodhd: "WORLD.XETRA",
          currencies: { eodhd: "EUR" },
          confirmed_at: "2026-09-01T00:00:00.000Z",
          currency_check: { eodhd: { at: "2026-09-01T00:00:00.000Z" } },
        },
      },
    });
    const failures = [
      () => Promise.reject(new Error(`${FOREIGN} WORLD.XETRA ast_world`)),
      () => Promise.resolve(new Response(`${FOREIGN} WORLD.XETRA ast_world`, { status: 500 })),
      () => Promise.resolve(new Response(`[{"date":"${FOREIGN}","close":"x"}]`)),
    ];
    const families = [
      { ATLAS_JOBS: "ecb_update" },
      {
        ATLAS_JOBS: "prices_update",
        ATLAS_PRICE_SOURCES: "eodhd",
        ATLAS_PRICES_EODHD_DAILY_CALLS: "18",
        ATLAS_PRICES_ALPHA_VANTAGE_DAILY_CALLS: "0",
        ATLAS_PRICES_FAILURE_THRESHOLD: "3",
      },
    ];
    for (const fail of failures) {
      for (const family of families) {
        const jobs = setupJobs({
          env: {
            ATLAS_ENV: "prod",
            ATLAS_DATA_BUCKET: "atlas-prod-data-test",
            ATLAS_JOB_MAX_RUN_SECONDS: "900",
            ...family,
          },
          fetch: fail,
        });
        jobs.s3.seed("prices/symbols.json", symbols);
        jobs.ssm.set("/atlas/prod/prices/eodhd-key", KEY);
        await jobs.run([family.ATLAS_JOBS]);
        // The source was reached, and failed: the path under test is the one of failure.
        expect(jobs.fetched.length, family.ATLAS_JOBS).toBeGreaterThan(0);
        check(jobs.logs, ["WORLD.XETRA"]);
        const records = jobs.s3
          .keys()
          .filter((key) => key.startsWith("jobs/"))
          .map((key) => jobs.s3.text(key) ?? "");
        expect(records.length, family.ATLAS_JOBS).toBeGreaterThan(0);
        for (const sentinel of [KEY, RECIPIENT, "WORLD.XETRA", "arn:aws"]) {
          expect(records.join("\n"), sentinel).not.toContain(sentinel);
        }
      }
    }
  });

  it("carries none of them when the event or the configuration is wrong", async () => {
    const jobs = setupJobs();
    await jobs.handler({ event_format: 1, tasks: [KEY, RECIPIENT] }, { awsRequestId: RECIPIENT });
    await jobs.handler({ [RECIPIENT]: KEY });
    check(jobs.logs);
    const logs: string[] = [];
    expect(() =>
      composeOrFail(
        { ...MAIL_ENV, ATLAS_MAIL_FROM: `${SENDER}, ${RECIPIENT}`, [`ATLAS_${KEY}`]: KEY },
        {
          objects: () => new TestOnlyFakeS3(),
          parameters: () => new TestOnlyFakeSsm(),
          mail: () => new TestOnlyFakeSes(),
          fetch: () => Promise.reject(new Error("no network in the tests")),
          clock: { now: () => new Date(0) },
          log: (line) => logs.push(line),
        },
      ),
    ).toThrow();
    check(logs);
  });
});
