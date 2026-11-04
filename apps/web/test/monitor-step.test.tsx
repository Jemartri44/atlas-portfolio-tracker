// @vitest-environment happy-dom
//
// The step of the monitor: from 1800px one more step of type, a taller chart and more air; and the
// order and the rows of the summary on a phone and from the grid's 12 columns. Measured here on
// what the browser applies.

import type { InformativeTodo } from "@atlas/domain/fiscal";
import { afterEach, describe, expect, it } from "vitest";
import { foldedLine } from "../src/routes/resumen/AllocationCard.jsx";
import { briefLines } from "../src/routes/resumen/fiscal-status.js";
import Resumen from "../src/routes/resumen/index.jsx";
import type { WeightsView } from "../src/view-models/core/index.js";
import { summaryOrder } from "../src/view-models/summary-order.js";
import { show, text, today, until, withGoldenLedger } from "./helpers/render.jsx";
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
    expect(summaryOrder({ wide: false, season: false }).top).toEqual([
      "worth",
      "month",
      "attention",
      "evolution",
      "allocation",
      "moves",
      "fiscal",
    ]);
    expect(summaryOrder({ wide: true, season: false })).toEqual({
      top: ["worth"],
      left: ["evolution", "moves"],
      right: ["attention", "month", "allocation", "fiscal"],
    });
    expect(summaryOrder({ wide: true, season: true })).toEqual({
      top: ["fiscal", "worth"],
      left: ["evolution", "moves"],
      right: ["attention", "month", "allocation"],
    });
  });

  it("gives the two columns of the grid their cards, each going its own way", async () => {
    withStyles(1440, 900);
    const host = await show("/", Resumen);
    await until(() => host.querySelector(".summary-fiscal") !== null, "la tarjeta fiscal");
    const column = (at: number): (string | undefined)[] =>
      [...(host.querySelectorAll(".grid > .stack")[at]?.children ?? [])].map((card) =>
        [...card.classList].find((name) => name.startsWith("summary-")),
      );
    expect(column(0)).toEqual(["summary-evolution", "summary-moves"]);
    expect(column(1)).toEqual([
      "summary-attention",
      "summary-month",
      "summary-allocation",
      "summary-fiscal",
    ]);
    const stacks = [...host.querySelectorAll(".grid > .stack")];
    expect(stacks.map((stack) => applied(stack, "grid-column"))).toEqual(["span 8", "span 4"]);
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

  it("keeps the tax card of a phone to the strip and its short lines", async () => {
    today("2029-05-10");
    withStyles(390, 844);
    const host = await show("/", Resumen);
    await until(() => host.querySelector(".fiscal-todo") !== null, "lo pendiente de la campaña");
    const card = text(host.querySelector(".summary-fiscal"));
    expect(card).toContain("hasta 30/06");
    expect(card).toContain("sin declarar");
    expect(card).not.toContain("constan como declarados");
    expect(
      applied(host.querySelector(".summary-fiscal .calendar-short .card-note"), "display"),
    ).toBe("none");
  });

  it("keeps the legend of the evolution in its fold on a phone, and out of it on a computer", async () => {
    withStyles(390, 844);
    const phone = await show("/", Resumen);
    await until(() => phone.querySelector(".summary-evolution") !== null, "la evolución");
    expect(phone.querySelector(".summary-evolution figcaption")).toBeNull();
    expect(text(phone.querySelector(".summary-evolution > .disclosure"))).toContain(
      "Cartera principal con su efectivo",
    );
    withStyles(1440, 900);
    const computer = await show("/", Resumen);
    await until(() => computer.querySelector(".summary-evolution") !== null, "la evolución");
    expect(computer.querySelector(".summary-evolution figcaption")).not.toBeNull();
  });

  it("says one line per model and reason on a phone, and every warning of the folded allocation", () => {
    const todo = (model: "720" | "721", category: string, reason: string) =>
      ({ model, year: 2028, category, reason }) as InformativeTodo;
    expect(
      briefLines([
        todo("720", "accounts", "undetermined"),
        todo("720", "securities", "undetermined"),
        todo("721", "crypto", "file"),
      ]),
    ).toEqual(["Modelo 720: faltan valoraciones", "Modelo 721: toca presentar"]);
    const view = (offTargetCount: number, belowMinimum: boolean) =>
      ({ partial: false, classes: [{ offTargetCount, belowMinimum }] }) as unknown as WeightsView;
    expect(foldedLine(view(4, true))).toBe("4 activos fuera de umbral · 1 tipo bajo el mínimo");
    expect(foldedLine(view(0, true))).toBe("1 tipo bajo el mínimo");
    expect(foldedLine(view(1, false))).toBe("1 activo fuera de umbral");
  });

  it("shows a few movements on a phone and leaves the rest to the list", async () => {
    withStyles(390, 844);
    const few = await show("/", Resumen);
    await until(() => few.querySelector(".summary-moves .days") !== null, "los movimientos");
    const rows = (host: HTMLElement): number => host.querySelectorAll(".summary-moves .day").length;
    const onPhone = rows(few);
    withStyles(1440, 900);
    const more = await show("/", Resumen);
    await until(() => more.querySelector(".summary-moves .days") !== null, "los movimientos");
    expect(onPhone).toBeLessThanOrEqual(3);
    expect(rows(more)).toBeGreaterThan(onPhone);
  });
});
