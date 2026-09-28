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
      "prices_file_unreadable",
      "ecb_update_rejected",
      "ecb_update_undone",
      "ecb_calendar_mismatch",
      "ecb_history_damaged",
      "ecb_history_rebuilt",
      "ecb_rebuilt_unverified",
      "backup_object_differs",
      "backup_ecb_inconsistent",
      "backup_positions_missing",
      "backup_ecb_missing",
      "integrity_errors",
      "restore_rehearsal_differs",
      "ledger_size_above_threshold",
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
    expect(mail("prices_file_unreadable", "prices", { files: 2 })).toMatchObject({
      subject: "[Atlas] Aviso: ficheros de precios ilegibles",
      body: expect.stringContaining("2 ficheros de cierres de la nube no se leen"),
    });
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
      ["prices_file_unreadable", "prices"],
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

describe("an update of the ECB cut and undone (review of PR #109, round 2, R2-N1)", () => {
  it("says it, and that the history in force is the one before", () => {
    expect(
      noticeMail(
        { code: "ecb_update_undone", subject: "ecb" },
        { since: "2026-10-02", period: "2026-10-02" },
        "https://a.example",
      ),
    ).toEqual({
      subject: "[Atlas] Aviso: historico del BCE deshecho",
      body: [
        "Una actualización del histórico del BCE se cortó a medias y se ha deshecho, desde el 2026-10-02: el fichero en vigor no cuadraba con su manifiesto y vuelve a ser el anterior.",
        "La descarga del día se ha vuelto a hacer después. Si se repite, mira reference/ecb/ con el procedimiento del histórico del BCE.",
        "",
        "Abre Atlas: https://a.example",
        "",
      ].join("\n"),
    });
  });
});

describe("the warnings of the dump and of the integrity (016, E4)", () => {
  const ORIGIN = "https://a.example";
  const body = (lines: string[]) => [...lines, "", `Abre Atlas: ${ORIGIN}`, ""].join("\n");

  it("says a dump that found other bytes, and one that could not keep the ECB with its manifest", () => {
    expect(
      noticeMail(
        { code: "backup_object_differs", subject: "backup" },
        { since: "2026-10-01", period: "2026-10", counts: { objects: 2 } },
        ORIGIN,
      ),
    ).toEqual({
      subject: "[Atlas] Aviso: volcado 2026-10",
      body: body([
        "El volcado mensual del periodo 2026-10 encontró 2 objetos ya escritos con otros bytes y no ha escrito nada más, desde el 2026-10-01.",
        "Un volcado no se sobrescribe nunca: mira backups/2026-10/ antes de nada, con el procedimiento de los avisos.",
      ]),
    });
    expect(
      noticeMail(
        { code: "backup_ecb_inconsistent", subject: "backup" },
        { since: "2026-10-01", period: "2026-10" },
        ORIGIN,
      ),
    ).toEqual({
      subject: "[Atlas] Aviso: volcado 2026-10",
      body: body([
        "El volcado mensual del periodo 2026-10 no ha guardado el manifiesto del histórico del BCE, desde el 2026-10-01: el fichero del volcado no es el que nombra el manifiesto en vigor.",
        "El resto del volcado está completo. El histórico del BCE se puede volver a bajar del BCE cuando haga falta.",
      ]),
    });
  });

  it("says a dump left without its positions, and why to look at the ledger", () => {
    expect(
      noticeMail(
        { code: "backup_positions_missing", subject: "backup" },
        { since: "2026-10-01", period: "2026-10" },
        ORIGIN,
      ),
    ).toEqual({
      subject: "[Atlas] Aviso: volcado 2026-10",
      body: body([
        "El volcado mensual del periodo 2026-10 no lleva positions.json, desde el 2026-10-01: el libro no se proyecta sin errores.",
        "El libro, los precios y el histórico del BCE sí están. Mira el libro con «atlas check --deep».",
      ]),
    });
  });

  it("says a dump without the history of the ECB (copias N1)", () => {
    expect(
      noticeMail(
        { code: "backup_ecb_missing", subject: "backup" },
        { since: "2026-10-01", period: "2026-10" },
        ORIGIN,
      ),
    ).toEqual({
      subject: "[Atlas] Aviso: volcado 2026-10",
      body: body([
        "El volcado mensual del periodo 2026-10 no lleva el histórico del BCE, desde el 2026-10-01: no había ninguno en vigor que cuadrara con su manifiesto.",
        "El resto del volcado está completo. Mira reference/ecb/ con el procedimiento del histórico del BCE.",
      ]),
    });
  });

  it("says the errors of the check and the differences of the rehearsal by code, from their lists", () => {
    expect(
      noticeMail(
        { code: "integrity_errors", subject: "integrity" },
        {
          since: "2026-10-01",
          period: "2026-Q4",
          counts: { errors: 4, lots_mismatch: 2, negative_position: 1, other: 1, ES00: 9 },
        },
        ORIGIN,
      ),
    ).toEqual({
      subject: "[Atlas] Aviso: integridad 2026-Q4",
      body: body([
        "La comprobación de integridad del periodo 2026-Q4 encontró 4 errores (lots_mismatch: 2, negative_position: 1, otros: 1), desde el 2026-10-01.",
        "Míralos en la consola con «atlas check --deep»; se rectifican con el libro, nunca restaurando.",
      ]),
    });
    expect(
      noticeMail(
        { code: "restore_rehearsal_differs", subject: "integrity" },
        {
          since: "2026-10-01",
          period: "2026-Q4",
          counts: { event_differs: 1, cash_differ: 1, x: 3 },
        },
        ORIGIN,
      ),
    ).toEqual({
      subject: "[Atlas] Aviso: integridad 2026-Q4",
      body: body([
        "El ensayo de restauración del periodo 2026-Q4 no reproduce el libro con el último volcado (event_differs: 1, cash_differ: 1), desde el 2026-10-01.",
        "No restaures desde ese volcado sin mirarlo antes: sigue el procedimiento de los avisos.",
      ]),
    });
  });

  it("says the size of the ledger and its threshold, in bytes", () => {
    expect(
      noticeMail(
        { code: "ledger_size_above_threshold", subject: "integrity" },
        {
          since: "2026-10-01",
          period: "2026-Q4",
          counts: { bytes: 1_100_000, threshold: 1_048_576 },
        },
        ORIGIN,
      ),
    ).toEqual({
      subject: "[Atlas] Aviso: integridad 2026-Q4",
      body: body([
        "El libro ocupa 1.100.000 bytes (umbral 1.048.576), desde el 2026-10-01.",
        "Revisa el plazo de expiración de las versiones no vigentes del bucket (ADR-0006).",
      ]),
    });
  });

  it("never says a period it cannot vouch for, and never a subject outside its list", () => {
    const mail = noticeMail(
      { code: "integrity_errors", subject: "integrity" },
      { since: "2026-10-01", period: "IE00B4L5Y983", counts: { errors: 1, other: 1 } },
      ORIGIN,
    );
    expect(mail?.subject).toBe("[Atlas] Aviso: integridad (periodo desconocido)");
    const dump = noticeMail(
      { code: "backup_object_differs", subject: "backup" },
      { since: "2026-10-01", period: "../x", counts: { objects: 1 } },
      ORIGIN,
    );
    expect(dump?.subject).toBe("[Atlas] Aviso: volcado (periodo desconocido)");
    expect(dump?.body).toContain("mira backups/<periodo>/ antes de nada");
    expect(dump?.body).not.toContain("../x");
    expect(
      noticeMail(
        { code: "ledger_size_above_threshold", subject: "integrity" },
        { since: "2026-10-01", period: "2026-Q4", counts: { bytes: 1.5, threshold: 1024 } },
        ORIGIN,
      )?.body,
    ).toContain("El libro ocupa algunos bytes (umbral 1.024)");
    expect(mail?.body).not.toContain("IE00B4L5Y983");
    for (const [code, subject] of [
      ["backup_object_differs", "integrity"],
      ["integrity_errors", "backup"],
      ["ledger_size_above_threshold", "ast_world"],
    ] as const) {
      expect(noticeMail({ code, subject }, { since: "2026-10-01" }, ORIGIN), code).toBeUndefined();
    }
  });

  it("says a failed dump with the code of why, when it is one of ours", () => {
    expect(
      noticeMail(
        { code: "task_failed", subject: "monthly_backup" },
        { since: "2026-10-01", period: "2026-10", outcome: "ledger_absent" },
        ORIGIN,
      )?.body,
    ).toContain("Ha fallado el volcado mensual en el periodo 2026-10 (código ledger_absent)");
  });
});
