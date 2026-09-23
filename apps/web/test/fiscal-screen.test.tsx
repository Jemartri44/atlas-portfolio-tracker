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

  it("says what each figure is, instead of the same caveat on every row", async () => {
    // 2027 has no checked table, which is the ordinary case: the card used to
    // paint "Sin correspondencia comprobada" on forty-odd rows, five in a row
    // per asset, and the reader could not tell the transmission value from the
    // acquisition value.
    const host = await open(2027);
    const shown = text(host);
    expect(shown).toContain("Base imponible del ahorro");
    expect(shown).not.toContain("Sin correspondencia comprobada");
    // And never the identifier the code knows a concept by.
    expect(shown).not.toContain("base.savings");
  });

  /**
   * Four things the screen decided and nothing checked: a mutant of each one
   * survived the whole suite, and every one of them is something the reader
   * sees.
   */
  it("says plainly which data the ledger does not hold, instead of a blank", () => {
    // The NIF of a fund is not in the ledger and is never invented (#F2).
    return open(2027).then((host) => {
      expect(text(host)).toContain("No está en tus datos");
    });
  });

  it("tags the criteria that are not settled, and only those", async () => {
    const host = await open(2027);
    const tags = [...host.querySelectorAll(".base-card .tag, .tag")].map(text);
    expect(tags.length).toBeGreaterThan(0);
    // Beside a figure, a tag exists to say "careful, this reading is open".
    // Tagging the settled ones instead turns the warning into decoration: the
    // rows that deserve a second look stop standing out.
    const beside = [...host.querySelectorAll("td .tag, .row-meta .tag")].map(text);
    expect(beside.length).toBeGreaterThan(0);
    expect(beside).not.toContain("criterio firme");
    expect(beside.some((label) => /en disputa|certeza media|certeza baja/.test(label))).toBe(true);
  });

  it("shows three criteria and folds the rest", async () => {
    // Ten entries in a row took four phone screens of the screen whose figure
    // at the top is what the user came for.
    const host = await open(2027);
    const doubtful = [...host.querySelectorAll(".card")].find((card) =>
      text(card).includes("Criterios en duda"),
    );
    const lists = [...(doubtful?.querySelectorAll("ul.stakes") ?? [])];
    expect(lists.length).toBe(2);
    expect(lists[0]?.querySelectorAll("li").length).toBe(3);
    expect(text(doubtful)).toMatch(/Ver \d+ criterios más/);
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

  /**
   * The mask is the most fragile invariant of this application and the one
   * that is easiest to break without anybody noticing: it lives in the **call**
   * that renders a figure, not in a formatting function, so only a rendered
   * screen sees it. Two mutants of this screen survived the whole suite —
   * dropping the guard on the share of the threshold, and printing the moved
   * figures of a filed year as raw strings — and these are what kill them.
   */
  it("does not show how much of the threshold with privacy on", async () => {
    store.setPrivacy(true);
    const host = await open();
    await settle();
    // The threshold is a **public** figure, so a percentage of it is the
    // user's own amount said another way (decision (k)).
    expect(text(host)).toContain("Modelo 720");
    expect(text(host)).not.toContain("Del umbral");
    expect(host.innerHTML).not.toMatch(/\d,\d\s?%|\d+\s?%/);
  });

  it("shows how much of the threshold with privacy off", async () => {
    // The other half of the mutant: a guard that hides it always would pass
    // the test above and lose the figure.
    const host = await open();
    await settle();
    expect(text(host)).toContain("Del umbral");
    expect(text(host)).toMatch(/%/);
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
