// Feature 016, block 1 of E1 (G7, R15; mutant 9): **the log of the jobs never
// carries** the recipient, the sender, the subject or the body of a mail, an
// amount, an `asset_id`, an account, a key, a token, a mail address or a `sub`,
// nor the message of a foreign error — on the happy path **and on every path
// of failure**: SSM that throttles, SES that refuses or does not answer, S3
// that denies, a function without configuration, an event with a sentinel in
// it. `stdout` and `stderr` are captured too, not only the logger.

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

describe("the log of the jobs (G7, R15)", () => {
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
          clock: { now: () => new Date(0) },
          log: (line) => logs.push(line),
        },
      ),
    ).toThrow();
    check(logs);
  });
});
