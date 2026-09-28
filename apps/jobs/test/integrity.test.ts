// Feature 016, E4 (plan §9; ADR-0032; mutants 29 and 30): the quarterly
// integrity end to end over the doubles — the checks of `atlas check --deep`,
// the rehearsal of a restore with the last dump, cut at the same events, and
// the size of the ledger against the threshold of its configuration. It only
// writes its record; the mail function says what it found, once.

import { createHash } from "node:crypto";
import { encodeLine } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeS3 } from "../../../packages/adapters/test/aws/test-only-fake-s3.js";
import { TestOnlyFakeSsm } from "../../../packages/adapters/test/aws/test-only-fake-ssm.js";
import { LedgerBuilder } from "../../../packages/domain/test/ledger-builder.js";
import { MAIL_ENV, RECIPIENT, sentinelLedger, setupJobs } from "./harness.js";

const INTEGRITY_ENV = {
  ATLAS_ENV: "prod",
  ATLAS_DATA_BUCKET: "atlas-prod-data-test",
  ATLAS_JOBS: "quarterly_integrity",
  ATLAS_JOB_MAX_RUN_SECONDS: "900",
  ATLAS_LEDGER_SIZE_WARNING_BYTES: "1048576",
};
const BACKUP_ENV = {
  ATLAS_ENV: "prod",
  ATLAS_DATA_BUCKET: "atlas-prod-data-test",
  ATLAS_JOBS: "monthly_backup",
  ATLAS_JOB_MAX_RUN_SECONDS: "900",
};

/** The first of October in Madrid: the dump at 03:15, the integrity at 04:15. */
const DUMP_AT = "2026-10-01T01:15:00Z";
const CHECK_AT = "2026-10-01T02:15:00Z";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

const withDump = (ledger = sentinelLedger()) => {
  const s3 = new TestOnlyFakeS3();
  s3.seed("ledger/ledger.jsonl", ledger);
  return s3;
};

const dump = (s3: TestOnlyFakeS3) =>
  setupJobs({ env: BACKUP_ENV, now: DUMP_AT, s3, ssm: new TestOnlyFakeSsm() }).run([
    "monthly_backup",
  ]);

const check = (s3: TestOnlyFakeS3, env: Record<string, string> = INTEGRITY_ENV) =>
  setupJobs({ env, now: CHECK_AT, s3, ssm: new TestOnlyFakeSsm() }).run(["quarterly_integrity"]);

const recordOf = (s3: TestOnlyFakeS3) =>
  JSON.parse(s3.text("jobs/integrity/quarterly_integrity/2026-Q4.json") as string);

describe("the quarterly integrity (E4, plan §9)", () => {
  it("finds nothing in a sound ledger restored from its own dump, and writes only its record", async () => {
    const s3 = withDump();
    await dump(s3);
    const before = s3.keys().filter((key) => !key.startsWith("jobs/integrity/"));
    await check(s3);
    const record = recordOf(s3);
    expect(record).toMatchObject({
      state: "done",
      outcome: {
        code: "integrity_checked",
        counts: {
          errors: 0,
          differences: 0,
          bytes: (s3.text("ledger/ledger.jsonl") as string).length,
        },
      },
    });
    expect(record.outcome.counts.rehearsed_events).toBeGreaterThan(10);
    expect(record.findings).toBeUndefined();
    expect(s3.keys().filter((key) => !key.startsWith("jobs/integrity/"))).toEqual(before);
  });

  it("cuts the live ledger at the events of the dump: what came after is no difference (mutant 29)", async () => {
    const s3 = withDump();
    await dump(s3);
    const live = s3.text("ledger/ledger.jsonl") as string;
    // A valuation recorded after the dump, with an id of its own.
    const later = new LedgerBuilder(500);
    later.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2026-09-30",
      quantity: "6",
      unit_value: "1000",
    });
    s3.seed("ledger/ledger.jsonl", `${live}${later.build().map(encodeLine).join("\n")}\n`);
    await check(s3);
    expect(recordOf(s3).findings).toBeUndefined();
  });

  it("says a dump that does not restore to what the ledger says, by code (mutant 29)", async () => {
    const s3 = withDump();
    await dump(s3);
    // Another copy of the ledger under the same record: an amount changed.
    const record = JSON.parse(s3.text("jobs/backup/monthly_backup/2026-10.json") as string);
    const changed = (s3.text("backups/2026-10/ledger.jsonl") as string).replace(
      '"unit_price":"987.65"',
      '"unit_price":"987.66"',
    );
    s3.seed("backups/2026-10/ledger.jsonl", changed);
    record.objects[0].sha256 = sha(changed);
    s3.seed("jobs/backup/monthly_backup/2026-10.json", `${JSON.stringify(record)}\n`);
    await check(s3);
    expect(recordOf(s3).findings).toEqual([
      {
        code: "restore_rehearsal_differs",
        subject: "integrity",
        counts: { event_differs: 1, cash_differ: 1, lots_differ: 1 },
      },
    ]);
  });

  it("says a dump whose ledger is not the one its record kept, and no dump at all", async () => {
    const s3 = withDump();
    await dump(s3);
    s3.seed("backups/2026-10/ledger.jsonl", "tampered\n");
    await check(s3);
    expect(recordOf(s3).findings).toEqual([
      { code: "restore_rehearsal_differs", subject: "integrity", counts: { dump_unreadable: 1 } },
    ]);
    // Bytes that read, and still not the ones the record kept: never rehearsed with.
    const other = withDump();
    await dump(other);
    const kept = JSON.parse(other.text("jobs/backup/monthly_backup/2026-10.json") as string);
    kept.objects[0].sha256 = "0".repeat(64);
    other.seed("jobs/backup/monthly_backup/2026-10.json", `${JSON.stringify(kept)}\n`);
    await check(other);
    expect(recordOf(other).findings).toEqual([
      { code: "restore_rehearsal_differs", subject: "integrity", counts: { dump_unreadable: 1 } },
    ]);
    const none = withDump();
    await check(none);
    expect(recordOf(none).findings).toEqual([
      { code: "restore_rehearsal_differs", subject: "integrity", counts: { dump_missing: 1 } },
    ]);
  });

  it("warns of the size just above the threshold of its configuration, never at it (mutant 30)", async () => {
    const ledger = sentinelLedger();
    for (const [threshold, warned] of [
      [ledger.length, false],
      [ledger.length - 1, true],
    ] as const) {
      const s3 = withDump(ledger);
      await dump(s3);
      await check(s3, { ...INTEGRITY_ENV, ATLAS_LEDGER_SIZE_WARNING_BYTES: String(threshold) });
      expect(recordOf(s3).findings, String(threshold)).toEqual(
        warned
          ? [
              {
                code: "ledger_size_above_threshold",
                subject: "integrity",
                counts: { bytes: ledger.length, threshold },
              },
            ]
          : undefined,
      );
    }
  });

  it("counts the errors of the check with a dump of that ledger, and the mail says them once (copias B1)", async () => {
    const lines = sentinelLedger().trimEnd().split("\n");
    // A line repeated: the same id twice, which `atlas check --deep` refuses —
    // dumped as it is, as it happens in production from the first month.
    const ledger = `${[...lines, lines.at(-1)].join("\n")}\n`;
    const s3 = withDump(ledger);
    await dump(s3);
    await check(s3, { ...INTEGRITY_ENV, ATLAS_LEDGER_SIZE_WARNING_BYTES: "1024" });
    expect(recordOf(s3)).toMatchObject({ state: "done", outcome: { code: "integrity_checked" } });
    expect(recordOf(s3).findings).toEqual([
      { code: "integrity_errors", subject: "integrity", counts: { errors: 1, duplicate_id: 1 } },
      { code: "restore_rehearsal_differs", subject: "integrity", counts: { dump_invalid: 1 } },
      {
        code: "ledger_size_above_threshold",
        subject: "integrity",
        counts: { bytes: ledger.length, threshold: 1024 },
      },
    ]);
    const ssm = new TestOnlyFakeSsm();
    ssm.set("/atlas/prod/mail/recipient", RECIPIENT);
    const mail = setupJobs({ env: MAIL_ENV, now: "2026-10-01T06:00:00Z", s3, ssm });
    await mail.run(["dispatch_findings"]);
    await mail.run(["dispatch_findings"]);
    const subjects = mail.ses.sent.map((sent) => sent.subject);
    expect(
      subjects.filter((subject) => subject === "[Atlas] Aviso: integridad 2026-Q4"),
    ).toHaveLength(3);
    expect(mail.ses.sent.map((sent) => sent.body).join("\n")).toContain(
      "encontró 1 errores (duplicate_id: 1)",
    );
  });

  it("skips the rehearsal of a live ledger that repeats an id of the dump, and says so (copias B1)", async () => {
    const s3 = withDump();
    await dump(s3);
    const live = s3.text("ledger/ledger.jsonl") as string;
    const lines = live.trimEnd().split("\n");
    s3.seed("ledger/ledger.jsonl", `${live}${lines[3]}\n`);
    await check(s3, { ...INTEGRITY_ENV, ATLAS_LEDGER_SIZE_WARNING_BYTES: "1024" });
    expect(recordOf(s3)).toMatchObject({ state: "done", outcome: { code: "integrity_checked" } });
    expect(recordOf(s3).findings).toEqual([
      { code: "integrity_errors", subject: "integrity", counts: { errors: 1, duplicate_id: 1 } },
      {
        code: "restore_rehearsal_differs",
        subject: "integrity",
        counts: { rehearsal_skipped_invalid: 1 },
      },
      {
        code: "ledger_size_above_threshold",
        subject: "integrity",
        counts: { bytes: live.length + (lines[3] as string).length + 1, threshold: 1024 },
      },
    ]);
  });

  it("fails with its code without a ledger, and writes nothing but its record", async () => {
    const s3 = new TestOnlyFakeS3();
    await check(s3);
    expect(recordOf(s3)).toMatchObject({ state: "failed", outcome: { code: "ledger_absent" } });
    expect(s3.keys()).toEqual(["jobs/integrity/quarterly_integrity/2026-Q4.json"]);
  });
});
