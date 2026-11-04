// @vitest-environment happy-dom
//
// The printing of the package of the return survives the card being rebuilt:
// the ECB findings arrive after the first paint and the screen computes its
// boxes again, which replaces the card. A phone that is slow to lay the sheet
// out would otherwise print the whole page, with the blocks closed.

import { afterEach, describe, expect, it, vi } from "vitest";
import { folded } from "../src/routes/fiscal/InformativeCard.jsx";
import Fiscal from "../src/routes/fiscal/index.jsx";
import type { InformativeView } from "../src/view-models/fiscal/index.js";
import { press, show, text, until, withGoldenLedger } from "./helpers/render.jsx";
import { withoutStyles, withStyles } from "./helpers/styles.js";

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
  // Back to the viewport of the other tests: what the screen paints reads it.
  withStyles(1024);
  withoutStyles();
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

  it("opens the folded card of a phone for the sheet and folds it back after", async () => {
    window.print = vi.fn();
    withStyles(400);
    const host = await show("/fiscal?ejercicio=2028", Fiscal, "/fiscal");
    await until(() => text(host).includes("Tu declaración por casillas"), "the boxes");
    await press(host, "Imprimir o guardar en PDF");
    expect(printed()?.matches(".fold-card")).toBe(true);
    expect(blocks().every((block) => block.open)).toBe(true);

    const card = printed();
    window.dispatchEvent(new Event("afterprint"));
    expect(printed()).toBeNull();
    expect(card?.querySelector("details")?.open).toBe(false);
  });
});

describe("the folded line of an informative model", () => {
  it("says what is undetermined over what needs no filing, and what must be filed over both", () => {
    const of = (...verdicts: string[]) =>
      ({
        periodText: "",
        categories: verdicts.map((verdict) => ({ verdict, verdictText: verdict })),
      }) as unknown as InformativeView;
    expect(folded(of("not_obliged", "undetermined"))).toBe("undetermined");
    expect(folded(of("undetermined", "obliged"))).toBe("obliged");
  });
});
