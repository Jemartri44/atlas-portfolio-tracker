// @vitest-environment happy-dom
//
// M9 (feature 020, E3): with the privacy mode on, the columns that would only
// hold masks fuse into one, "importes ocultos", and the percentages that stand
// for them go in front; with it off, the table is the one it always was. The
// decision of what is hidden stays with `Amount`: the fused cell is its cell.

import { describe, expect, it } from "vitest";
import { type DataColumn, rowColumns, tableColumns } from "../src/components/columns.js";
import { store } from "../src/ledger/state.js";
import Cartera from "../src/routes/cartera/index.jsx";
import Cubo from "../src/routes/cubo/index.jsx";
import { show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const col = (key: string, extra: Partial<DataColumn<string>> = {}): DataColumn<string> => ({
  key,
  header: key,
  cell: () => key,
  ...extra,
});

describe("the columns of a table with the mode in mind", () => {
  const columns = [
    col("name", { card: "title" }),
    col("fees", { amount: true, card: "sub" }),
    col("pct"),
    col("annual", { amount: "lead", card: "figure" }),
    col("share", { whenMasked: true, card: "figure" }),
    col("only-pct", { whenMasked: true }),
  ];

  it("is the table of always with the mode off: no percentage that stands for an amount", () => {
    expect(tableColumns(columns, false, "H").map((c) => c.key)).toEqual([
      "name",
      "fees",
      "pct",
      "annual",
    ]);
    expect(rowColumns(columns, false).map((c) => c.key)).toEqual(["name", "fees", "pct", "annual"]);
  });

  it("fuses the amounts after the rest, with the percentages in front, on the mode", () => {
    const fused = tableColumns(columns, true, "Importes ocultos");
    expect(fused.map((c) => c.key)).toEqual(["name", "pct", "share", "only-pct", "hidden"]);
    expect(fused.at(-1)?.header).toBe("Importes ocultos");
    // The fused cell is the cell of the lead column: still `Amount`'s mask.
    expect(fused.at(-1)?.cell("x")).toBe("annual");
  });

  it("keeps the first amount as the lead when none says so, and leaves a table without amounts", () => {
    const first = tableColumns([col("a", { amount: true }), col("b", { amount: true })], true, "H");
    expect(first.at(-1)?.cell("x")).toBe("a");
    const plain = [col("a"), col("b")];
    expect(tableColumns(plain, true, "H")).toEqual(plain);
  });

  it("gives a phone row the percentage in the slot of the amount it replaces", () => {
    // `annual` held the figure slot and `share` claims it; `fees`, in `sub`, stays.
    expect(rowColumns(columns, true).map((c) => c.key)).toEqual(["name", "fees", "pct", "share"]);
  });

  it("does not drop an amount for a percentage that claims no slot", () => {
    const loose = [col("a", { amount: true }), col("p", { whenMasked: true })];
    expect(rowColumns(loose, true).map((c) => c.key)).toEqual(["a"]);
  });
});

/** The headers of a table of the screen, by its accessible name. */
const headersOf = (host: HTMLElement, label: string): string[] =>
  [...host.querySelectorAll(`table[aria-label="${label}"] thead th`)].map((th) => text(th));

describe("the tables of the Cubo and of the Cartera", () => {
  it("fuses the theses into «Importes ocultos», with the percentages in front", async () => {
    store.setPrivacy(true);
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    const heads =
      headersOf(host, "Tesis abiertas").length > 0 ? "Tesis abiertas" : "Tesis del cubo";
    const shown = headersOf(host, heads);
    expect(shown.at(-1)).toBe("Importes ocultos");
    expect(shown).toContain("Resultado s/ invertido");
    expect(shown).toContain("Frente al índice (pp)");
    expect(shown).not.toContain("Invertido");
    expect(shown.indexOf("Frente al índice (pp)")).toBeLessThan(shown.indexOf("Importes ocultos"));
  });

  it("is the table of today with the mode off", async () => {
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    const label =
      headersOf(host, "Tesis abiertas").length > 0 ? "Tesis abiertas" : "Tesis del cubo";
    const shown = headersOf(host, label);
    expect(shown).toEqual([
      "Activo",
      "Tesis",
      "Estado",
      "Invertido",
      "Resultado",
      "Latente",
      "Frente al índice",
    ]);
  });

  it("fuses the open positions and puts the latent percentage before the amounts", async () => {
    store.setPrivacy(true);
    const host = await show("/cubo?fecha=2029-01-10", Cubo);
    const shown = headersOf(host, "Posiciones del cubo");
    expect(shown.at(-1)).toBe("Importes ocultos");
    expect(shown).toContain("Latente s/ coste");
    expect(shown).not.toContain("Cantidad");
    expect(shown).not.toContain("Coste medio");
  });

  it("fuses the costs: commissions and annual cost in one column of masks", async () => {
    store.setPrivacy(true);
    const host = await show("/cartera?fecha=2029-01-10", Cartera);
    const shown = headersOf(host, "Costes de la cartera principal");
    expect(shown).toEqual(["Activo", "Tipo de activo", "% invertido", "TER", "Importes ocultos"]);
    const cell = host.querySelector(
      'table[aria-label="Costes de la cartera principal"] tbody tr td:last-child',
    );
    expect(cell?.querySelector(".mask")).not.toBeNull();
  });

  it("is the costs table of today with the mode off", async () => {
    const host = await show("/cartera?fecha=2029-01-10", Cartera);
    expect(headersOf(host, "Costes de la cartera principal")).toEqual([
      "Activo",
      "Tipo de activo",
      "Comisiones pagadas",
      "% invertido",
      "TER",
      "Coste anual",
    ]);
  });

  it("shows the difference in points instead of the amount on a phone row", async () => {
    store.setPrivacy(true);
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    const row = host.querySelector('ul.rows[aria-label^="Tesis"] li .fig');
    expect(text(row)).toMatch(/pp$/);
    expect(row?.querySelector(".mask")).toBeNull();
  });
});
