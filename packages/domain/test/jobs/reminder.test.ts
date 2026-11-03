// The monthly reminder, from its facts to its text. Every figure is asserted with its exact value,
// and every sentinel of an amount, a quantity, a price, an asset name, an ISIN and an account is
// looked for in the mail with the switch off — also written with thousands and a decimal comma.

import { describe, expect, it } from "vitest";
import { reminderMail } from "../../src/jobs/mail/reminder.js";
import { type ReminderInput, reminderFacts } from "../../src/jobs/reminder.js";
import { Decimal } from "../../src/money/decimal.js";
import { Money } from "../../src/money/money.js";
import type { ContributionPlan, ContributionRow } from "../../src/projections/contribution.js";
import type { AssetClass } from "../../src/schema/events.js";

const eur = (text: string) => Money.parse(text, "EUR");

/** Sentinels: none of them may ever reach a mail with the switch off. */
const SENTINELS = {
  asset: "ASSET-SENTINEL-7Q",
  account: "ACC-SENTINEL-9Z",
  isin: "XS9999999991",
  name: "Fondo Centinela Global",
};

const row = (assetClass: AssetClass, allocation: string, value: string): ContributionRow => ({
  asset_id: `${SENTINELS.asset}-${assetClass}`,
  asset_class: assetClass,
  target_pct: Decimal.parse("25"),
  value_eur: eur(value),
  target_eur: eur("98765.43"),
  gap_eur: eur("4321.09"),
  allocation_eur: eur(allocation),
  value_after_eur: eur("87654.32"),
  weight_after_pct: Decimal.parse("33.3"),
});

const PLAN: ContributionPlan = {
  date: "2026-10-01",
  amount_eur: eur("1234.56"),
  amount_origin: "settings",
  bucket_budget_eur: eur("61.73"),
  core_amount_eur: eur("1172.83"),
  core_value_eur: eur("987654.32"),
  purchases_only_eur: eur("0"),
  rows: [
    row("equity", "700.00", "555555.55"),
    row("equity", "33.02", "44444.44"),
    row("fixed_income", "300.00", "333333.33"),
    row("gold", "139.81", "22222.22"),
  ],
  surplus_distributed: false,
  warnings: [
    {
      code: "weights_use_approximation",
      event_id: "",
      message: `approximated weights of ${SENTINELS.name} (${SENTINELS.isin}) worth 987654.32 EUR`,
      details: { assets: [SENTINELS.asset], account: SENTINELS.account },
    },
  ],
};

const INPUT: ReminderInput = {
  period: "2026-10",
  today: "2026-10-01",
  plan: PLAN,
  webSignIn: "2026-09-26",
  idleWarningDays: 150,
};

describe("the facts of the monthly reminder", () => {
  it("splits the core by class, of the core amount, rounded to one decimal", () => {
    const facts = reminderFacts(INPUT);
    expect(facts.contribution.ok).toBe(true);
    if (!facts.contribution.ok) {
      return;
    }
    expect(
      facts.contribution.classes.map((share) => [
        share.asset_class,
        share.pct.toString(),
        share.eur.amount.toString(),
      ]),
    ).toEqual([
      ["equity", "62.5", "733.02"],
      ["fixed_income", "25.6", "300"],
      ["gold", "11.9", "139.81"],
      ["crypto", "0", "0"],
    ]);
    expect(facts.contribution.total.amount.toString()).toBe("1234.56");
    expect(facts.contribution.core.amount.toString()).toBe("1172.83");
    expect(facts.contribution.bucket.amount.toString()).toBe("61.73");
    expect(facts.contribution.approximation).toBe(true);
    const plain = reminderFacts({ ...INPUT, plan: { ...PLAN, warnings: [] } });
    expect(plain.contribution.ok && plain.contribution.approximation).toBe(false);
  });

  it("says a core of nothing as nothing, never dividing by zero", () => {
    const facts = reminderFacts({
      ...INPUT,
      plan: { ...PLAN, core_amount_eur: eur("0"), rows: [] },
    });
    expect(
      facts.contribution.ok && facts.contribution.classes.map((share) => share.pct.toString()),
    ).toEqual(["0", "0", "0", "0"]);
  });

  it("carries the code of why the split could not be computed", () => {
    expect(
      reminderFacts({ ...INPUT, plan: { failure: "missing_manual_prices" } }).contribution,
    ).toEqual({
      ok: false,
      code: "missing_manual_prices",
    });
  });

  it("counts the days since the last sign-in of the web (R14)", () => {
    expect(reminderFacts(INPUT).signIn).toEqual({
      last: "2026-09-26",
      days: 5,
      webUnreadable: false,
    });
    const old = reminderFacts({ ...INPUT, webSignIn: "2026-05-04" });
    expect(old.signIn).toEqual({
      last: "2026-05-04",
      days: 150,
      deadline: "2026-11-04",
      webUnreadable: false,
    });
    const justBefore = reminderFacts({ ...INPUT, webSignIn: "2026-05-05" });
    expect(justBefore.signIn).toEqual({ last: "2026-05-05", days: 149, webUnreadable: false });
    expect(reminderFacts({ ...INPUT, webSignIn: undefined }).signIn).toEqual({
      webUnreadable: false,
    });
    expect(reminderFacts({ ...INPUT, webSignIn: "unreadable" }).signIn).toEqual({
      webUnreadable: true,
    });
  });
});

const occurrences = (text: string, needle: string): number => text.split(needle).length - 1;

describe("the text of the monthly reminder", () => {
  const facts = reminderFacts(INPUT);
  const off = reminderMail(facts, "off", "https://atlas.example.test");
  const on = reminderMail(facts, "on", "https://atlas.example.test");

  it("carries the period in an ASCII subject (R20; §8.1 P10)", () => {
    expect(off.subject).toBe("[Atlas] Recordatorio mensual 2026-10");
    expect(on.subject).toBe(off.subject);
    expect(/^[\x20-\x7e]+$/.test(off.subject)).toBe(true);
  });

  it("carries no amount, quantity, price, name, ISIN or account with the switch off (R1, R3)", () => {
    const text = `${off.subject}\n${off.body}`;
    for (const sentinel of [
      ...Object.values(SENTINELS),
      "987654",
      "987.654",
      "1234",
      "1.234",
      "1172",
      "733",
      "61,73",
      "139,81",
      "300,00",
      "€",
      "EUR",
      "44444",
      "555555",
    ]) {
      expect(occurrences(text, sentinel), sentinel).toBe(0);
    }
  });

  it("says exactly the percentages, counts and dates, with or without the switch", () => {
    expect(off.body).toBe(
      [
        "Aportación de octubre de 2026",
        "  Renta variable   62,5 %",
        "  Renta fija       25,6 %",
        "  Oro              11,9 %",
        "  Cripto            0,0 %",
        "  Cubo: presupuesto aparte, fuera del reparto.",
        "  Algún peso usa la aproximación por ETF de referencia (weights_use_approximation).",
        "",
        "Acceso",
        "  Último inicio de sesión en la web: hace 5 días (2026-09-26).",
        "",
        "Copia fuera de AWS",
        "  Haz la copia a tu disco: atlas backup --to <dir> --from-bucket --env prod",
        "",
        "Abre Atlas: https://atlas.example.test",
        "",
      ].join("\n"),
    );
  });

  it("adds exactly the euros of the split with the switch on, and never an account or an ISIN (R2)", () => {
    const added = on.body.split("\n").filter((line) => !off.body.split("\n").includes(line));
    expect(added).toEqual([
      "  Importes: total 1.234,56 €; núcleo 1.172,83 €; cubo 61,73 €.",
      "    Renta variable: 733,02 €",
      "    Renta fija: 300,00 €",
      "    Oro: 139,81 €",
      "    Cripto: 0,00 €",
    ]);
    for (const sentinel of Object.values(SENTINELS)) {
      expect(occurrences(on.body, sentinel), sentinel).toBe(0);
    }
  });

  it("still arrives, saying why, when the split or the sign-in could not be read (R8)", () => {
    const broken = reminderMail(
      reminderFacts({
        ...INPUT,
        plan: { failure: "ledger_unreadable" },
        webSignIn: "unreadable",
      }),
      "on",
      "https://atlas.example.test",
    );
    expect(broken.body).toContain(
      "  No se ha podido calcular el reparto (ledger_unreadable). Abre la aplicación para verlo.",
    );
    expect(broken.body).toContain("  No consta ningún inicio de sesión.");
    expect(broken.body).toContain("(web_sign_in_unreadable)");
    expect(broken.body).toContain("atlas backup --to <dir> --from-bucket --env prod");
    expect(broken.body).not.toContain("€");
  });

  it("says the approximation only when a weight uses it", () => {
    const plain = reminderMail(
      reminderFacts({ ...INPUT, plan: { ...PLAN, warnings: [] } }),
      "off",
      "https://atlas.example.test",
    );
    expect(plain.body).not.toContain("aproximación");
    expect(off.body).toContain("aproximación por ETF de referencia");
  });

  it("warns before the six months of an unused OAuth client, with the date (R14)", () => {
    const mail = reminderMail(
      reminderFacts({ ...INPUT, webSignIn: "2026-05-04" }),
      "off",
      "https://atlas.example.test",
    );
    expect(mail.body).toContain(
      "  Aviso: si nadie inicia sesión antes del 2026-11-04, Google puede borrar el cliente OAuth. Entra en la web para evitarlo.",
    );
  });
});
