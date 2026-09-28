// Feature 016, E4 (plan §10.4; Q10; questions §13; mutants 31 and 32): the
// periodic warnings of the mail function end to end — the weekly review, the
// income tax of January and the thresholds of the 720 and 721. Each only when
// there is something to do, at most once, and never an amount with the switch
// off; the income tax never with one; the 720 never with a close.

import { encodeLine } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeS3 } from "../../../packages/adapters/test/aws/test-only-fake-s3.js";
import { TestOnlyFakeSsm } from "../../../packages/adapters/test/aws/test-only-fake-ssm.js";
import { catalogue, LedgerBuilder } from "../../../packages/domain/test/ledger-builder.js";
import { MAIL_ENV, RECIPIENT, SENTINELS, sentinelLedger, setupJobs } from "./harness.js";

const env = (jobs: string) => ({ ...MAIL_ENV, ATLAS_JOBS: jobs });

/** Monday 5 October 2026, 08:00 in Madrid: week 41. */
const MONDAY = "2026-10-05T06:00:00Z";
/** The first of January of 2027, 08:00 in Madrid. */
const JANUARY = "2027-01-01T07:00:00Z";

const jobs = (options: {
  jobs: string;
  now: string;
  ledger?: string;
  s3?: TestOnlyFakeS3;
  amounts?: string;
}) => {
  const s3 = options.s3 ?? new TestOnlyFakeS3();
  if (options.s3 === undefined) {
    s3.seed("ledger/ledger.jsonl", options.ledger ?? sentinelLedger());
  }
  const ssm = new TestOnlyFakeSsm();
  ssm.set("/atlas/prod/mail/recipient", RECIPIENT);
  if (options.amounts !== undefined) {
    ssm.set("/atlas/prod/mail/amounts", options.amounts);
  }
  return setupJobs({ env: env(options.jobs), now: options.now, s3, ssm });
};

const record = (s3: TestOnlyFakeS3, task: string, period: string) =>
  JSON.parse(s3.text(`jobs/mail/${task}/${period}.json`) as string);

describe("the weekly review (E4)", () => {
  it("sends nothing when no threshold is passed (mutant 32)", async () => {
    const run = jobs({ jobs: "weekly_review", now: MONDAY });
    await run.run(["weekly_review"]);
    expect(run.ses.attempts).toEqual([]);
    expect(record(run.s3, "weekly_review", "2026-W41")).toMatchObject({
      state: "done",
      outcome: { code: "review_nothing_to_do", counts: { deviations: 0, rules: 0 } },
    });
  });

  it("says each deviation by its class, with no amount nor asset with the switch off, once a week", async () => {
    const run = jobs({
      jobs: "weekly_review",
      now: MONDAY,
      ledger: sentinelLedger({ deviation_threshold_pp: "5" }),
    });
    await run.run(["weekly_review"]);
    await run.run(["weekly_review"]);
    expect(run.ses.sent).toHaveLength(1);
    const [mail] = run.ses.sent;
    expect(mail?.subject).toBe("[Atlas] Revision semanal 2026-W41");
    expect(mail?.body.split("\n").slice(0, 4)).toEqual([
      "Pesos del núcleo",
      "  Renta variable: un activo está 28,8 puntos por debajo de su objetivo (umbral 5,0).",
      "  Renta fija: un activo está 38,3 puntos por encima de su objetivo (umbral 5,0).",
      "  Oro: un activo está 9,5 puntos por debajo de su objetivo (umbral 5,0).",
    ]);
    for (const sentinel of [...SENTINELS.amounts, ...SENTINELS.ids, "€"]) {
      expect(mail?.body, sentinel).not.toContain(sentinel);
    }
    expect(record(run.s3, "weekly_review", "2026-W41")).toMatchObject({
      state: "done",
      outcome: { code: "mail_sent", counts: { deviations: 3, rules: 0, amounts: 0 } },
    });
  });

  it("never sends it twice: a cut after `sending` is closed as unknown", async () => {
    const run = jobs({
      jobs: "weekly_review",
      now: MONDAY,
      ledger: sentinelLedger({ deviation_threshold_pp: "5" }),
    });
    run.ses.loseAfterSendingNext();
    await run.run(["weekly_review"]);
    run.setNow("2026-10-06T06:00:00Z");
    await run.run(["weekly_review"]);
    expect(run.ses.attempts).toHaveLength(1);
    expect(record(run.s3, "weekly_review", "2026-W41").state).toBe("send_unknown");
  });
});

describe("the income tax of January (Q10)", () => {
  it("says the year before is ready, with no figure even with the switch on", async () => {
    const run = jobs({ jobs: "tax_return_ready", now: JANUARY, amounts: "on" });
    await run.run(["tax_return_ready"]);
    expect(run.ses.sent).toHaveLength(1);
    const [mail] = run.ses.sent;
    expect(mail?.subject).toBe("[Atlas] Renta 2026 lista");
    expect(mail?.body.split("\n")[0]).toMatch(
      /^Los datos de la Renta de 2026 están listos: \d+ notas y \d+ criterios en disputa\.$/,
    );
    for (const sentinel of [...SENTINELS.amounts, ...SENTINELS.ids, "€"]) {
      expect(mail?.body, sentinel).not.toContain(sentinel);
    }
    // Once in January.
    run.setNow("2027-01-02T07:00:00Z");
    await run.run(["tax_return_ready"]);
    expect(run.ses.sent).toHaveLength(1);
  });

  it("only in January", async () => {
    const run = jobs({ jobs: "tax_return_ready", now: "2027-02-01T07:00:00Z" });
    await run.run(["tax_return_ready"]);
    expect(run.ses.attempts).toEqual([]);
    expect(run.s3.keys().filter((key) => key.startsWith("jobs/"))).toEqual([]);
  });

  it("says why the data could not be prepared", async () => {
    const run = jobs({ jobs: "tax_return_ready", now: JANUARY, ledger: '{"not":"an event"}\n' });
    await run.run(["tax_return_ready"]);
    expect(run.ses.sent.map((mail) => mail.body.split("\n")[0])).toEqual([
      "No se han podido preparar los datos de la Renta de 2026 (código invalid_envelope).",
    ]);
  });
});

describe("the thresholds of the 720 and the 721 (mutant 31)", () => {
  /** An account abroad whose valuation by hand at 31 December is below every threshold. */
  const abroad = () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_etf", amount: "2000", value_date: "2026-01-02" });
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "100",
      trade_date: "2026-01-05",
    });
    b.valuation({
      account_id: "acc_etf",
      asset_id: "ast_world",
      date: "2026-12-31",
      quantity: "10",
      unit_value: "100",
    });
    return b;
  };

  it("never reads a close: closes of the cloud that would pass the threshold send nothing", async () => {
    const s3 = new TestOnlyFakeS3();
    s3.seed("ledger/ledger.jsonl", `${abroad().build().map(encodeLine).join("\n")}\n`);
    // Automatic closes after the valuation by hand, far above 50.000 €.
    s3.seed(
      "prices/ast_world.jsonl",
      `${JSON.stringify({ schema_version: 1, date: "2026-12-31", close: "99999", currency: "EUR", source: "eodhd", fetched_at: "2027-01-01T05:00:00.000Z" })}\n`,
    );
    s3.seed(
      "prices/symbols.json",
      `${JSON.stringify({
        symbols_format: 2,
        assets: {
          ast_world: {
            eodhd: "WORLD.XETRA",
            currencies: { eodhd: "EUR" },
            confirmed_at: "2026-09-01T00:00:00.000Z",
            currency_check: { eodhd: { at: "2026-09-01T00:00:00.000Z" } },
          },
        },
      })}\n`,
    );
    const run = jobs({ jobs: "informative_thresholds", now: JANUARY, s3, amounts: "on" });
    await run.run(["informative_thresholds"]);
    expect(run.ses.attempts).toEqual([]);
    expect(record(s3, "informative_thresholds", "2027")).toMatchObject({
      state: "done",
      outcome: { code: "informative_nothing_to_do", counts: { models: 0, invalid: 0 } },
    });
  });

  it("says, neutrally, the model to look at when the valuations by hand oblige", async () => {
    const b = abroad();
    b.deposit({ account_id: "acc_etf", amount: "60000", value_date: "2026-02-02" });
    const s3 = new TestOnlyFakeS3();
    s3.seed("ledger/ledger.jsonl", `${b.build().map(encodeLine).join("\n")}\n`);
    const run = jobs({ jobs: "informative_thresholds", now: JANUARY, s3, amounts: "on" });
    await run.run(["informative_thresholds"]);
    expect(run.ses.sent).toEqual([
      expect.objectContaining({
        subject: "[Atlas] Modelos 720 y 721 de 2026",
        body: [
          "Revisa si te corresponde presentar el modelo 720 de 2026.",
          "",
          "Abre Atlas: https://atlas.example.test",
          "",
        ].join("\n"),
      }),
    ]);
  });
});
