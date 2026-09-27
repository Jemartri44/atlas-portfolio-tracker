// Feature 016, E1: the mail of a streak. A code the redaction does not know,
// or a subject that is not one of the producing tasks, is never sent: nothing
// of what a record says reaches a mail but through a closed list (review of
// PR #104, privacy B1, N1 and N2).

import { describe, expect, it } from "vitest";
import { NOTICE_CODES, noticeMail } from "../../src/jobs/mail/notice.js";

const FACTS = { since: "2026-10-02", period: "2026-10", outcome: "task_error" };

describe("the mail of a streak", () => {
  it("says which job failed, in which period, with which code and since when, in an ASCII subject", () => {
    expect(NOTICE_CODES).toEqual([
      "task_failed",
      "record_unreadable",
      "source_failing",
      "currency_unchecked",
      "thesis_horizon_exceeded",
      "ecb_update_rejected",
      "ecb_calendar_mismatch",
      "ecb_history_damaged",
      "ecb_history_rebuilt",
      "ecb_rebuilt_unverified",
    ]);
    expect(
      noticeMail({ code: "task_failed", subject: "monthly_backup" }, FACTS, "https://a.example"),
    ).toEqual({
      subject: "[Atlas] Aviso: tarea monthly_backup",
      body: [
        "Ha fallado el volcado mensual en el periodo 2026-10 (código task_error), desde el 2026-10-02.",
        "Se volverá a intentar en su próxima ejecución. Si el aviso se repite, mira el registro de la tarea en jobs/.",
        "",
        "Abre Atlas: https://a.example",
        "",
      ].join("\n"),
    });
  });

  it("says a code of the outcome it does not know as unknown, never as it came", () => {
    const mail = noticeMail(
      { code: "task_failed", subject: "ecb_update" },
      { ...FACTS, outcome: "ie00b4l5y983" },
      "https://a.example",
    );
    expect(mail?.body).toContain(
      "Ha fallado la descarga del histórico del BCE en el periodo 2026-10 (código desconocido)",
    );
    expect(mail?.body).not.toContain("ie00b4l5y983");
    const noPeriod = noticeMail(
      { code: "task_failed", subject: "ecb_update" },
      { since: "2026-10-02", period: "IE00B4L5Y983" },
      "https://a.example",
    );
    expect(noPeriod?.body).not.toContain("IE00B4L5Y983");
    expect(noPeriod?.body).toContain("en un periodo desconocido (código desconocido)");
  });

  it("says a record of a producer that cannot be read", () => {
    expect(
      noticeMail(
        { code: "record_unreadable", subject: "prices_update" },
        { since: "2026-10-02", period: "2026-10-02", outcome: "job_record_unreadable" },
        "https://a.example",
      ),
    ).toEqual({
      subject: "[Atlas] Aviso: registro de prices_update",
      body: [
        "El registro de prices_update (la descarga de los precios de cierre) del periodo 2026-10-02 no se puede leer (código job_record_unreadable), desde el 2026-10-02.",
        "La tarea no lo toma por libre; hay que mirarlo en jobs/ y repararlo.",
        "",
        "Abre Atlas: https://a.example",
        "",
      ].join("\n"),
    });
  });

  it("says a period or a code it cannot vouch for as unknown, in a record that cannot be read", () => {
    const mail = noticeMail(
      { code: "record_unreadable", subject: "ecb_update" },
      { since: "2026-10-02", period: "../x" },
      "https://a.example",
    );
    expect(mail?.body).toContain(
      "El registro de ecb_update (la descarga del histórico del BCE) de un periodo desconocido no se puede leer (código desconocido)",
    );
  });

  it("sends nothing for a subject that is not a producing task (B1, N1)", () => {
    for (const subject of [
      "some_task",
      "IE00B4L5Y983",
      "ast_xau",
      "monthly_reminder",
      "constructor",
      "__proto__",
      "toString",
    ]) {
      for (const code of ["task_failed", "record_unreadable"]) {
        expect(
          noticeMail({ code, subject }, FACTS, "https://a.example"),
          `${code} ${subject}`,
        ).toBeUndefined();
      }
    }
  });

  it("sends nothing for a code it does not know, not even one found through the prototype", () => {
    expect(
      noticeMail({ code: "mystery", subject: "ecb_update" }, FACTS, "https://a.example"),
    ).toBeUndefined();
    expect(
      noticeMail({ code: "toString", subject: "ecb_update" }, FACTS, "https://a.example"),
    ).toBeUndefined();
  });

  it("says the warnings of the ECB and the prices with their counts, and nothing else (016, E2)", () => {
    const mail = (code: string, subject: string, counts?: Record<string, number>) =>
      noticeMail(
        { code, subject },
        { ...FACTS, ...(counts === undefined ? {} : { counts }) },
        "https://a.example",
      );
    expect(
      mail("source_failing", "eodhd", { consecutive_failures: 4, threshold: 3 }),
    ).toMatchObject({
      subject: "[Atlas] Aviso: fuente de precios eodhd",
    });
    expect(
      mail("source_failing", "alpha_vantage", { consecutive_failures: 3, threshold: 3 })?.body,
    ).toContain("Alpha Vantage lleva 3 fallos seguidos (umbral 3), desde el 2026-10-02.");
    expect(mail("currency_unchecked", "eodhd", { assets: 2 })?.body).toContain(
      "2 correspondencias de EODHD no están contrastadas y la nube no las descarga",
    );
    expect(mail("thesis_horizon_exceeded", "bucket", { theses: 1 })?.body).toContain(
      "1 tesis del cubo han superado su horizonte previsto",
    );
    expect(mail("ecb_update_rejected", "ecb", { conflicts: 3 })?.body).toContain(
      "La descarga del histórico del BCE del periodo 2026-10 cambiaba 3 tipos ya publicados y no se ha activado",
    );
    expect(mail("ecb_calendar_mismatch", "ecb", { days: 2 })?.body).toContain(
      "2 días del histórico del BCE no cuadran con el calendario TARGET",
    );
    expect(mail("ecb_history_damaged", "ecb")?.body).toContain("no cuadra con su manifiesto");
    expect(mail("ecb_history_damaged", "ecb")?.body).toContain("Se reconstruirá entero");
    const refused = mail("ecb_history_damaged", "ecb", { conflicts: 3 })?.body;
    expect(refused).toContain("el ZIP oficial del BCE contradice 3 tipos");
    expect(refused).toContain("Hace falta intervenir");
    expect(mail("ecb_rebuilt_unverified", "ecb")).toMatchObject({
      subject: "[Atlas] Aviso: historico del BCE sin comparar",
      body: expect.stringContaining("sin poder compararlo con ninguna versión anterior"),
    });
    expect(mail("ecb_history_rebuilt", "ecb", { days: 7100 })).toMatchObject({
      subject: "[Atlas] Aviso: historico del BCE reconstruido",
      body: expect.stringContaining(
        "se ha reconstruido entero desde el ZIP oficial del BCE (7100 días), desde el 2026-10-02.",
      ),
    });
    for (const [code, subject] of [
      ["ecb_update_rejected", "ecb"],
      ["source_failing", "eodhd"],
      ["thesis_horizon_exceeded", "bucket"],
      ["currency_unchecked", "alpha_vantage"],
      ["ecb_calendar_mismatch", "ecb"],
      ["ecb_history_damaged", "ecb"],
      ["ecb_history_rebuilt", "ecb"],
      ["ecb_rebuilt_unverified", "ecb"],
    ] as const) {
      expect(/^[\x20-\x7e]+$/.test(mail(code, subject)?.subject as string), code).toBe(true);
    }
  });

  it("says a count it cannot vouch for as «algunos», never as it came", () => {
    const counts = { consecutive_failures: 1.5, threshold: -1, toString: 7 } as never;
    const body = noticeMail(
      { code: "source_failing", subject: "eodhd" },
      { since: "2026-10-02", counts },
      "https://a.example",
    )?.body;
    expect(body).toContain("EODHD lleva algunos fallos seguidos (umbral algunos)");
    expect(
      noticeMail(
        { code: "thesis_horizon_exceeded", subject: "bucket" },
        { since: "2026-10-02" },
        "https://a.example",
      )?.body,
    ).toContain("algunos tesis del cubo");
  });

  it("never sends a warning of the ECB or the prices about a subject outside its list", () => {
    for (const [code, subject] of [
      ["source_failing", "ast_xau"],
      ["source_failing", "ecb"],
      ["currency_unchecked", "IE00B4L5Y983"],
      ["thesis_horizon_exceeded", "01M1F21H78XT39A24MW2WFYK2S"],
      ["ecb_update_rejected", "USD"],
      ["ecb_calendar_mismatch", "eodhd"],
      ["ecb_history_damaged", "constructor"],
    ] as const) {
      expect(
        noticeMail({ code, subject }, FACTS, "https://a.example"),
        `${code} ${subject}`,
      ).toBeUndefined();
    }
  });
});
