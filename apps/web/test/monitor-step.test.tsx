// @vitest-environment happy-dom
//
// The step of the monitor (feature 020, M4): from 1800px one more step of
// type, a taller chart and more air; and the summary in 8+4, with the net
// worth beside the tax card and the evolution beside attention and the recent
// movements. Measured here on what the browser applies, and again in the
// real browser at 1799, 1800 and 2045×1141 (`medidas.json` of the captures).

import { afterEach, describe, expect, it } from "vitest";
import Resumen from "../src/routes/resumen/index.jsx";
import { summaryOrder } from "../src/view-models/summary-order.js";
import { show, until, withGoldenLedger } from "./helpers/render.jsx";
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
      "1.625rem",
      "2.75rem",
      "2rem",
      "1.25rem",
      "105rem",
      "15rem",
    ]);
    expect(after).toEqual([
      "1rem",
      "1.1875rem",
      "1.75rem",
      "3rem",
      "2.5rem",
      "1.5rem",
      "115rem",
      "clamp(15rem, 28vh, 22rem)",
    ]);
  });
});

describe("the summary in 8+4", () => {
  it("walks the cards in the order of reading of each width", () => {
    expect(summaryOrder(false)).toEqual(["worth", "attention", "moves", "fiscal", "evolution"]);
    expect(summaryOrder(true)).toEqual(["worth", "fiscal", "evolution", "attention", "moves"]);
  });

  it("puts the tax card beside the net worth and the evolution beside attention, from 1800px", async () => {
    withStyles(2045, 1141);
    const host = await show("/", Resumen);
    await until(() => host.querySelector(".summary-fiscal") !== null, "la tarjeta fiscal");
    const cards = [...host.querySelectorAll(".grid > .card")];
    const order = cards.map((card) =>
      [...card.classList].find((name) => name.startsWith("summary-")),
    );
    expect(order).toEqual([
      "summary-worth",
      "summary-fiscal",
      "summary-evolution",
      "summary-attention",
      "summary-moves",
    ]);
    const span = (name: string): string => applied(host.querySelector(`.${name}`), "grid-column");
    expect(span("summary-worth")).toBe("span 8");
    expect(span("summary-evolution")).toBe("span 8");
    expect(span("summary-fiscal")).toBe("span 4");
    expect(span("summary-attention")).toBe("span 4");
    expect(span("summary-moves")).toBe("span 4");
    expect(applied(host.querySelector(".summary-evolution"), "grid-row")).toBe("span 2");
    // The tax card does not jump to the start with the order of the phone.
    expect(applied(host.querySelector(".summary-fiscal"), "order")).toBe("0");
  });

  it("keeps the order of the phone below 1800px", async () => {
    withStyles(1799, 1141);
    const host = await show("/", Resumen);
    await until(() => host.querySelector(".summary-fiscal") !== null, "la tarjeta fiscal");
    const order = [...host.querySelectorAll(".grid > .card")].map((card) =>
      [...card.classList].find((name) => name.startsWith("summary-")),
    );
    expect(order).toEqual([
      "summary-worth",
      "summary-attention",
      "summary-moves",
      "summary-fiscal",
      "summary-evolution",
    ]);
    expect(applied(host.querySelector(".summary-worth"), "grid-column")).toBe("1 / -1");
  });
});
