// How `atlas tax` says each section of the report, over the golden ledger and two small ledgers
// built through the console. The figures are the domain's (tax-figures.test.ts); what is pinned
// here is that each one reaches the text under its own label.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_SETTINGS, Events } from "../events.js";
import { BUY_GOLD, harness, SELL_GOLD, seed } from "../harness.js";
import { LEDGER_FIXTURES } from "../support/fixtures.js";

const goldenLines = (): string[] =>
  readFileSync(join(LEDGER_FIXTURES, "synthetic-v1.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line !== "");

/** The text between two headings, so a line is looked for in its own section only. */
const between = (text: string, from: string, to: string): string => {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start + from.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
};

describe("atlas tax over the golden ledger, 2027", () => {
  const report = async () => {
    const h = harness({ lines: goldenLines(), instant: "2029-03-01T10:00:00.000Z" });
    expect(await h.exec(["tax", "2027"])).toBe(0);
    return h.text();
  };

  it("lists what the repurchase rule defers, with its window and the purchases that caused it", async () => {
    const section = between(await report(), "Diferidas en 2027:", "Liberadas en 2027:");
    expect(section).toMatch(
      /evento\s+activo\s+fecha\s+diferido\s+unidades\s+ventana\s+adquisiciones/,
    );
    expect(section).toMatch(
      /01MBP2GS80T8F1MS8PT0M7FK2R\s+ast_world\s+2027-01-06\s+-90\.82\s+8\.7975 de 8\.7975\s+1y \[2026-01-06 … 2028-01-06\]\s+01MBEBAM80K3CE5XK9JN91KKCC 2027-01-03 4\.9233; 01ME3AEB80NNJANWN0AFEQT9NM 2027-02-05 3\.8742/,
    );
    expect(section).toMatch(
      /01N4F4Y58036KX1852YTTM0XD3\s+ast_delta\s+2027-11-10\s+-224\.75\s+25 de 25\s+2m \[2027-09-10 … 2028-01-10\]/,
    );
  });

  it("lists the losses released in the year, even when there are none", async () => {
    const section = between(await report(), "Liberadas en 2027:", "Pendientes a 31/12/2027:");
    expect(section).toMatch(/evento\s+pérdida de origen\s+importe\s+viajó/);
  });

  it("lists the deferred losses still pending at the end of the year, lot by lot", async () => {
    const section = between(await report(), "Pendientes a 31/12/2027:", "4. Compensación");
    expect(section).toMatch(/pérdida de origen\s+lote\s+activo\s+importe\s+viajó/);
    expect(section).toMatch(
      /01MBP2GS80T8F1MS8PT0M7FK2R\s+01MBEBAM80K3CE5XK9JN91KKCC#0\s+ast_world\s+-50\.83\s+no/,
    );
    expect(section).toMatch(
      /01N4F4Y58036KX1852YTTM0XD3\s+01N7P4TX80S2D9FXZN82KE9Z3A#0\s+ast_delta\s+-224\.75\s+no/,
    );
  });

  it("separates the dividends, the transmissions of art. 25.2 and the expenses of art. 26.1.a", async () => {
    const section = between(
      await report(),
      "2. Rendimientos del capital mobiliario",
      "3. Regla de recompra",
    );
    expect(section).toMatch(
      /Dividendos:[\s\S]*2027-04-15\s+01N94FZW78EQA3J41K0795WXF9\s+ast_alpha\s+2 USD/,
    );
    expect(section).toContain("Transmisiones (art. 25.2):");
    expect(section).toMatch(
      /2027-06-06\s+01MQTWHB78RC2FADH9B774BHS5\s+forced_sale:reverse_split\s+ast_gold\s+núcleo\s+acc_ibkr\s+0\.25/,
    );
    expect(section).toContain("Gastos de administración y depósito (art. 26.1.a):");
    expect(section).toMatch(/fecha\s+evento\s+tipo\s+importe\s+EUR\s+criterios/);
    expect(section).toMatch(/Saldo 0\.41\s*$/);
  });

  it("says no return is on record when none was filed", async () => {
    const section = between(await report(), "6. Lo declarado en este ejercicio", "7. Retenciones");
    expect(section).toContain("No consta ninguna Renta presentada de este ejercicio.");
    expect(section).toContain("atlas filed renta <año>");
  });
});

describe("atlas tax with a return filed", () => {
  /** A loss of 2.000,00 in 2027, which carries into 2028. */
  const filed = async () => {
    const b = new Events();
    b.settings(CLI_SETTINGS);
    b.account("acc_ib", "IE");
    b.asset("etf_a", "etf");
    b.deposit("acc_ib", "2027-01-04", "60000");
    b.buy("acc_ib", "etf_a", "2027-01-05", "500", "100");
    b.sell("acc_ib", "etf_a", "2027-09-01", "100", "80");
    const h = harness({ events: b.build(), instant: "2028-06-10T10:00:00.000Z", confirm: true });
    expect(
      await h.exec(["filed", "renta", "2027", "--receipt", "100-2027-ABCDEFGHIJKL", "--yes"]),
    ).toBe(0);
    h.reset();
    return h;
  };

  it("prints what was declared next to what the ledger says today", async () => {
    const h = await filed();
    expect(await h.exec(["tax", "2027"])).toBe(0);
    const section = between(h.text(), "6. Lo declarado en este ejercicio", "7. Retenciones");
    expect(section).toContain("Declarado el 2028-06-10 (justificante 100-2027-ABCDEFGHIJKL).");
    expect(section).toMatch(/cifra\s+declarado\s+calculado entonces\s+hoy\s+por qué difiere/);
    expect(section).toMatch(/savings_base\s+0\.00\s+0\.00\s+0\.00/);
    expect(section).toMatch(/pending:2027:capital_gain\s+-2000\.00\s+-2000\.00\s+-2000\.00/);
    expect(section).not.toContain("No consta");
  });

  it("anchors the carry-forward of the next year in what was declared", async () => {
    const h = await filed();
    expect(await h.exec(["tax", "2028"])).toBe(0);
    expect(h.text()).toContain(
      "Anclado en lo declarado en 2027: calculado 2027 -2000.00; declarado 2027 -2000.00.",
    );
  });
});

describe("atlas tax with foreign currency", () => {
  const gold = async (...extra: string[]) => {
    const h = harness({ events: seed(), instant: "2028-02-01T10:00:00.000Z" });
    expect(await h.exec(BUY_GOLD)).toBe(0);
    expect(await h.exec(SELL_GOLD)).toBe(0);
    h.reset();
    expect(await h.exec(["tax", "2026", ...extra])).toBe(0);
    return h.text();
  };

  it("lists the exchange differences of the currency disposed of", async () => {
    const text = await gold();
    expect(text).toContain("Diferencias de cambio de la divisa (criterio #4):");
    expect(text).toMatch(
      /2026-12-31\s+\S+\s+cubre divisa gastada sin tenerla\s+acc_etf\s+419 USD\s+386\.18\s+386\.10\s+0\.08\s+0\.00\s+0\.08/,
    );
    expect(text).not.toContain("Lotes de divisa consumidos");
  });

  it("opens the currency lots consumed with --lots", async () => {
    const text = await gold("--lots");
    expect(text).toContain("Lotes de divisa consumidos");
    expect(text).toMatch(/lote de divisa\s+entró\s+importe\s+coste EUR/);
    expect(text).toMatch(/\S+\$0\s+2026-12-30\s+419 USD\s+386\.18/);
  });
});
