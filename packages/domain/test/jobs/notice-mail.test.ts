// Feature 016, E1: the mail of a streak. A code the redaction does not know,
// or a subject that is not one of the producing tasks, is never sent: nothing
// of what a record says reaches a mail but through a closed list (review of
// PR #104, privacy B1, N1 and N2).

import { describe, expect, it } from "vitest";
import { NOTICE_CODES, noticeMail } from "../../src/jobs/mail/notice.js";

const FACTS = { since: "2026-10-02", period: "2026-10", outcome: "task_error" };

describe("the mail of a streak", () => {
  it("says which job failed, in which period, with which code and since when, in an ASCII subject", () => {
    expect(NOTICE_CODES).toEqual(["task_failed", "record_unreadable"]);
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
});
