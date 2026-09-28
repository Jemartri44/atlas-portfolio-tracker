// Feature 016, E4 (`contracts/mail.md` §2; §8.1 P9; Q10; questions §13): the
// mails of the periodic warnings. Plain text, an ASCII subject with its
// period, no amount with the switch off and only the euros of rule 17 with it
// on; the income tax never with a figure; the 720 and 721 in a neutral text.

import { describe, expect, it } from "vitest";
import type { InformativeFacts } from "../../src/jobs/informative.js";
import {
  informativeMail,
  taxReturnMail,
  weeklyReviewMail,
  weeklyReviewUnavailableMail,
} from "../../src/jobs/mail/periodic.js";
import type { ReviewFacts } from "../../src/jobs/review.js";
import { Decimal } from "../../src/money/decimal.js";
import { Money } from "../../src/money/money.js";

const ORIGIN = "https://a.example";
const eur = (value: string) => Money.parse(value, "EUR");

const REVIEW: ReviewFacts = {
  deviations: [
    {
      asset_class: "equity",
      deviation_pp: Decimal.parse("7.25"),
      threshold_pp: Decimal.parse("5"),
    },
    {
      asset_class: "fixed_income",
      deviation_pp: Decimal.parse("-6.2"),
      threshold_pp: Decimal.parse("5"),
    },
  ],
  rules: [
    { code: "bucket_contribution_exceeded", gross: eur("1234.56"), limit: eur("1000") },
    { code: "bucket_contribution_near_limit", gross: eur("850"), limit: eur("1000") },
    {
      code: "bucket_stop_loss_reached",
      loss_pct: Decimal.parse("23.4"),
      limit_pct: Decimal.parse("20"),
      loss: eur("234"),
      gross: eur("1000"),
    },
    {
      code: "bucket_weight_exceeded",
      weight_pct: Decimal.parse("12.3"),
      limit_pct: Decimal.parse("10"),
    },
  ],
  unmeasured: [
    { code: "core_weights_partial" },
    { code: "bucket_weight_not_evaluated", reason: "partial_net_worth" },
    { code: "bucket_stop_loss_not_evaluated", reason: "ES0000000001" },
  ],
};

const LINES = [
  "Pesos del núcleo",
  "  Renta variable: un activo está 7,3 puntos por encima de su objetivo (umbral 5,0).",
  "  Renta fija: un activo está 6,2 puntos por debajo de su objetivo (umbral 5,0).",
  "",
  "Cubo",
  "  La aportación bruta al cubo supera su tope (regla 17).",
  "  La aportación bruta al cubo se acerca a su tope (regla 17).",
  "  La pérdida acumulada del cubo es el 23,4 % de la aportación bruta (límite 20,0 %) (regla 17).",
  "  El cubo pesa el 12,3 % del patrimonio (máximo 10,0 %) (regla 18).",
  "",
  "Sin medir",
  "  Las desviaciones del núcleo: falta el precio de algún activo.",
  "  El peso del cubo sobre el patrimonio (regla 18): partial_net_worth.",
  "  La pérdida acumulada del cubo (regla 17): motivo desconocido.",
];

describe("the weekly review by mail (E4)", () => {
  it("says each threshold passed with percentages and points, and no amount with the switch off", () => {
    const mail = weeklyReviewMail(REVIEW, "off", "2026-W41", ORIGIN);
    expect(mail).toEqual({
      subject: "[Atlas] Revision semanal 2026-W41",
      body: [...LINES, "", `Abre Atlas: ${ORIGIN}`, ""].join("\n"),
    });
    for (const sentinel of ["1234", "1.234", "234,00", "850", "1.000", "€", "ES0000000001"]) {
      expect(mail.body, sentinel).not.toContain(sentinel);
    }
  });

  it("adds exactly the euros of rule 17 with the switch on, and nothing else", () => {
    const mail = weeklyReviewMail(REVIEW, "on", "2026-10", ORIGIN);
    expect(mail.subject).toBe("[Atlas] Revision mensual 2026-10");
    expect(mail.body).toBe(
      [
        ...LINES.slice(0, 6),
        "    Importes: aportación bruta 1.234,56 €; tope 1.000,00 €.",
        LINES[6],
        "    Importes: aportación bruta 850,00 €; tope 1.000,00 €.",
        LINES[7],
        "    Importes: pérdida 234,00 €; aportación bruta 1.000,00 €.",
        ...LINES.slice(8),
        "",
        `Abre Atlas: ${ORIGIN}`,
        "",
      ].join("\n"),
    );
  });

  it("leaves out a section with nothing in it", () => {
    const body = weeklyReviewMail(
      { deviations: [], rules: [REVIEW.rules[3] as ReviewFacts["rules"][number]], unmeasured: [] },
      "off",
      "2026-W41",
      ORIGIN,
    ).body;
    expect(body).toBe(["Cubo", LINES[8], "", `Abre Atlas: ${ORIGIN}`, ""].join("\n"));
  });
});

describe("a week it could not review by its Sunday (avisos B2)", () => {
  it("says so, with its code and no figure", () => {
    expect(weeklyReviewUnavailableMail("2026-W41", "ledger_unavailable", ORIGIN)).toEqual({
      subject: "[Atlas] Revision semanal 2026-W41",
      body: [
        "No se ha podido hacer la revisión de 2026-W41 (código ledger_unavailable): no se ha podido leer lo que necesita en toda la semana.",
        "Abre la aplicación para ver los pesos y las reglas del cubo.",
        "",
        `Abre Atlas: ${ORIGIN}`,
        "",
      ].join("\n"),
    });
    expect(weeklyReviewUnavailableMail("2026-10", "x y", ORIGIN).subject).toBe(
      "[Atlas] Revision mensual 2026-10",
    );
    expect(weeklyReviewUnavailableMail("2026-10", "x y", ORIGIN).body).toContain(
      "(código desconocido)",
    );
  });
});

describe("the income tax of January by mail (Q10: never a figure)", () => {
  it("says it is ready with its counts, and why when it could not be prepared", () => {
    expect(taxReturnMail({ ok: true, year: 2026, notes: 3, disputed: 2 }, ORIGIN)).toEqual({
      subject: "[Atlas] Renta 2026 lista",
      body: [
        "Los datos de la Renta de 2026 están listos: 3 notas y 2 criterios en disputa.",
        "Revísalos en la aplicación o con «atlas tax 2026» antes de presentar la declaración.",
        "",
        `Abre Atlas: ${ORIGIN}`,
        "",
      ].join("\n"),
    });
    expect(taxReturnMail({ ok: false, year: 2026, code: "tax_ledger_invalid" }, ORIGIN)).toEqual({
      subject: "[Atlas] Renta 2026",
      body: [
        "No se han podido preparar los datos de la Renta de 2026 (código tax_ledger_invalid).",
        "Abre la aplicación para ver qué falta.",
        "",
        `Abre Atlas: ${ORIGIN}`,
        "",
      ].join("\n"),
    });
    // A code it does not know is never written as it came.
    expect(
      taxReturnMail({ ok: false, year: 2026, code: "ES0000000001 fund" }, ORIGIN).body,
    ).toContain("(código desconocido)");
  });
});

describe("the 720 and the 721 by mail (questions §13: neutral)", () => {
  const facts = (models: InformativeFacts["models"], invalid = false): InformativeFacts => ({
    year: 2026,
    invalid,
    models,
  });

  it("says, neutrally and with its code, a ledger it could not check by the end of January (avisos B2)", () => {
    expect(
      informativeMail(
        { year: 2026, invalid: false, models: [], unavailable: "ledger_unavailable" },
        ORIGIN,
      ),
    ).toEqual({
      subject: "[Atlas] Modelos 720 y 721 de 2026",
      body: [
        "No se han podido comprobar los modelos 720 y 721 de 2026 (código ledger_unavailable). Abre la aplicación.",
        "",
        `Abre Atlas: ${ORIGIN}`,
        "",
      ].join("\n"),
    });
    expect(
      informativeMail({ year: 2026, invalid: false, models: [], unavailable: "ES00 x" }, ORIGIN)
        ?.body,
    ).toContain("(código desconocido)");
  });

  it("names the model to look at and nothing else: no threshold, no figure, no verdict", () => {
    expect(informativeMail(facts(["720", "721"]), ORIGIN)).toEqual({
      subject: "[Atlas] Modelos 720 y 721 de 2026",
      body: [
        "Revisa si te corresponde presentar el modelo 720 de 2026.",
        "Revisa si te corresponde presentar el modelo 721 de 2026.",
        "",
        `Abre Atlas: ${ORIGIN}`,
        "",
      ].join("\n"),
    });
    const one = informativeMail(facts(["721"]), ORIGIN);
    expect(one?.subject).toBe("[Atlas] Modelos 720 y 721 de 2026");
    expect(one?.body.split("\n")[0]).toBe(
      "Revisa si te corresponde presentar el modelo 721 de 2026.",
    );
    for (const mail of [informativeMail(facts(["720", "721"]), ORIGIN), one]) {
      expect(mail?.body).not.toMatch(/umbral|supera|€|\d{2}\.\d{3}/);
    }
  });

  it("says a ledger it could not check, and sends nothing when there is nothing to do", () => {
    expect(informativeMail(facts([], true), ORIGIN)?.body.split("\n")[0]).toBe(
      "No se han podido comprobar los modelos 720 y 721 de 2026: el libro tiene eventos no válidos. Abre la aplicación.",
    );
    expect(informativeMail(facts([]), ORIGIN)).toBeUndefined();
  });
});
