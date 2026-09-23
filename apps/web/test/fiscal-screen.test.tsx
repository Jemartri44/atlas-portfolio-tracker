// @vitest-environment happy-dom
//
// The fiscal screen, rendered. What it has to say and what it must never say:
// the base as a fiscal total of both books, the criteria in Spanish and never
// by their identifier, the calm notice of a year with no checked boxes, and —
// with privacy on — the direction and the certainty of a criterion but not the
// money behind it.

import { describe, expect, it } from "vitest";
import { MEASURE_REASONS } from "../src/format/criteria.js";
import { store } from "../src/ledger/state.js";
import Fiscal from "../src/routes/fiscal/index.jsx";
import { goldenLines } from "./helpers/golden.js";
import {
  openLedger,
  settle,
  show,
  text,
  today,
  ULID,
  withGoldenLedger,
} from "./helpers/render.jsx";

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

  it("tells two entries of the same criterion apart by what they come from", async () => {
    // The engine emits one entry per motive, so the same criterion appears
    // more than once; only the ones that carry a `reason` had anything on
    // them. Two identical lines with different amounts beside them say
    // nothing, so an entry with no motive is named by its operations.
    const host = await open(2027);
    const lines = [...host.querySelectorAll(".stakes li")].map(text);
    // The golden ledger emits this one twice: once for an ordinary exposure
    // and once because the exchange does not say whether it took the
    // neutrality regime.
    const repeated = lines.filter((line) => line.includes("Reparto del coste en una escisión"));
    expect(repeated.length).toBe(2);
    expect(repeated[0]).not.toBe(repeated[1]);
    // The one with no motive is named by the operations behind it.
    const named = repeated.find((line) => !line.includes("régimen de neutralidad, y sin eso"));
    expect(named).toMatch(/Por [^·]+ · \d{2}\/\d{2}\/\d{4}/);
    // And every entry of the list says something about its own scope: either
    // the motive the engine gave it, or the operations it comes from.
    const motives = Object.values(MEASURE_REASONS);
    for (const line of lines) {
      const named = /Por [^·]+ · \d{2}\/\d{2}\/\d{4}/.test(line);
      expect(named || motives.some((motive) => line.includes(motive))).toBe(true);
    }
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

/**
 * The year a loss stops being usable.
 *
 * A balance of 2027 with four years of carry-forward lives through 2031 and is
 * gone in 2032; in 2031 the engine offsets what it can and reports the rest as
 * expired at its close (checked: with a gain in 2031 it is offset, with a gain
 * in 2032 it is not). The screen used to answer "No hay nada que declarar"
 * that very year, because `empty` looked at what was pending and never at what
 * had just died.
 */
describe("the year a pending loss expires", () => {
  /** A sale at a loss in 2027 and nothing else: 5.000,00 down, usable to 2031. */
  const WITH_LOSS = [
    goldenLines().find((line) => line.includes('"type":"settings_changed"')) as string,
    goldenLines().find((line) => line.includes('"type":"account_created"')) as string,
    goldenLines().find((line) => line.includes('"type":"asset_created"')) as string,
    JSON.stringify({
      schema_version: 1,
      id: `01P${"0".repeat(20)}BY1`,
      recorded_at: "2027-01-05T18:00:00.000Z",
      type: "buy",
      account_id: "acc_mi",
      asset_id: "ast_world",
      trade_date: "2027-01-05",
      value_date: "2027-01-05",
      quantity: "100",
      unit_price: "100",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2027-01-05",
      fee: "0",
      source: "manual",
      fingerprint: "sha256:buy",
    }),
    JSON.stringify({
      schema_version: 1,
      id: `01P${"0".repeat(20)}SX1`,
      recorded_at: "2027-06-01T18:00:00.000Z",
      type: "sell",
      account_id: "acc_mi",
      asset_id: "ast_world",
      trade_date: "2027-06-01",
      value_date: "2027-06-01",
      quantity: "100",
      unit_price: "50",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2027-06-01",
      fee: "0",
      source: "manual",
      fingerprint: "sha256:sell",
    }),
  ].join("\n");

  const openYear = async (year: number) => {
    await openLedger(`${WITH_LOSS}\n`);
    const host = await show(`/fiscal?ejercicio=${year}`, Fiscal, "/fiscal");
    await settle(30);
    return host;
  };

  it("does not say there is nothing to declare the year a balance dies", async () => {
    const shown = text(await openYear(2031));
    expect(shown).not.toContain("No hay nada que declarar");
    expect(shown).toContain("Caducadas al cerrar 2031, sin llegar a compensarse");
    expect(shown).toContain("−5.000,00 €");
    // And the card does not contradict itself above the table it is showing.
    expect(shown).not.toContain("No arrastras pérdidas");
  });

  it("still says the years in which it is only pending", async () => {
    const shown = text(await openYear(2030));
    expect(shown).not.toContain("No hay nada que declarar");
    expect(shown).toContain("Se pueden compensar hasta 2031");
  });

  /**
   * The warning, which used to be a condition that could never be true: it
   * asked `pending` for a balance whose last year was the one being looked at,
   * and in that year the engine already reports what is left of it as expired
   * at its close. So it never fired once.
   *
   * It fires now where the user can still do something —*during* the last
   * year, by realising gains before 31 December— and one year earlier as a
   * heads-up. With the year already closed there is nothing to be done and the
   * table says it in the past tense, which is what it is.
   */
  it("warns while the last year is still running, when something can be done", async () => {
    today("2031-07-01");
    const shown = text(await openYear(2031));
    expect(shown).toContain("Este es el último ejercicio para usarlas");
    expect(shown).toContain("lo que no compenses antes del 31 de diciembre se pierde");
    // And the table below does not speak of it in the past while it lasts.
    expect(shown).toContain("Lo que no compenses antes de que acabe 2031 se pierde");
    expect(shown).not.toContain("Caducadas al cerrar");
  });

  it("gives a heads-up the year before, without alarming", async () => {
    today("2030-07-01");
    const shown = text(await openYear(2030));
    expect(shown).toContain("Les queda este ejercicio y el siguiente");
    expect(shown).toContain("solo se pueden compensar hasta 2031");
    expect(shown).not.toContain("Este es el último ejercicio para usarlas");
  });

  it("does not warn about a year that is already over", async () => {
    // Looking at 2031 from 2033: nothing can be done, and the table below
    // already says it expired, in the past tense.
    today("2033-07-01");
    const shown = text(await openYear(2031));
    expect(shown).not.toContain("Este es el último ejercicio para usarlas");
    expect(shown).not.toContain("Les queda este ejercicio");
    expect(shown).toContain("Caducadas al cerrar 2031");
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
