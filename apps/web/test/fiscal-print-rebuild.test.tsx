// @vitest-environment happy-dom
//
// The printing of the package of the return survives the card being rebuilt:
// the ECB findings arrive after the first paint and the screen computes its
// boxes again, which replaces the card. A phone that is slow to lay the sheet
// out would otherwise print the whole page, with the blocks closed.

import { afterEach, describe, expect, it, vi } from "vitest";
import Fiscal from "../src/routes/fiscal/index.jsx";
import { press, show, text, until, withGoldenLedger } from "./helpers/render.jsx";

const arrival = vi.hoisted(() => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release: () => release() };
});

// The module of the findings loads only when the test lets it.
vi.mock("../src/ecb/findings.js", async (importActual) => {
  await arrival.gate;
  return importActual();
});

withGoldenLedger();

afterEach(() => {
  vi.restoreAllMocks();
});

const printed = () => document.querySelector(".is-printing");
const blocks = () => [...(printed()?.querySelectorAll("details") ?? [])];

describe("printing the package while the findings are still arriving", () => {
  it("keeps the card marked and its blocks open when the card is replaced", async () => {
    window.print = vi.fn();
    const host = await show("/fiscal?ejercicio=2028", Fiscal, "/fiscal");
    await until(() => text(host).includes("Cuota estimada del ahorro"), "the estimate");
    await press(host, "Imprimir o guardar en PDF");
    const before = printed();
    expect(before).not.toBeNull();
    expect(blocks().length).toBeGreaterThan(0);

    arrival.release();
    await until(() => printed() !== null && printed() !== before, "the card, rebuilt");
    expect(text(printed())).toContain("Tu declaración por casillas");
    expect(blocks().every((block) => block.open)).toBe(true);

    window.dispatchEvent(new Event("afterprint"));
    expect(printed()).toBeNull();
    expect([...host.querySelectorAll("details")].some((block) => !block.open)).toBe(true);
  });
});
