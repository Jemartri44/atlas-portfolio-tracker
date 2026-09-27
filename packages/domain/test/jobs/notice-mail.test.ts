// Feature 016, E1: the mail of a streak. A code the redaction does not know
// is never sent as free text.

import { describe, expect, it } from "vitest";
import { NOTICE_CODES, noticeMail } from "../../src/jobs/mail/notice.js";

describe("the mail of a streak", () => {
  it("says which job failed and since when, in an ASCII subject", () => {
    expect(NOTICE_CODES).toEqual(["task_failed"]);
    expect(
      noticeMail(
        { code: "task_failed", subject: "monthly_backup" },
        "2026-10-02",
        "https://a.example",
      ),
    ).toEqual({
      subject: "[Atlas] Aviso: tarea monthly_backup",
      body: [
        "Ha fallado el volcado mensual (desde el 2026-10-02).",
        "Se volverá a intentar en su próxima ejecución. Si el aviso se repite, mira el registro de la tarea en jobs/.",
        "",
        "Abre Atlas: https://a.example",
        "",
      ].join("\n"),
    });
    expect(
      noticeMail({ code: "task_failed", subject: "some_task" }, "2026-10-02", "https://a.example")
        ?.body,
    ).toContain("Ha fallado la tarea some_task (desde el 2026-10-02).");
  });

  it("sends nothing for a code it does not know, not even one found through the prototype", () => {
    expect(
      noticeMail({ code: "mystery", subject: "x" }, "2026-10-02", "https://a.example"),
    ).toBeUndefined();
    expect(
      noticeMail({ code: "toString", subject: "x" }, "2026-10-02", "https://a.example"),
    ).toBeUndefined();
  });
});
