// @vitest-environment happy-dom
//
// The portfolio as composed in docs/design/system.md §7.5: the date in force
// beside the title, the gauge of each asset (D7) marked off target only where
// the domain said so, the targets alone on a partial total, and the
// contribution as a proposal with the transfer simulator at the foot of the
// weights (D6).

import { afterEach, describe, expect, it } from "vitest";
import { gaugeX } from "../src/routes/cartera/Gauge.jsx";
import Cartera from "../src/routes/cartera/index.jsx";
import { show, text, withGoldenLedger } from "./helpers/render.jsx";
import { withoutStyles, withStyles } from "./helpers/styles.js";

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
    const names = [...(costs?.querySelectorAll("table tbody tr td:first-child") ?? [])].map(text);
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

  it("keeps the weights and the contribution at their own height, side by side", async () => {
    withStyles(2045, 1141);
    const host = await show("/cartera", Cartera);
    const cards = [...host.querySelectorAll(".grid > .card.is-natural")];
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(getComputedStyle(card).alignSelf).toBe("start");
    }
  });

  it("puts the date in force beside the title", async () => {
    const host = await show("/cartera?fecha=2027-01-10", Cartera);
    expect(host.querySelector(".page-head .page-actions input#asof")).not.toBeNull();
  });

  it("marks off target only the assets the domain warned about", async () => {
    // 10/01/2027, threshold 5 pp: five of the six assets are further than that.
    const host = await show("/cartera?fecha=2027-01-10", Cartera);
    const weights = card(host, "Pesos frente al objetivo");
    expect(text(weights?.querySelector(".card-head"))).toContain("umbral ±5 pp");
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
    expect(contribution?.querySelectorAll(".kpis .kpi")).toHaveLength(3);
    expect(text(contribution)).toContain("nada este mes");
    expect(text(contribution?.querySelector(".note-line"))).toContain("Es una propuesta");
  });
});
