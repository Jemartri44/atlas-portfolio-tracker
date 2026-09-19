// @vitest-environment happy-dom
//
// The summary as composed in docs/design/system.md §7.2: the proportion of
// the three books (percentages, visible with the privacy mode on, absent on a
// partial total), the recent movements cut at the date read, and the first
// steps of an empty ledger until the first purchase (D4).

import { describe, expect, it } from "vitest";
import { store } from "../src/ledger/state.js";
import Resumen from "../src/routes/resumen/index.jsx";
import { goldenLines } from "./helpers/golden.js";
import { openLedger, show, text, today, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const hero = (host: HTMLElement): Element | null =>
  host.querySelector('[aria-label="Patrimonio total"]');

/** dd/mm/yyyy → yyyy-mm-dd, to compare dates as text. */
const iso = (shown: string): string => shown.split("/").reverse().join("-");

describe("the patrimony of the summary", () => {
  it("says what each book weighs, on a bar and in figures, when the total is complete", async () => {
    // 10/01/2027: every position of the golden ledger has a price.
    today("2027-01-10");
    const host = await show("/", Resumen);
    const shares = [...(hero(host)?.querySelectorAll(".part-share") ?? [])].map(text);
    expect(shares).toEqual(["48 %", "6 %", "46 %"]);
    expect(hero(host)?.querySelectorAll(".shares .share-seg")).toHaveLength(3);
    // The figure has no cents (D10); the lines of the breakdown keep them.
    expect(text(hero(host)?.querySelector(".hero-figure"))).not.toMatch(/,\d\d/);
    expect(text(hero(host)?.querySelector(".disclosure"))).toMatch(/,\d\d/);
  });

  it("keeps the percentages in sight with the privacy mode on, and hides the amounts", async () => {
    today("2027-01-10");
    store.setPrivacy(true);
    const host = await show("/", Resumen);
    const parts = text(hero(host)?.querySelector(".parts"));
    expect(parts).toContain("48 %");
    expect(parts).toContain("••••");
    expect(parts.replace(/\d+ %/g, "")).not.toMatch(/\d/);
  });

  it("draws no bar and no percentage on a partial total", async () => {
    // 18/09/2026: bonds, gold and bitcoin are held without a price.
    today("2026-09-18");
    const host = await show("/", Resumen);
    expect(text(hero(host)?.querySelector(".hero-figure"))).toContain("parcial");
    expect(hero(host)?.querySelector(".shares")).toBeNull();
    expect(hero(host)?.querySelector(".part-share")).toBeNull();
    // What is missing is said once, with the way to fix it.
    expect(text(hero(host)?.querySelector(".pending"))).toContain("Registrar valoraciones");
  });
});

describe("the recent movements of the summary", () => {
  it("shows the last five up to the date read, never one dated later", async () => {
    today("2027-01-10");
    const host = await show("/", Resumen);
    const card = host.querySelector('[aria-label="Últimos movimientos"]');
    const dates = [...(card?.querySelectorAll(".row .fig-sub") ?? [])].map((node) =>
      iso(text(node).trim()),
    );
    expect(dates).toHaveLength(5);
    expect(dates.filter((date) => date > "2027-01-10")).toEqual([]);
    // And the golden ledger does have movements after that date.
    expect(goldenLines().some((line) => /"(trade|value)_date":"2027-0[2-9]/.test(line))).toBe(true);
    expect(card?.querySelector('a.card-foot[href="/movimientos"]')).not.toBeNull();
  });
});

describe("the first steps", () => {
  it("are all an empty ledger shows, with the first one to do", async () => {
    await openLedger("");
    const host = await show("/", Resumen);
    const steps = host.querySelector('[aria-labelledby="h-steps"]');
    expect(text(steps)).toContain("0 de 4");
    expect(steps?.querySelectorAll(".step")).toHaveLength(4);
    expect(steps?.querySelector(".step.is-current")?.textContent).toContain("Da de alta la cuenta");
    expect(steps?.querySelector('.step.is-current a[href="/registrar/cuenta"]')).not.toBeNull();
    // Nothing else: no patrimony of zeros, no warnings about exporting nothing.
    expect(hero(host)).toBeNull();
    expect(host.querySelector('[aria-label="Lo que reclama atención"]')).toBeNull();
  });

  it("mark what the ledger already has, and move the button to the next step", async () => {
    const account = goldenLines().find((line) => line.includes('"type":"account_created"'));
    await openLedger(`${account}\n`);
    const host = await show("/", Resumen);
    const steps = host.querySelector('[aria-labelledby="h-steps"]');
    expect(text(steps)).toContain("1 de 4");
    expect(text(steps?.querySelector(".step.is-done"))).toContain("Hecho: Fondos indexados");
    expect(steps?.querySelector(".step.is-current a[href='/registrar/activo']")).not.toBeNull();
  });

  it("leave the summary with the first purchase", async () => {
    today("2027-01-10");
    const host = await show("/", Resumen);
    expect(host.querySelector('[aria-labelledby="h-steps"]')).toBeNull();
    expect(hero(host)).not.toBeNull();
  });
});
