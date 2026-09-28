// Review of PR #109, warnings and the fiscal path (decisions of 2026-09-28,
// questions §21): a warning of a period gone is closed `expired` and never
// sent (B1, N4); a passing failure to read the ledger or the ECB is retried
// the next day and never spent on a mail, and on the last day of the period it
// is said neutrally with its code (B2, N1); the income tax notes the rates as
// `atlas tax` does, with the history of the bucket (N2); and the fiscal
// warnings never read `prices/` (N3).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeLine, type LedgerEvent, projectLedger } from "@atlas/domain";
import { checkLedgerRates, DEFAULT_LOCAL_CONFIG, readEcbHistory } from "@atlas/domain/ecb";
import { taxYear } from "@atlas/domain/fiscal";
import { claimRecord, recordIn, serializeRunRecord } from "@atlas/domain/jobs";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeS3 } from "../../../packages/adapters/test/aws/test-only-fake-s3.js";
import { TestOnlyFakeSsm } from "../../../packages/adapters/test/aws/test-only-fake-ssm.js";
import { catalogue, LedgerBuilder } from "../../../packages/domain/test/ledger-builder.js";
import { MAIL_ENV, RECIPIENT, sentinelLedger, setupJobs } from "./harness.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/ecb");
const text = (events: readonly LedgerEvent[]) => `${events.map(encodeLine).join("\n")}\n`;

const run = (options: { jobs: string; now: string; s3: TestOnlyFakeS3 }) => {
  const ssm = new TestOnlyFakeSsm();
  ssm.set("/atlas/prod/mail/recipient", RECIPIENT);
  return setupJobs({
    env: { ...MAIL_ENV, ATLAS_JOBS: options.jobs },
    now: options.now,
    s3: options.s3,
    ssm,
  });
};

const bucket = (ledger: string) => {
  const s3 = new TestOnlyFakeS3();
  s3.seed("ledger/ledger.jsonl", ledger);
  return s3;
};

const record = (s3: TestOnlyFakeS3, task: string, period: string) =>
  JSON.parse(s3.text(`jobs/mail/${task}/${period}.json`) as string);

/** A record of a warning left `send_failed`: SES said no, the period stayed open. */
const refused = (task: "tax_return_ready" | "weekly_review", period: string, at: string) =>
  serializeRunRecord(
    recordIn(claimRecord(task, period, at), "send_failed", at, {
      outcome: { code: "mail_recipient_unavailable" },
    }),
  );

/** An account abroad worth more than 50.000 € by hand at 31 December: the 720 obliges. */
const abroad = (): string => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.deposit({ account_id: "acc_etf", amount: "70000", value_date: "2026-01-02" });
  b.buy({
    account_id: "acc_etf",
    asset_id: "ast_world",
    quantity: "600",
    unit_price: "100",
    trade_date: "2026-01-05",
  });
  b.valuation({
    account_id: "acc_etf",
    asset_id: "ast_world",
    date: "2026-12-31",
    quantity: "600",
    unit_value: "100",
  });
  return text(b.build());
};

const firstLines = (sent: readonly { body: string }[]) =>
  sent.map((mail) => mail.body.split("\n")[0]);

describe("a warning of a period gone is closed, never sent (avisos B1 and N4)", () => {
  it("sends the income tax once in January, closing the year before as expired", async () => {
    const s3 = bucket(sentinelLedger());
    s3.seed(
      "jobs/mail/tax_return_ready/2026.json",
      refused("tax_return_ready", "2026", "2026-01-05T07:00:00Z"),
    );
    const jobs = run({ jobs: "tax_return_ready", now: "2027-01-04T07:00:00Z", s3 });
    await jobs.run(["tax_return_ready"]);
    expect(jobs.ses.sent.map((mail) => mail.subject)).toEqual(["[Atlas] Renta 2026 lista"]);
    expect(record(s3, "tax_return_ready", "2026")).toMatchObject({
      state: "expired",
      outcome: { code: "job_expired" },
    });
    expect(record(s3, "tax_return_ready", "2027").state).toBe("done");
  });

  it("sends only this week's review, closing the week before as expired", async () => {
    const s3 = bucket(sentinelLedger({ deviation_threshold_pp: "5" }));
    s3.seed(
      "jobs/mail/weekly_review/2026-W40.json",
      refused("weekly_review", "2026-W40", "2026-09-28T06:00:00Z"),
    );
    const jobs = run({ jobs: "weekly_review", now: "2026-10-05T06:00:00Z", s3 });
    await jobs.run(["weekly_review"]);
    expect(jobs.ses.sent.map((mail) => mail.subject)).toEqual([
      "[Atlas] Revision semanal 2026-W41",
    ]);
    expect(record(s3, "weekly_review", "2026-W40").state).toBe("expired");
  });
});

describe("a passing failure is retried, and said on the last day (avisos B2 and N1)", () => {
  it("never spends the 720 of the year on a ledger it could not read today", async () => {
    const s3 = bucket(abroad());
    const jobs = run({ jobs: "informative_thresholds", now: "2027-01-01T07:00:00Z", s3 });
    s3.failNext(1);
    await jobs.run(["informative_thresholds"]);
    expect(jobs.ses.attempts).toEqual([]);
    expect(record(s3, "informative_thresholds", "2027")).toMatchObject({
      state: "failed",
      outcome: { code: "ledger_unavailable" },
    });
    jobs.setNow("2027-01-02T07:00:00Z");
    await jobs.run(["informative_thresholds"]);
    jobs.setNow("2027-01-03T07:00:00Z");
    await jobs.run(["informative_thresholds"]);
    expect(firstLines(jobs.ses.sent)).toEqual([
      "Revisa si te corresponde presentar el modelo 720 de 2026.",
    ]);
  });

  it("says, on 31 January, the 720 it could not check, neutrally and with its code", async () => {
    const s3 = bucket(abroad());
    const jobs = run({ jobs: "informative_thresholds", now: "2027-01-31T07:00:00Z", s3 });
    s3.failNext(1);
    await jobs.run(["informative_thresholds"]);
    expect(firstLines(jobs.ses.sent)).toEqual([
      "No se han podido comprobar los modelos 720 y 721 de 2026 (código ledger_unavailable). Abre la aplicación.",
    ]);
  });

  it("says invalid events only of a ledger with invalid events, and content that does not decode by its code", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.sell({
      account_id: "acc_etf",
      asset_id: "ast_world",
      quantity: "5",
      trade_date: "2026-05-04",
    });
    const invalid = run({
      jobs: "informative_thresholds",
      now: "2027-01-01T07:00:00Z",
      s3: bucket(text(b.build())),
    });
    await invalid.run(["informative_thresholds"]);
    expect(firstLines(invalid.ses.sent)).toEqual([
      "No se han podido comprobar los modelos 720 y 721 de 2026: el libro tiene eventos no válidos. Abre la aplicación.",
    ]);
    const content = run({
      jobs: "informative_thresholds",
      now: "2027-01-01T07:00:00Z",
      s3: bucket('{"not":"an event"}\n'),
    });
    await content.run(["informative_thresholds"]);
    expect(firstLines(content.ses.sent)).toEqual([
      "No se han podido comprobar los modelos 720 y 721 de 2026 (código invalid_envelope). Abre la aplicación.",
    ]);
  });

  it("never spends the income tax on a ledger or a history it could not read today", async () => {
    const s3 = bucket(sentinelLedger());
    const jobs = run({ jobs: "tax_return_ready", now: "2027-01-01T07:00:00Z", s3 });
    s3.failNext(1);
    await jobs.run(["tax_return_ready"]);
    expect(jobs.ses.attempts).toEqual([]);
    expect(record(s3, "tax_return_ready", "2027").outcome.code).toBe("ledger_unavailable");
    // The next day the history of the ECB cannot be read: tried again, nothing sent.
    const get = s3.get.bind(s3);
    s3.get = async (key) => {
      if (key.startsWith("reference/ecb/")) {
        throw Object.assign(new Error("down"), { name: "ServiceUnavailable" });
      }
      return get(key);
    };
    s3.seed("reference/ecb/manifest.json", "{}\n");
    jobs.setNow("2027-01-02T07:00:00Z");
    await jobs.run(["tax_return_ready"]);
    expect(jobs.ses.attempts).toEqual([]);
    expect(record(s3, "tax_return_ready", "2027").outcome.code).toBe("ecb_unavailable");
    s3.get = get;
    // No history at all is none, and then the tax goes without its notes.
    s3.deleteOutOfBand("reference/ecb/manifest.json");
    jobs.setNow("2027-01-03T07:00:00Z");
    await jobs.run(["tax_return_ready"]);
    expect(jobs.ses.sent.map((mail) => mail.subject)).toEqual(["[Atlas] Renta 2026 lista"]);
  });

  it("never counts the notes against a damaged history of the ECB: tried again, said on 31 January (R2-N1)", async () => {
    const s3 = bucket(sentinelLedger());
    const csv = readFileSync(join(fixtures, "eurofxref-hist.csv"), "utf8");
    // An update cut halfway: the file in force is not the one its manifest records.
    s3.seed("reference/ecb/eurofxref-hist.csv", `${csv}half written`);
    s3.seed(
      "reference/ecb/manifest.json",
      `${JSON.stringify({
        active: {
          file: "eurofxref-hist.csv",
          source: "zip",
          sha256: createHash("sha256").update(csv).digest("hex"),
          url: "https://ecb.example/zip",
          fetched_at: "2026-12-31T15:30:00.000Z",
        },
        rejected: [],
      })}\n`,
    );
    const jobs = run({ jobs: "tax_return_ready", now: "2027-01-02T07:00:00Z", s3 });
    await jobs.run(["tax_return_ready"]);
    expect(jobs.ses.attempts).toEqual([]);
    expect(record(s3, "tax_return_ready", "2027")).toMatchObject({
      state: "failed",
      outcome: { code: "ecb_unavailable" },
    });
    jobs.setNow("2027-01-31T07:00:00Z");
    await jobs.run(["tax_return_ready"]);
    expect(firstLines(jobs.ses.sent)).toEqual([
      "No se han podido preparar los datos de la Renta de 2026 (código ecb_unavailable).",
    ]);
  });

  it("never spends the week's review on closes it could not read, and says it on Sunday (round 2)", async () => {
    const s3 = bucket(sentinelLedger({ deviation_threshold_pp: "5" }));
    s3.seed("prices/ast_world.jsonl", "");
    const get = s3.get.bind(s3);
    s3.get = async (key) => {
      if (key.startsWith("prices/")) {
        throw Object.assign(new Error("down"), { name: "ServiceUnavailable" });
      }
      return get(key);
    };
    const jobs = run({ jobs: "weekly_review", now: "2026-10-05T06:00:00Z", s3 });
    await jobs.run(["weekly_review"]);
    expect(jobs.ses.attempts).toEqual([]);
    expect(record(s3, "weekly_review", "2026-W41")).toMatchObject({
      state: "failed",
      outcome: { code: "reference_unavailable" },
    });
    jobs.setNow("2026-10-11T06:00:00Z");
    await jobs.run(["weekly_review"]);
    expect(firstLines(jobs.ses.sent)).toEqual([
      "No se ha podido hacer la revisión de 2026-W41 (código reference_unavailable): no se ha podido leer lo que necesita en toda la semana.",
    ]);
  });

  it("says, on 31 January, the income tax it could not prepare, with its code", async () => {
    const s3 = bucket(sentinelLedger());
    const jobs = run({ jobs: "tax_return_ready", now: "2027-01-31T07:00:00Z", s3 });
    s3.failNext(1);
    await jobs.run(["tax_return_ready"]);
    expect(firstLines(jobs.ses.sent)).toEqual([
      "No se han podido preparar los datos de la Renta de 2026 (código ledger_unavailable).",
    ]);
  });

  it("never spends the week's review on a ledger it could not read, and says it on Sunday", async () => {
    const monday = bucket(sentinelLedger({ deviation_threshold_pp: "5" }));
    const jobs = run({ jobs: "weekly_review", now: "2026-10-05T06:00:00Z", s3: monday });
    monday.failNext(1);
    await jobs.run(["weekly_review"]);
    expect(jobs.ses.attempts).toEqual([]);
    expect(record(monday, "weekly_review", "2026-W41")).toMatchObject({
      state: "failed",
      outcome: { code: "ledger_unavailable" },
    });
    jobs.setNow("2026-10-11T06:00:00Z");
    monday.failNext(1);
    await jobs.run(["weekly_review"]);
    expect(jobs.ses.sent.map((mail) => [mail.subject, mail.body.split("\n")[0]])).toEqual([
      [
        "[Atlas] Revision semanal 2026-W41",
        "No se ha podido hacer la revisión de 2026-W41 (código ledger_unavailable): no se ha podido leer lo que necesita en toda la semana.",
      ],
    ]);
  });
});

describe("the income tax notes the rates as `atlas tax` does (avisos N2)", () => {
  it("counts the notes of the ECB check, with the history of the bucket", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({
      account_id: "acc_etf",
      amount: "500",
      currency: "USD",
      fx_rate: "1.25",
      value_date: "2026-03-02",
    });
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      quantity: "1",
      unit_price: "100",
      currency: "USD",
      fx_rate: "1.25",
      trade_date: "2026-03-02",
      fx_rate_date: "2026-03-02",
    });
    b.sell({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      quantity: "1",
      unit_price: "150",
      currency: "USD",
      fx_rate: "1.25",
      trade_date: "2026-03-27",
      fx_rate_date: "2026-03-27",
    });
    const events = b.build();
    const csv = readFileSync(join(fixtures, "eurofxref-hist.csv"), "utf8");
    const s3 = bucket(text(events));
    s3.seed("reference/ecb/eurofxref-hist.csv", csv);
    s3.seed(
      "reference/ecb/manifest.json",
      `${JSON.stringify({
        active: {
          file: "eurofxref-hist.csv",
          source: "zip",
          sha256: createHash("sha256").update(csv).digest("hex"),
          url: "https://ecb.example/zip",
          fetched_at: "2026-12-31T15:30:00.000Z",
        },
        rejected: [],
      })}\n`,
    );
    const today = "2027-01-04";
    const check = checkLedgerRates(
      readEcbHistory(csv, "zip"),
      projectLedger(events, { collectErrors: true }),
      events,
      DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days,
      today,
    );
    const findings =
      check.kind === "checked"
        ? check.findings.flatMap((finding) =>
            finding.event_ids.map((event_id) => ({ event_id, code: finding.code })),
          )
        : [];
    const noted = taxYear(events, 2026, { today, rateFindings: findings });
    const bare = taxYear(events, 2026, { today });
    // Not vacuous: the history adds notes.
    expect(noted.notes.length).toBeGreaterThan(bare.notes.length);
    const jobs = run({ jobs: "tax_return_ready", now: `${today}T07:00:00Z`, s3 });
    await jobs.run(["tax_return_ready"]);
    expect(firstLines(jobs.ses.sent)).toEqual([
      `Los datos de la Renta de 2026 están listos: ${noted.notes.length} notas y ${noted.doubtful.length} criterios en disputa.`,
    ]);
  });
});

describe("the warnings of January never read prices/ (avisos N3)", () => {
  it("reads the ledger and the history of the ECB, and not a close", async () => {
    for (const task of ["tax_return_ready", "informative_thresholds"]) {
      const s3 = bucket(abroad());
      s3.seed("prices/ast_world.jsonl", "");
      s3.seed("prices/symbols.json", '{"symbols_format":2,"assets":{}}\n');
      const jobs = run({ jobs: task, now: "2027-01-04T07:00:00Z", s3 });
      await jobs.run([task]);
      expect(jobs.ses.sent, task).toHaveLength(1);
      expect(
        s3.calls.filter((call) => call.includes("prices/")),
        task,
      ).toEqual([]);
    }
  });
});
