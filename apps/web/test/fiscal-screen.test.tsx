// @vitest-environment happy-dom
//
// The fiscal screen, rendered. What it has to say and what it must never say:
// the base as a fiscal total of both books, the criteria in Spanish and never
// by their identifier, the calm notice of a year with no checked boxes, and —
// with privacy on — the direction and the certainty of a criterion but not the
// money behind it.

import { describe, expect, it } from "vitest";
import { store } from "../src/ledger/state.js";
import Fiscal from "../src/routes/fiscal/index.jsx";
import { goldenLines } from "./helpers/golden.js";
import { openLedger, settle, show, text, ULID, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const open = async (year = 2027) => show(`/fiscal?ejercicio=${year}`, Fiscal, "/fiscal");

describe("the fiscal screen", () => {
  it("leads with the savings base, said to be the base and of both books", async () => {
    const host = await open();
    expect(text(host.querySelector("h1"))).toContain("Declaración");
    expect(text(host)).toContain("Base del ahorro");
    expect(text(host)).toContain("Cartera y cubo juntos");
    expect(text(host)).toContain("no lo que pagas");
  });

  it("opens each total into its operations, named by asset and date", async () => {
    const host = await open();
    const shown = text(host);
    expect(shown).toContain("Ganancias y pérdidas patrimoniales");
    expect(shown).toContain("Rendimientos del capital mobiliario");
    // Never an internal identifier, here or anywhere else on the screen.
    expect(shown).not.toMatch(ULID);
  });

  it("names the criteria in Spanish and never by their identifier", async () => {
    const host = await open();
    const shown = text(host);
    expect(shown).not.toMatch(/\b2:(listed|fund|crypto)\b/);
    expect(shown).not.toMatch(/\b24:etc\b/);
    expect(shown).toContain("Criterios en duda");
  });

  it("says the boxes of a year that has none, without inventing a number", async () => {
    const host = await open(2027);
    expect(text(host)).toContain("sin números de casilla");
    expect(text(host)).toContain("nunca se usa la casilla de otro ejercicio");
  });

  it("shows the informative returns with their verdict", async () => {
    const host = await open();
    const shown = text(host);
    expect(shown).toContain("Modelo 720");
    expect(shown).toContain("Modelo 721");
  });

  it("keeps the direction and the certainty with privacy on, and hides the money", async () => {
    store.setPrivacy(true);
    const host = await open();
    await settle();
    const shown = text(host);
    expect(shown).toMatch(/declaras de menos|declarado de menos|pagado de más|de más o de menos/);
    expect(shown).toMatch(/certeza|en disputa|firme/);
    // No amount survives: every figure goes through the mask.
    expect(host.querySelectorAll(".mask").length).toBeGreaterThan(0);
  });
});

describe("a ledger with nothing in it", () => {
  /** Only the catalogue: no purchase, no cash, no return. */
  const SETUP_ONLY = [
    goldenLines().find((line) => line.includes('"type":"settings_changed"')) as string,
    goldenLines().find((line) => line.includes('"type":"account_created"')) as string,
    goldenLines().find((line) => line.includes('"type":"asset_created"')) as string,
  ].join("\n");

  it("says one thing and where to start, not six cards of zeros", async () => {
    await openLedger(`${SETUP_ONLY}\n`);
    const host = await show("/fiscal", Fiscal, "/fiscal");
    const shown = text(host);
    expect(shown).toContain("Tu libro no tiene ninguna operación");
    expect(shown).toContain("Registrar la primera operación");
    // One card, and none of the cards of a year with figures.
    expect(host.querySelectorAll(".card").length).toBe(1);
    expect([...host.querySelectorAll("h2")].map(text)).toEqual([
      "Todavía no hay nada que declarar",
    ]);
    expect(shown).not.toContain("Criterios en duda");
  });
});
