// @vitest-environment happy-dom
//
// A lazy load that fails (a chunk gone after a deploy, the network) says so on its own line: it
// must never reach the boundary of the page and take the rest of Cartera with it.

import { describe, expect, it, vi } from "vitest";
import { AfterTaxLines } from "../src/routes/cartera/AfterTaxLines.jsx";
import { show, text, until } from "./helpers/render.jsx";

vi.mock("@atlas/domain/fiscal", () => {
  throw new Error("the chunk is gone");
});

describe("the lines of the return after tax, when the engine cannot be loaded", () => {
  it("say there is no figure and why, and render nothing else", async () => {
    const host = await show("/", () => (
      <section>
        <p>la tarjeta sigue</p>
        <AfterTaxLines events={[]} to="2028-06-30" />
      </section>
    ));
    await until(() => !text(host).includes("calculando…"), "the failed load");
    expect(text(host)).toContain("la tarjeta sigue");
    expect(text(host)).toContain("sin cifra: no se ha podido calcular; recarga la página");
  });
});
