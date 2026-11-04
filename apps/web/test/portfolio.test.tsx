// @vitest-environment happy-dom
//
// The portfolio as composed in docs/design/system.md §7.5: the date in force
// beside the title, the gauge of each asset marked off target only where the domain said so, the
// targets alone on a partial total, and the contribution as a proposal with the transfer simulator
// at the foot of the weights.

import { afterEach, describe, expect, it } from "vitest";
import { gaugeX } from "../src/routes/cartera/Gauge.jsx";
import Cartera from "../src/routes/cartera/index.jsx";
import { show, text, today, until, withGoldenLedger } from "./helpers/render.jsx";
import { applied, withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();

const card = (host: HTMLElement, title: string): Element | undefined =>
  [...host.querySelectorAll("section.card")].find(
    (section) => section.querySelector("h2")?.textContent === title,
  );

afterEach(() => withoutStyles());

describe("the portfolio", () => {
  it("lists no fund merged away in the costs, when it paid nothing", async () => {
    const host = await show("/cartera?fecha=2029-01-10", Cartera);
    const costs = [...host.querySelectorAll("section.card")].find(
      (card) => text(card.querySelector("h2")) === "Costes",
    );
    const seen = (): string[] =>
      [
        ...(costs?.querySelectorAll(
          'table[aria-label="Costes de la cartera principal"] tbody tr td:first-child',
        ) ?? []),
      ].map(text);
    // A list seen up to a point: three rows, and the button opens the rest in place.
    expect(seen()).toHaveLength(3);
    costs?.querySelector<HTMLButtonElement>(".peek-more")?.click();
    await until(() => seen().length > 3, "los costes de todos los activos");
    const names = seen();
    expect(names).toContain("Small Cap Index Fund B");
    expect(names).not.toContain("Small Cap Index Fund");
    expect(names).not.toContain("Global Bond Index Fund");
  });

  it("says «sin posición» for an asset with a target and nothing held, never «0,00 €»", async () => {
    const host = await show("/cartera?fecha=2026-09-19", Cartera);
    const row = [...host.querySelectorAll(".only-wide tbody tr")].find(
      (tr) => text(tr.querySelector("td")) === "Small Cap Index Fund",
    );
    expect(text(row)).toContain("sin posición");
    expect(text(row)).not.toContain("0,00");
  });

  it("marks a stale price in its row, not in a notice repeating the summary", async () => {
    const host = await show("/cartera?fecha=2029-01-10", Cartera);
    expect(text(host)).not.toContain("Hay precios caducados");
    const marks = [...host.querySelectorAll("table .stale-mark")];
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0]?.getAttribute("title")).toMatch(/^Precio caducado: \d+ días?$/);
  });

  it("gives the weighted TER a line with its own name", async () => {
    const host = await show("/cartera?fecha=2029-01-10", Cartera);
    const rows = [...host.querySelectorAll(".stat-row, .total-row")];
    const ter = rows.find((row) => text(row.querySelector(".label")).startsWith("TER medio"));
    expect(text(ter?.querySelector(".value"))).toMatch(/%/);
    // The commissions' total says the commissions, and only them.
    const fees = rows.find((row) =>
      text(row.querySelector(".label")).startsWith("Comisiones de operaciones"),
    );
    expect(text(fees?.querySelector(".value"))).not.toContain("TER");
  });

  it("goes in two columns of its own from the grid on, the costs across", async () => {
    withStyles(1440, 900);
    const host = await show("/cartera", Cartera);
    const titles = (at: number): string[] =>
      [...(host.querySelectorAll(".grid > .stack")[at]?.children ?? [])].map((card) =>
        text(card.querySelector("h2")),
      );
    expect(titles(0)).toEqual(["Pesos frente al objetivo", "Rentabilidad"]);
    expect(titles(1).map((title) => title.split(" ")[0])).toEqual([
      "Aportación",
      "Exposición",
      "Rebalancear",
    ]);
    const stacks = [...host.querySelectorAll(".grid > .stack")];
    expect(stacks.map((stack) => applied(stack, "grid-column"))).toEqual(["span 7", "span 5"]);
  });

  it("is one card with the next step before the first purchase, not on a date before it", async () => {
    today("2026-01-01");
    const empty = await show("/cartera", Cartera);
    expect(text(empty)).toContain("Todavía no hay nada en la cartera");
    expect(empty.querySelector('a[href="/"][role="button"]')).not.toBeNull();
    expect(empty.querySelector("section.card")).toBeNull();
    today("2029-01-10");
    const earlier = await show("/cartera?fecha=2026-01-01", Cartera);
    expect(text(earlier)).not.toContain("Todavía no hay nada en la cartera");
  });

  it("puts the date in force beside the title", async () => {
    const host = await show("/cartera?fecha=2027-01-10", Cartera);
    expect(host.querySelector(".page-head .page-actions input#asof")).not.toBeNull();
  });

  it("marks off target only the assets the domain warned about", async () => {
    // 10/01/2027, threshold 5 pp: five of the six assets are further than that.
    const host = await show("/cartera?fecha=2027-01-10", Cartera);
    const weights = card(host, "Pesos frente al objetivo");
    // The threshold is one of the figures at the head of the card.
    expect(text(weights?.querySelector(".kpis"))).toMatch(/Umbral\s*±5 pp/);
    expect(weights?.querySelectorAll("svg.gauge")).toHaveLength(6);
    expect(weights?.querySelectorAll("svg.gauge.is-off")).toHaveLength(5);
  });

  it("writes the deviations in neutral ink: off target is the gauge's to say", async () => {
    // A green +22,90 pp above the threshold said the opposite of what happens.
    const host = await show("/cartera?fecha=2027-01-10", Cartera);
    const weights = card(host, "Pesos frente al objetivo");
    expect(weights?.querySelectorAll(".positive, .negative")).toHaveLength(0);
  });

  it("keeps the dot of the gauge on its track", () => {
    expect(gaugeX("0", "5")).toBe(36);
    expect(gaugeX("5", "5")).toBe(60);
    expect(gaugeX("-5", "5")).toBe(12);
    expect(gaugeX("40", "5")).toBe(68);
    expect(gaugeX("1", "0")).toBe(36);
  });

  it("shows only the targets when the total is partial, and says what is missing", async () => {
    // 30/06/2027: Small Cap Index Fund is held without a price.
    const host = await show("/cartera?fecha=2027-06-30", Cartera);
    const weights = card(host, "Pesos frente al objetivo");
    expect(weights?.querySelector('table[aria-label="Pesos por tipo de activo"]')).toBeNull();
    expect(weights?.querySelectorAll(".class-row .weight")).toHaveLength(0);
    expect(text(weights?.querySelector(".classes"))).toContain("objetivo 55");
    expect(text(weights?.querySelector(".pending"))).toContain("Small Cap Index Fund");
  });

  it("offers the transfer simulator at the foot of the weights", async () => {
    const host = await show("/cartera?fecha=2027-01-10", Cartera);
    const weights = card(host, "Pesos frente al objetivo");
    const folds = [...(weights?.querySelectorAll(":scope > details > summary") ?? [])].map(text);
    expect(folds).toEqual(["Ver activo por activo", "Simular un traspaso entre fondos"]);
    expect(weights?.querySelector("#tr-from")).not.toBeNull();
  });

  it("says the contribution of the month is a proposal", async () => {
    const host = await show("/cartera?fecha=2027-01-10", Cartera);
    const contribution = card(host, "Aportación de enero");
    expect(text(contribution?.querySelector(".card-head"))).toContain("Propuesta");
    // The three figures of the month; the per-platform ones come below them.
    expect(contribution?.querySelector("dl.kpis")?.querySelectorAll(".kpi")).toHaveLength(3);
    expect(text(contribution)).toContain("nada este mes");
    expect(text(contribution?.querySelector(".note-line"))).toContain("Es una propuesta");
  });
});
