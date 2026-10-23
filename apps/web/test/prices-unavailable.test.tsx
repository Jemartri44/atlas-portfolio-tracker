// @vitest-environment happy-dom
//
// The automatic prices are informational: when their chunk does not load (an installed PWA whose
// chunk is gone) the screens go on with the manual prices and say so. It used to take the whole
// screen down.

import { describe, expect, it, vi } from "vitest";
import Cartera from "../src/routes/cartera/index.jsx";
import { show, text, today, until, withGoldenLedger } from "./helpers/render.jsx";

vi.mock("../src/prices/quotes.js", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

withGoldenLedger();

describe("a screen whose automatic prices cannot be loaded", () => {
  it("stays, and says in Spanish that only the manual prices are used", async () => {
    today("2027-01-10");
    const host = await show("/cartera", Cartera);
    await until(
      () => text(host).includes("No se han podido cargar los precios automáticos"),
      "the notice",
    );
    expect(text(host)).toContain("Pesos frente al objetivo");
    expect(text(host)).not.toContain("Esta pantalla no ha podido abrirse");
  });
});
