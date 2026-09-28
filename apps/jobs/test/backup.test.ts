// Feature 016, E4 (plan §8; ADR-0032, point 3; mutant 28): the monthly dump
// end to end over the doubles. The ledger byte for byte, positions.json of
// that ledger, the ECB history with its manifest and prices/ into
// backups/<YYYY-MM>/, every object with If-None-Match: *; a cut between any
// two objects is finished by the retry without overwriting anything; and
// what fails is said by the mail function only.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeS3 } from "../../../packages/adapters/test/aws/test-only-fake-s3.js";
import { TestOnlyFakeSsm } from "../../../packages/adapters/test/aws/test-only-fake-ssm.js";
import { MAIL_ENV, RECIPIENT, records, sentinelLedger, setupJobs } from "./harness.js";

const BACKUP_ENV = {
  ATLAS_ENV: "prod",
  ATLAS_DATA_BUCKET: "atlas-prod-data-test",
  ATLAS_JOBS: "monthly_backup",
  ATLAS_JOB_MAX_RUN_SECONDS: "900",
};

/** 03:15 of the first of October in Madrid. */
const AT = "2026-10-01T01:15:00Z";
const DUMP = "backups/2026-10/";
const sha = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");

const HISTORY = "Date,USD,\n2026-09-30,1.1000,\n";
const manifestOf = (history: string) =>
  `${JSON.stringify({
    active: {
      file: "eurofxref-hist.csv",
      source: "zip",
      sha256: sha(history),
      url: "https://ecb.example/zip",
      fetched_at: "2026-09-30T15:30:00.000Z",
    },
    rejected: [],
  })}\n`;

/** A bucket with the ledger, the ECB history in force and three objects of prices/. */
const seeded = (s3 = new TestOnlyFakeS3()) => {
  s3.seed("ledger/ledger.jsonl", sentinelLedger());
  s3.seed("reference/ecb/eurofxref-hist.csv", HISTORY);
  s3.seed("reference/ecb/manifest.json", manifestOf(HISTORY));
  s3.seed("reference/ecb/previous/eurofxref-hist.csv", "older");
  s3.seed("prices/ast_world.jsonl", "");
  s3.seed("prices/symbols.json", '{"symbols_format":2,"assets":{}}\n');
  s3.seed("prices/_status.json", "{}\n");
  return s3;
};

const backup = (s3: TestOnlyFakeS3, now = AT) =>
  setupJobs({ env: BACKUP_ENV, now, s3, ssm: new TestOnlyFakeSsm() });

const recordOf = (s3: TestOnlyFakeS3, period = "2026-10") =>
  JSON.parse(s3.text(`jobs/backup/monthly_backup/${period}.json`) as string);

const DUMPED = [
  "ledger.jsonl",
  "positions.json",
  "prices/_status.json",
  "prices/ast_world.jsonl",
  "prices/symbols.json",
  "reference/ecb/eurofxref-hist.csv",
  "reference/ecb/manifest.json",
];

describe("the monthly dump (E4, plan §8)", () => {
  it("dumps the ledger byte for byte, its positions, the ECB with its manifest and prices/", async () => {
    const s3 = seeded();
    await backup(s3).run(["monthly_backup"]);
    const keys = s3.keys().filter((key) => key.startsWith(DUMP));
    expect(keys).toEqual(DUMPED.map((name) => `${DUMP}${name}`));
    expect(s3.text(`${DUMP}ledger.jsonl`)).toBe(s3.text("ledger/ledger.jsonl"));
    expect(s3.text(`${DUMP}reference/ecb/manifest.json`)).toBe(manifestOf(HISTORY));
    // Never previous/: its bytes are not the ones the manifest names in force.
    expect(keys.some((key) => key.includes("previous"))).toBe(false);
    // Every object written once, created, never over another.
    for (const key of keys) {
      expect(s3.versionsOf(key), key).toHaveLength(1);
      expect(s3.conditions.filter((condition) => condition.key === key)).toEqual([
        { key, ifNoneMatch: "*" },
      ]);
    }
    const positions = JSON.parse(s3.text(`${DUMP}positions.json`) as string);
    expect(positions).toMatchObject({
      positions_format: 1,
      as_of: "2026-10-01",
      ledger: { sha256: sha(s3.text("ledger/ledger.jsonl") as string) },
    });
    const record = recordOf(s3);
    expect(record).toMatchObject({
      state: "done",
      outcome: {
        code: "backup_done",
        counts: { written: 7, same: 0, kept: 0, prices: 3, ecb: 1, positions: 1, differs: 0 },
      },
    });
    expect(record.findings).toBeUndefined();
    // In the order of plan §8: the ledger, its positions, the ECB file then its manifest, prices/.
    const order = [0, 1, 5, 6, 2, 3, 4].map((index) => DUMPED[index] as string);
    expect(record.objects).toEqual(
      order.map((name) => ({
        key: `${DUMP}${name}`,
        sha256: sha(s3.text(`${DUMP}${name}`) as string),
      })),
    );
  });

  it("finishes a month cut between any two objects, never overwriting what it wrote (mutant 28)", async () => {
    const whole = seeded();
    await backup(whole).run(["monthly_backup"]);
    for (const cut of DUMPED) {
      const s3 = seeded();
      s3.beforePut = (key) => {
        if (key === `${DUMP}${cut}`) {
          s3.beforePut = undefined;
          throw new Error("cut");
        }
      };
      await backup(s3).run(["monthly_backup"]);
      expect(recordOf(s3).state, cut).toBe("failed");
      // The retry, the same day: the same dump, each object written once.
      await backup(s3, "2026-10-01T02:00:00Z").run(["monthly_backup"]);
      expect(recordOf(s3)).toMatchObject({ state: "done", attempts: 2 });
      for (const name of DUMPED) {
        const key = `${DUMP}${name}`;
        expect(s3.versionsOf(key), `${cut}: ${key}`).toHaveLength(1);
        if (name !== "positions.json") {
          expect(s3.text(key), `${cut}: ${key}`).toBe(whole.text(key));
        }
      }
    }
  });

  it("keeps what an earlier attempt of the month left, and values the positions of that ledger", async () => {
    const s3 = seeded();
    s3.beforePut = (key) => {
      if (key === `${DUMP}positions.json`) {
        s3.beforePut = undefined;
        throw new Error("cut");
      }
    };
    await backup(s3).run(["monthly_backup"]);
    const first = s3.text(`${DUMP}ledger.jsonl`) as string;
    // The ledger grows between the two attempts.
    s3.seed("ledger/ledger.jsonl", `${first}${first.split("\n")[0]}\n`);
    await backup(s3, "2026-10-01T02:00:00Z").run(["monthly_backup"]);
    expect(s3.text(`${DUMP}ledger.jsonl`)).toBe(first);
    const record = recordOf(s3);
    expect(record.objects[0]).toEqual({
      key: `${DUMP}ledger.jsonl`,
      sha256: sha(first),
      kept_from_earlier_attempt: true,
    });
    expect(JSON.parse(s3.text(`${DUMP}positions.json`) as string).ledger.sha256).toBe(sha(first));
    expect(record.outcome.counts).toMatchObject({ kept: 1, written: 6 });
  });

  it("refuses an object someone else wrote, writes nothing more and warns once (mutant 28)", async () => {
    const s3 = seeded();
    s3.seed(`${DUMP}ledger.jsonl`, "not the ledger\n");
    await backup(s3).run(["monthly_backup"]);
    expect(s3.text(`${DUMP}ledger.jsonl`)).toBe("not the ledger\n");
    expect(s3.keys().filter((key) => key.startsWith(DUMP))).toEqual([`${DUMP}ledger.jsonl`]);
    expect(recordOf(s3)).toMatchObject({
      state: "done",
      findings: [{ code: "backup_object_differs", subject: "backup", counts: { objects: 1 } }],
    });
    // The mail function says it, once.
    const ssm = new TestOnlyFakeSsm();
    ssm.set("/atlas/prod/mail/recipient", RECIPIENT);
    const mail = setupJobs({ env: MAIL_ENV, now: "2026-10-01T06:00:00Z", s3, ssm });
    await mail.run(["dispatch_findings"]);
    await mail.run(["dispatch_findings"]);
    expect(mail.ses.sent.map((sent) => sent.subject)).toEqual(["[Atlas] Aviso: volcado 2026-10"]);
  });

  it("never writes a manifest of the ECB over a file of another generation", async () => {
    const s3 = seeded();
    s3.beforePut = (key) => {
      if (key === `${DUMP}reference/ecb/manifest.json`) {
        s3.beforePut = undefined;
        throw new Error("cut");
      }
    };
    await backup(s3).run(["monthly_backup"]);
    // Between the two attempts, the ECB task activates a new history.
    const next = `${HISTORY}2026-10-01,1.2000,\n`;
    s3.seed("reference/ecb/eurofxref-hist.csv", next);
    s3.seed("reference/ecb/manifest.json", manifestOf(next));
    await backup(s3, "2026-10-01T02:00:00Z").run(["monthly_backup"]);
    expect(s3.text(`${DUMP}reference/ecb/eurofxref-hist.csv`)).toBe(HISTORY);
    expect(s3.text(`${DUMP}reference/ecb/manifest.json`)).toBeUndefined();
    expect(recordOf(s3)).toMatchObject({
      state: "done",
      findings: [{ code: "backup_ecb_inconsistent", subject: "backup" }],
    });
  });

  it("dumps without the ECB when there is none, or none that matches its manifest", async () => {
    const s3 = seeded();
    s3.seed("reference/ecb/eurofxref-hist.csv", "damaged");
    await backup(s3).run(["monthly_backup"]);
    expect(s3.keys().filter((key) => key.startsWith(`${DUMP}reference/`))).toEqual([]);
    expect(recordOf(s3)).toMatchObject({ state: "done", outcome: { counts: { ecb: 0 } } });
    expect(recordOf(s3).findings).toBeUndefined();
  });

  it("leaves out of prices/ a name that is not plain, and says a ledger it cannot value", async () => {
    const s3 = seeded();
    s3.seed("prices/a b.jsonl", "");
    s3.seed("ledger/ledger.jsonl", `${sentinelLedger()}{"not":"an event"}\n`);
    await backup(s3).run(["monthly_backup"]);
    expect(s3.keys().filter((key) => key.startsWith(DUMP))).toEqual(
      DUMPED.filter((name) => name !== "positions.json").map((name) => `${DUMP}${name}`),
    );
    expect(recordOf(s3)).toMatchObject({
      state: "done",
      outcome: { counts: { prices: 3, prices_skipped: 1, positions: 0 } },
      findings: [{ code: "backup_positions_missing", subject: "backup" }],
    });
  });

  it("fails with its code and dumps nothing without a ledger", async () => {
    const s3 = new TestOnlyFakeS3();
    await backup(s3).run(["monthly_backup"]);
    expect(records(s3)).toEqual(["jobs/backup/monthly_backup/2026-10.json"]);
    expect(recordOf(s3)).toMatchObject({ state: "failed", outcome: { code: "ledger_absent" } });
    expect(s3.keys().filter((key) => key.startsWith("backups/"))).toEqual([]);
  });
});
