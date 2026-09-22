// atlas tax <año>: a console that only formats what the domain computed
// (feature 009, decision (h)). The figures it prints are checked against
// hand-worked literals in tax-figures.test.ts; here, that every section is
// there, that nothing is lost in --json, and that the refusals speak Spanish.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXIT } from "../../src/context.js";
import { harness } from "../harness.js";

const goldenLines = (): string[] =>
  readFileSync(
    join(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/ledger"),
      "synthetic-v1.jsonl",
    ),
    "utf8",
  )
    .split("\n")
    .filter((line) => line !== "");

/** Standing in 2029: every window of 2027 is closed. */
const golden = () => harness({ lines: goldenLines(), instant: "2029-03-01T10:00:00.000Z" });

describe("atlas tax", () => {
  it("prints every section of the report, labelled as the fiscal total and as the base", async () => {
    const h = golden();
    expect(await h.exec(["tax", "2027"])).toBe(0);
    const text = h.text();
    expect(text).toContain("TOTAL FISCAL 2027 — núcleo y cubo agregados por contribuyente");
    expect(text).toContain("Esto es la BASE del ahorro, no la cuota");
    for (const heading of [
      "1. Ganancias y pérdidas patrimoniales",
      "2. Rendimientos del capital mobiliario",
      "3. Regla de recompra",
      "4. Compensación (art. 49 LIRPF)",
      "5. Saldos negativos pendientes",
      "BASE IMPONIBLE DEL AHORRO 2027",
      "6. Lo declarado en este ejercicio",
      "7. Retenciones a cuenta",
      "8. Doble imposición internacional",
      "9. Criterios dudosos",
      "10. Criterios firmes",
      "11. Lo que este motor no calcula",
      "Leyenda de criterios",
    ]) {
      expect(text).toContain(heading);
    }
    // The fund loss of 2027 bought again every month: deferred whole.
    expect(text).toMatch(/01MBP2GS80T8F1MS8PT0M7FK2R\s+ast_world\s+2027-01-06\s+-90\.82/);
    expect(text).toContain("núcleo");
    expect(text).toContain("cubo");
    expect(text).not.toContain("PROVISIONAL");
  });

  it("prints the settled criteria in a section of their own, zeros included", async () => {
    const h = golden();
    expect(await h.exec(["tax", "2027"])).toBe(0);
    const text = h.text();
    const part = (n: number): string =>
      text.slice(text.indexOf(`\n${n}. `), text.indexOf(`\n${n + 1}. `));
    // #18 is high certainty since 2026-09-23, so it left the doubtful section.
    // What it would move read the other way —nothing here— has to be visible
    // somewhere, and that somewhere is section 9.
    expect(part(9)).not.toContain("18 solo cuenta la recompra");
    expect(part(10)).toContain("18 solo cuenta la recompra");
    expect(part(10)).toContain("base 0.00");
    expect(part(10)).toContain("La lectura de estos no está en duda");
  });

  it("opens every transmission into its lots and their lineage with --lots", async () => {
    const h = golden();
    expect(await h.exec(["tax", "2027", "--lots"])).toBe(0);
    expect(h.text()).toContain("Lotes consumidos y su linaje");
    expect(h.text()).toContain(" ← ");
  });

  it("emits the whole report with --json, decimals as strings", async () => {
    const h = golden();
    expect(await h.exec(["tax", "2027", "--json"])).toBe(0);
    const json = JSON.parse(h.text()) as {
      year: number;
      scope: string;
      base_eur: string;
      doubtful: { criterion: string }[];
      notes: { code: string }[];
    };
    expect(json.year).toBe(2027);
    expect(json.scope).toBe("fiscal_total");
    expect(typeof json.base_eur).toBe("string");
    expect(json.doubtful.map((d) => d.criterion)).toContain("2:listed");
    expect(json.notes.map((n) => n.code)).toContain("tax_quota_not_computed");
  });

  it("takes --json in front of the command too, as the usage line puts it", async () => {
    // It used to read `tax` as the value of --json: «comando desconocido: 2027».
    const before = golden();
    expect(await before.exec(["--json", "tax", "2027"])).toBe(0);
    const after = golden();
    expect(await after.exec(["tax", "2027", "--json"])).toBe(0);
    expect(JSON.parse(before.text())).toEqual(JSON.parse(after.text()));
  });

  it("marks what is provisional when the window is still open", async () => {
    const h = harness({ lines: goldenLines(), instant: "2027-12-15T10:00:00.000Z" });
    expect(await h.exec(["tax", "2027"])).toBe(0);
    expect(h.text()).toContain("(provisional)");
    expect(h.text()).toContain("es PROVISIONAL");
  });

  it("shows the difference with the previous settings", async () => {
    const h = golden();
    expect(await h.exec(["tax", "2028"])).toBe(0);
    expect(h.text()).toContain("12. Diferencias con la configuración anterior");
  });

  it("refuses a year before the regime, and a word that is not a year", async () => {
    const h = golden();
    expect(await h.exec(["tax", "2017"])).toBe(EXIT.domain);
    expect(h.text()).toContain("régimen de compensación vigente desde 2018");
    expect(await h.exec(["tax", "dos mil"])).toBe(EXIT.usage);
    expect(await h.exec(["tax"])).toBe(EXIT.usage);
  });

  it("refuses a ledger with invalid events and lists them instead of a figure", async () => {
    const lines = goldenLines();
    const sale = JSON.parse(lines.find((line) => line.includes('"type":"sell"')) as string);
    // A sale of far more than is held: the loader accepts the line, the projection does not.
    const oversold = JSON.stringify({
      ...sale,
      id: "01ARYZ6S41TSV4RRFFQ69ZZZZZ",
      quantity: "99999",
    });
    const bad = harness({ lines: [...lines, oversold], instant: "2029-03-01T10:00:00.000Z" });
    expect(await bad.exec(["tax", "2027"])).toBe(EXIT.domain);
    expect(bad.text()).toContain("eventos inválidos");
    expect(bad.text()).toContain("01ARYZ6S41TSV4RRFFQ69ZZZZZ");
  });
});
