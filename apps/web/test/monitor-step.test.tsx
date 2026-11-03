// @vitest-environment happy-dom
//
// The step of the monitor: from 1800px one more step of type, a taller chart and more air; and the
// order and the rows of the summary on a phone and from the grid's 12 columns. Measured here on
// what the browser applies.

import { afterEach, describe, expect, it } from "vitest";
import Resumen from "../src/routes/resumen/index.jsx";
import { summaryOrder } from "../src/view-models/summary-order.js";
import { show, today, until, withGoldenLedger } from "./helpers/render.jsx";
import { applied, token, withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => withoutStyles());

describe("the step of the monitor", () => {
  it("changes the type, the chart, the gutter and the container exactly at 1800px", () => {
    withStyles(1799, 1141);
    const before = [
      "--text-md",
      "--text-lg",
      "--text-xl",
      "--text-display",
      "--gutter",
      "--grid-gap",
      "--content-max",
      "--chart-h",
    ].map(token);
    withoutStyles();
    withStyles(1800, 1141);
    const after = [
      "--text-md",
      "--text-lg",
      "--text-xl",
      "--text-display",
      "--gutter",
      "--grid-gap",
      "--content-max",
      "--chart-h",
    ].map(token);
    expect(before).toEqual([
      "0.9375rem",
      "1.0625rem",
      "2.125rem",
      "3.75rem",
      "2rem",
      "1.25rem",
      "105rem",
      "15rem",
    ]);
    expect(after).toEqual([
      "1rem",
      "1.1875rem",
      "2.25rem",
      "4rem",
      "2.5rem",
      "1.5rem",
      "115rem",
      "clamp(15rem, 28vh, 22rem)",
    ]);
  });
});

describe("the summary by device", () => {
  it("walks the cards in the order of reading of each width, the tax card first in the season", () => {
    expect(summaryOrder({ wide: false, season: false })).toEqual([
      "worth",
      "month",
      "attention",
      "evolution",
      "allocation",
      "moves",
      "fiscal",
    ]);
    expect(summaryOrder({ wide: true, season: false })).toEqual([
      "worth",
      "evolution",
      "month",
      "attention",
      "allocation",
      "moves",
      "fiscal",
    ]);
    expect(summaryOrder({ wide: true, season: true })[0]).toBe("fiscal");
  });

  it("lays the cards in rows from the grid's 12 columns, in the order of the markup", async () => {
    withStyles(1440, 900);
    const host = await show("/", Resumen);
    await until(() => host.querySelector(".summary-fiscal") !== null, "la tarjeta fiscal");
    const order = [...host.querySelectorAll(".grid > .card")].map((card) =>
      [...card.classList].find((name) => name.startsWith("summary-")),
    );
    expect(order).toEqual([
      "summary-worth",
      "summary-evolution",
      "summary-month",
      "summary-attention",
      "summary-allocation",
      "summary-moves",
      "summary-fiscal",
    ]);
    const span = (name: string): string => applied(host.querySelector(`.${name}`), "grid-column");
    expect(span("summary-evolution")).toBe("span 8");
    expect(span("summary-month")).toBe("span 4");
    expect(span("summary-attention")).toBe("span 7");
    expect(span("summary-allocation")).toBe("span 5");
    expect(span("summary-moves")).toBe("span 7");
    expect(span("summary-fiscal")).toBe("span 5");
  });

  it("lays the tax card across the first row in the season, never alone beside seven empty columns", async () => {
    today("2027-04-20");
    withStyles(1440, 900);
    const host = await show("/", Resumen);
    await until(() => host.querySelector(".summary-fiscal") !== null, "la tarjeta fiscal");
    const first = host.querySelector(".grid > .card");
    expect(first?.classList.contains("summary-fiscal")).toBe(true);
    expect(applied(first, "grid-column")).toBe("1 / -1");
  });

  it("puts this month and attention right after the net worth on a phone", async () => {
    withStyles(390, 844);
    const host = await show("/", Resumen);
    await until(() => host.querySelector(".summary-fiscal") !== null, "la tarjeta fiscal");
    const order = [...host.querySelectorAll(".grid > .card")].map((card) =>
      [...card.classList].find((name) => name.startsWith("summary-")),
    );
    expect(order.slice(0, 3)).toEqual(["summary-worth", "summary-month", "summary-attention"]);
  });
});
