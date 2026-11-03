// The monthly reminder end to end through the handler, with every double, and what each retry does.

import { describe, expect, it } from "vitest";
import {
  MAIL_ENV,
  ORIGIN,
  RECIPIENT,
  records,
  SENDER,
  SENTINELS,
  sentinelLedger,
  setupJobs,
} from "./harness.js";

const lastLog = (logs: readonly string[]) => JSON.parse(logs.at(-1) as string);

describe("the event of the schedule (R12, mutant 7)", () => {
  it("does nothing with an event it does not understand: no ledger read, no record, no mail", async () => {
    for (const event of [
      "{}",
      { event_format: 1, tasks: ["monthly_reminder"], extra: true },
      { event_format: 1, tasks: ["prices_update"] },
      { event_format: 1, tasks: ["weekly_review"] },
    ]) {
      const jobs = setupJobs();
      const calls = jobs.s3.calls.length;
      await jobs.handler(event);
      expect(jobs.s3.calls.length, JSON.stringify(event)).toBe(calls);
      expect(jobs.ses.attempts).toEqual([]);
      expect(lastLog(jobs.logs)).toMatchObject({
        level: "WARN",
        job: "event",
        code: "job_event_invalid",
      });
    }
  });
});

describe("the monthly reminder, end to end", () => {
  it("sends one mail from the configured sender to the recipient of SSM, and closes its period", async () => {
    const jobs = setupJobs();
    await jobs.run(["monthly_reminder"]);
    expect(jobs.ses.sent).toHaveLength(1);
    const [mail] = jobs.ses.sent;
    expect(mail?.from).toBe(SENDER);
    expect(mail?.to).toBe(RECIPIENT);
    expect(mail?.subject).toBe("[Atlas] Recordatorio de octubre de 2026");
    expect(mail?.body).toContain(`Abrir Atlas: ${ORIGIN}`);
    expect(mail?.body).toContain("- Renta variable");
    expect(mail?.body).not.toContain("No se ha podido calcular");
    expect(records(jobs.s3)).toEqual(["jobs/mail/monthly_reminder/2026-10.json"]);
    const record = JSON.parse(jobs.s3.text("jobs/mail/monthly_reminder/2026-10.json") as string);
    expect(record).toMatchObject({ state: "done", attempts: 1, outcome: { code: "mail_sent" } });
    expect(record.frequencies).toEqual({
      ignored: [{ code: "job_not_available", key: "reconciliation" }],
    });
    expect(lastLog(jobs.logs)).toMatchObject({
      level: "INFO",
      request_id: "req-1",
      job: "monthly_reminder",
      period: "2026-10",
      code: "mail_sent",
    });
  });

  it("carries no amount nor any asset or account with the switch off, and the euros with it on", async () => {
    const off = setupJobs();
    await off.run(["monthly_reminder"]);
    const body = off.ses.sent[0]?.body as string;
    for (const sentinel of [...SENTINELS.amounts, ...SENTINELS.ids, "€"]) {
      expect(body, sentinel).not.toContain(sentinel);
    }
    const on = setupJobs();
    on.ssm.set("/atlas/prod/mail/amounts", "on");
    await on.run(["monthly_reminder"]);
    expect(on.ses.sent[0]?.body).toContain("Total 1.234,56 €: núcleo");
    for (const sentinel of SENTINELS.ids) {
      expect(on.ses.sent[0]?.body, sentinel).not.toContain(sentinel);
    }
    for (const value of ["ON", "true", " on"]) {
      const odd = setupJobs();
      odd.ssm.set("/atlas/prod/mail/amounts", value);
      await odd.run(["monthly_reminder"]);
      expect(odd.ses.sent[0]?.body, value).not.toContain("€");
    }
  });

  it("goes out all the same with a ledger that does not load, saying why (R8)", async () => {
    for (const [ledger, code] of [
      ["", "ledger_absent"],
      ["not a ledger\n", "invalid_json"],
    ] as const) {
      const jobs = setupJobs({ ledger });
      await jobs.run(["monthly_reminder"]);
      expect(jobs.ses.sent, code).toHaveLength(1);
      expect(jobs.ses.sent[0]?.body).toContain(`No se ha podido calcular el reparto (${code})`);
    }
  });

  it("sends once per period, however many times it is woken (R10, mutant 5)", async () => {
    const jobs = setupJobs();
    await jobs.run(["monthly_reminder"]);
    jobs.setNow("2026-10-01T06:30:00Z");
    await jobs.run(["monthly_reminder"], "req-2");
    jobs.setNow("2026-10-17T06:00:00Z");
    await jobs.run(["monthly_reminder"], "req-3");
    expect(jobs.ses.sent).toHaveLength(1);
    expect(lastLog(jobs.logs)).toMatchObject({ code: "job_already_done", request_id: "req-3" });
  });

  it("is sent again after a cut between sending and closing: at least once (R10, §8.1 P10)", async () => {
    const jobs = setupJobs();
    // The mail goes; the write that closes the period fails: the process is as if cut there.
    const put = jobs.s3.putIfMatch.bind(jobs.s3);
    let cut = true;
    jobs.s3.putIfMatch = async (key, body, etag) => {
      if (
        cut &&
        key.startsWith("jobs/") &&
        new TextDecoder().decode(body).includes('"state":"done"')
      ) {
        cut = false;
        throw new Error("the Lambda died here");
      }
      return put(key, body, etag);
    };
    await jobs.run(["monthly_reminder"]);
    expect(jobs.ses.sent).toHaveLength(1);
    expect(
      JSON.parse(jobs.s3.text("jobs/mail/monthly_reminder/2026-10.json") as string).state,
    ).toBe("claimed");
    expect(lastLog(jobs.logs)).toMatchObject({
      level: "ERROR",
      code: "job_record_unavailable",
      error_name: "Error",
    });
    // A run within the longest run of the Lambda may still be going on: left alone.
    jobs.setNow("2026-10-01T06:14:59Z");
    await jobs.run(["monthly_reminder"], "req-2");
    expect(jobs.ses.sent).toHaveLength(1);
    expect(lastLog(jobs.logs)).toMatchObject({ level: "INFO", code: "job_in_progress" });
    jobs.setNow("2026-10-01T06:15:00Z");
    await jobs.run(["monthly_reminder"], "req-3");
    expect(jobs.ses.sent.map((mail) => mail.subject)).toEqual([
      "[Atlas] Recordatorio de octubre de 2026",
      "[Atlas] Recordatorio de octubre de 2026",
    ]);
    expect(
      JSON.parse(jobs.s3.text("jobs/mail/monthly_reminder/2026-10.json") as string),
    ).toMatchObject({
      state: "done",
      attempts: 2,
    });
  });

  it("is sent again after SES refused it or did not answer, and never taken as sent", async () => {
    const jobs = setupJobs();
    jobs.ses.refuseNext();
    await jobs.run(["monthly_reminder"]);
    expect(
      JSON.parse(jobs.s3.text("jobs/mail/monthly_reminder/2026-10.json") as string),
    ).toMatchObject({
      state: "send_failed",
      outcome: { code: "mail_send_failed" },
    });
    jobs.ses.loseNext();
    await jobs.run(["monthly_reminder"], "req-2");
    expect(
      JSON.parse(jobs.s3.text("jobs/mail/monthly_reminder/2026-10.json") as string).outcome.code,
    ).toBe("mail_send_unknown");
    await jobs.run(["monthly_reminder"], "req-3");
    expect(jobs.ses.sent).toHaveLength(1);
    expect(
      JSON.parse(jobs.s3.text("jobs/mail/monthly_reminder/2026-10.json") as string),
    ).toMatchObject({
      state: "done",
      attempts: 3,
    });
  });

  it("never sends a reminder valued with less when the closes cannot be read, and sends it once they can", async () => {
    const jobs = setupJobs();
    const get = jobs.s3.get.bind(jobs.s3);
    let down = true;
    jobs.s3.get = async (key) => {
      if (down && key.startsWith("prices/")) {
        throw Object.assign(new Error("down"), { name: "ServiceUnavailable" });
      }
      return get(key);
    };
    await jobs.run(["monthly_reminder"]);
    expect(jobs.ses.attempts).toEqual([]);
    expect(
      JSON.parse(jobs.s3.text("jobs/mail/monthly_reminder/2026-10.json") as string),
    ).toMatchObject({ state: "failed", outcome: { code: "reference_unavailable" } });
    expect(lastLog(jobs.logs)).toMatchObject({ level: "ERROR", code: "reference_unavailable" });
    // Still down the next day: still not sent, still open.
    jobs.setNow("2026-10-02T06:00:00Z");
    await jobs.run(["monthly_reminder"], "req-2");
    expect(jobs.ses.attempts).toEqual([]);
    down = false;
    jobs.setNow("2026-10-03T06:00:00Z");
    await jobs.run(["monthly_reminder"], "req-3");
    expect(jobs.ses.sent.map((mail) => mail.subject)).toEqual([
      "[Atlas] Recordatorio de octubre de 2026",
    ]);
    expect(
      JSON.parse(jobs.s3.text("jobs/mail/monthly_reminder/2026-10.json") as string),
    ).toMatchObject({ state: "done", attempts: 3, outcome: { code: "mail_sent" } });
  });

  it("finishes the reminder of the month before, left open, before the new one (Q6)", async () => {
    const jobs = setupJobs();
    jobs.ses.refuseNext();
    await jobs.run(["monthly_reminder"]);
    jobs.setNow("2026-11-01T07:00:00Z");
    await jobs.run(["monthly_reminder"], "req-2");
    expect(jobs.ses.sent.map((mail) => mail.subject)).toEqual([
      "[Atlas] Recordatorio de octubre de 2026",
      "[Atlas] Recordatorio de noviembre de 2026",
    ]);
  });

  it("takes its period from the day of Madrid, not of UTC (R11, mutant 6)", async () => {
    // 23:30 UTC of the 31st of October is 00:30 of the 1st of November in Madrid.
    const november = setupJobs({ now: "2026-10-31T23:30:00Z" });
    await november.run(["monthly_reminder"]);
    expect(november.ses.sent.map((mail) => mail.subject)).toEqual([
      "[Atlas] Recordatorio de noviembre de 2026",
    ]);
    // 22:30 UTC of the 31st of December is still the old year in Madrid.
    const december = setupJobs({ now: "2026-12-31T22:30:00Z" });
    await december.run(["monthly_reminder"]);
    expect(december.ses.sent.map((mail) => mail.subject)).toEqual([
      "[Atlas] Recordatorio de diciembre de 2026",
    ]);
  });

  it("never starts the reminder of a month nobody claimed: only today's", async () => {
    const jobs = setupJobs({ now: "2026-11-01T07:00:00Z" });
    await jobs.run(["monthly_reminder"]);
    expect(jobs.ses.sent.map((mail) => mail.subject)).toEqual([
      "[Atlas] Recordatorio de noviembre de 2026",
    ]);
  });

  it("cannot be switched off by the settings (R8, mutant 4)", async () => {
    const { sentinelLedger } = await import("./harness.js");
    const jobs = setupJobs({ ledger: sentinelLedger({ job_frequencies: { reminder: "off" } }) });
    await jobs.run(["monthly_reminder"]);
    expect(jobs.ses.sent).toHaveLength(1);
    expect(
      JSON.parse(jobs.s3.text("jobs/mail/monthly_reminder/2026-10.json") as string).frequencies,
    ).toEqual({
      ignored: [{ code: "job_frequency_invalid_value", key: "reminder" }],
    });
  });

  it("claims back its own record when it cannot read it, says so, and sends: the month is not lost (N4)", async () => {
    const jobs = setupJobs();
    jobs.s3.seed("jobs/mail/monthly_reminder/2026-10.json", "{}\n");
    await jobs.run(["monthly_reminder"]);
    expect(jobs.ses.sent.map((mail) => mail.subject)).toEqual([
      "[Atlas] Recordatorio de octubre de 2026",
    ]);
    expect(jobs.logs.map((line) => JSON.parse(line))).toContainEqual(
      expect.objectContaining({
        level: "ERROR",
        code: "job_record_unreadable",
        reason: "job_record_unreadable",
      }),
    );
    expect(
      JSON.parse(jobs.s3.text("jobs/mail/monthly_reminder/2026-10.json") as string),
    ).toMatchObject({
      state: "done",
      attempts: 1,
    });
  });

  it("never rewrites a record of a newer format, not even its own", async () => {
    const jobs = setupJobs();
    const newer = '{"run_format":2,"task":"monthly_reminder","period":"2026-10"}\n';
    jobs.s3.seed("jobs/mail/monthly_reminder/2026-10.json", newer);
    await jobs.run(["monthly_reminder"]);
    expect(jobs.ses.attempts).toEqual([]);
    expect(jobs.s3.text("jobs/mail/monthly_reminder/2026-10.json")).toBe(newer);
    expect(lastLog(jobs.logs)).toMatchObject({ level: "ERROR", reason: "job_record_newer_format" });
  });

  it("leaves alone a period claimed by a run still going on, and takes it up after (N3)", async () => {
    const jobs = setupJobs();
    jobs.s3.seed(
      "jobs/mail/monthly_reminder/2026-10.json",
      '{"run_format":1,"task":"monthly_reminder","period":"2026-10","state":"claimed","claimed_at":"2026-10-01T05:55:00Z","attempts":1}\n',
    );
    await jobs.run(["monthly_reminder"]);
    expect(jobs.ses.attempts).toEqual([]);
    expect(lastLog(jobs.logs)).toMatchObject({ code: "job_in_progress" });
    jobs.setNow("2026-10-01T06:10:00Z");
    await jobs.run(["monthly_reminder"], "req-2");
    expect(jobs.ses.sent).toHaveLength(1);
    expect(
      JSON.parse(jobs.s3.text("jobs/mail/monthly_reminder/2026-10.json") as string),
    ).toMatchObject({
      state: "done",
      attempts: 2,
    });
  });

  it("stops when another run claimed the period first, writing nothing more", async () => {
    const jobs = setupJobs();
    jobs.s3.beforePut = (key) => {
      if (key === "jobs/mail/monthly_reminder/2026-10.json") {
        jobs.s3.beforePut = undefined;
        jobs.s3.seed(key, "claimed by another run\n");
      }
    };
    await jobs.run(["monthly_reminder"]);
    expect(jobs.ses.attempts).toEqual([]);
    expect(lastLog(jobs.logs)).toMatchObject({ level: "WARN", code: "job_record_conflict" });
    expect(MAIL_ENV.ATLAS_JOBS).toContain("monthly_reminder");
  });
});

describe("what the reminder warns of, from the ledger", () => {
  const sold = (asset: string) =>
    sentinelLedger({}, (b) => {
      b.sell({
        account_id: asset === "ast_gold" ? "acc_etf" : "acc_fund",
        asset_id: asset,
        quantity: "1",
        unit_price: "1",
        trade_date: "2026-09-15",
      });
    });

  it("says a purchase of the plan in a repurchase window, with no name", async () => {
    const jobs = setupJobs({ ledger: sold("ast_world") });
    await jobs.run(["monthly_reminder"]);
    const [mail] = jobs.ses.sent;
    expect(mail?.body).toContain("Una compra del plan cae en la ventana de recompra.");
    expect(mail?.html).toContain("Una compra del plan cae en la ventana de recompra.");
    for (const sentinel of Object.values(SENTINELS).flat()) {
      expect(mail?.body, sentinel).not.toContain(sentinel);
      expect(mail?.html, sentinel).not.toContain(sentinel);
    }
  });

  it("says nothing of the window with no loss to protect", async () => {
    const jobs = setupJobs();
    await jobs.run(["monthly_reminder"]);
    expect(jobs.ses.sent[0]?.body).not.toContain("recompra");
  });

  it("says the second instalment in November when the first was paid, and not otherwise", async () => {
    const paid = (instalment: "first" | "single") =>
      sentinelLedger({}, (b) => {
        b.taxPayment({ tax_year: 2025, date: "2026-06-20", instalment });
      });
    const first = setupJobs({ ledger: paid("first"), now: "2026-11-01T07:00:00Z" });
    await first.run(["monthly_reminder"]);
    expect(first.ses.sent[0]?.body).toContain(
      "Renta de 2025: el segundo plazo vence el 05/11/2026.",
    );
    const single = setupJobs({ ledger: paid("single"), now: "2026-11-01T07:00:00Z" });
    await single.run(["monthly_reminder"]);
    expect(single.ses.sent[0]?.body).not.toContain("segundo plazo");
  });

  it("says the end of the campaign in June", async () => {
    const jobs = setupJobs({ now: "2026-06-01T06:00:00Z" });
    await jobs.run(["monthly_reminder"]);
    expect(jobs.ses.sent[0]?.body).toContain(
      "Renta de 2025: el plazo de presentación acaba el 30/06/2026. Para domiciliar el pago, el límite es el 25/06/2026.",
    );
  });
});
