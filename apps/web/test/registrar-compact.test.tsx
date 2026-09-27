// @vitest-environment happy-dom
//
// Registrar in one screenful of the phone (feature 020, M11): the seven tiles
// of the day to day in three columns of 64px, the word alone; and the short
// fields in pairs — the two dates, quantity and price — only where both fit.
// Measured in Chromium at 360px a date needs 169px and half the row gives it
// 158, so the pair starts at 384px. The first screenful itself, «Otros
// registros» included, is measured in the real browser (`medidas.json`).

import { afterEach, describe, expect, it } from "vitest";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import Registrar from "../src/routes/registrar/index.jsx";
import { show, withGoldenLedger } from "./helpers/render.jsx";
import { applied, token, withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => withoutStyles());

describe("the tiles of the day to day", () => {
  it("are three columns of 64px, the word alone, on a phone", async () => {
    withStyles(400);
    const host = await show("/registrar", Registrar);
    const grid = host.querySelector(".tiles");
    expect(applied(grid, "grid-template-columns")).toBe("repeat(3, minmax(0, 1fr))");
    const tile = host.querySelector(".tiles a.tile");
    expect(applied(tile, "min-height")).toBe("64px");
    expect(token("--tile-h")).toBe("4rem");
    expect(applied(tile?.querySelector(".lead"), "display")).toBe("none");
  });

  it("get their icon and their room back from 640px", async () => {
    withStyles(700);
    const host = await show("/registrar", Registrar);
    const tile = host.querySelector(".tiles a.tile");
    expect(applied(tile?.querySelector(".lead"), "display")).toBe("flex");
    expect(applied(tile, "min-height")).toBe("104px");
  });
});

describe("the short fields in pairs", () => {
  const pairs = (host: HTMLElement): string[] =>
    [...host.querySelectorAll(".fieldset > .pair")].map(
      (field) => field.querySelector("label")?.textContent?.replace(/\s*\*$/, "") ?? "",
    );

  it("are the two dates, and quantity with price, one after the other", async () => {
    withStyles(400);
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    expect(pairs(host)).toEqual([
      "Fecha de contratación",
      "Fecha valor",
      "Cantidad",
      "Precio unitario",
    ]);
    for (const field of host.querySelectorAll(".fieldset > .pair")) {
      expect(applied(field, "grid-column")).toBe("auto");
    }
  });

  it("stay a column at 360px, where a date does not fit in half the row", async () => {
    withStyles(360);
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    for (const field of host.querySelectorAll(".fieldset > .pair")) {
      expect(applied(field, "grid-column")).toBe("1 / -1");
    }
  });
});
