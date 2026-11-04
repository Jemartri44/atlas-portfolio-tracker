// @vitest-environment happy-dom
//
// The bucket as composed in docs/design/system.md §7.6: it opens with its
// result against the index as a share of what was put in, a percentage that
// stays in sight; its warnings are the one
// notice of the application and none links to the screen already open; and a
// bucket where nothing ever happened is one empty state.

import { afterEach, describe, expect, it } from "vitest";
import Cubo from "../src/routes/cubo/index.jsx";
import { setPrivacy } from "../src/shell/preferences.js";
import { openLedger, show, text, withGoldenLedger } from "./helpers/render.jsx";
import { withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();

describe("the bucket", () => {
  // Back to the viewport of the other tests: what the screen paints reads it.
  afterEach(() => {
    withStyles(1024);
    withoutStyles();
  });

  it("opens with its result against the index in percent, in sight with the privacy mode", async () => {
    // 10/01/2027: every thesis can be compared, 2.000 € put in.
    setPrivacy(true);
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    const hero = host.querySelector(".card .hero-figure");
    expect(text(hero)).toBe("+30,6 %");
    // The amount goes under it, and that one is masked.
    const note = hero?.nextElementSibling;
    expect(note?.querySelector(".mask")).not.toBeNull();
    expect(text(note).replace(/[\d,]+ %/g, "")).not.toMatch(/\d,\d/);
  });

  it("gives no percentage over a partial total, and says why", async () => {
    // 15/01/2029: one closed thesis has no index to compare with.
    const host = await show("/cubo?fecha=2029-01-15", Cubo);
    // Not a «sin dato» at the size of a hero figure: a pending block, with why.
    expect(host.querySelector(".card .hero-figure")).toBeNull();
    const pending = host.querySelector(".card .pending");
    expect(text(pending)).toContain("a una tesis le falta el precio del índice");
    expect(pending?.querySelector('a[href="/registrar/valuation"]')).not.toBeNull();
  });

  it("says a position with no price has none once, not «sin precio sin dato»", async () => {
    // The figure says «sin dato»; the card, below, which prices are missing.
    const host = await show("/cubo?fecha=2029-01-15", Cubo);
    const row = [...host.querySelectorAll(".rows > li, .rows > .row")].find((item) =>
      text(item).startsWith("Alpha Spin-off"),
    );
    expect(row).toBeDefined();
    expect(text(row)).toBe("Alpha Spin-offsin dato");
  });

  it("keeps the open theses in sight and folds the closed ones, which are history", async () => {
    withStyles(1280);
    const host = await show("/cubo?fecha=2029-01-15", Cubo);
    const card = [...host.querySelectorAll("section.card")].find(
      (section) => text(section.querySelector("h2")) === "Tesis frente al índice",
    );
    const folds = [...(card?.querySelectorAll("details") ?? [])] as HTMLDetailsElement[];
    const closed = folds.find((fold) =>
      /^\d+ tesis cerradas$/.test(text(fold.querySelector("summary"))),
    );
    expect(closed?.open).toBe(false);
    // Every open thesis has its line outside any fold, and no closed one does.
    const outside = [...(card?.querySelectorAll(".stat-row") ?? [])].filter(
      (line) => line.closest("details") === null,
    );
    expect(outside.length).toBeGreaterThan(0);
    expect(outside.every((line) => text(line).includes("abierta"))).toBe(true);
  });

  it("says on a phone how many theses wait inside the folded card", async () => {
    withStyles(400);
    const host = await show("/cubo?fecha=2029-01-15", Cubo);
    const fold = [...host.querySelectorAll("section.fold-card")].find(
      (section) => text(section.querySelector("h2")) === "Tesis frente al índice",
    );
    expect(fold?.querySelector("details")?.open).toBe(false);
    expect(text(fold?.querySelector(".fold-summary"))).toMatch(/^\d+ abiertas? · \d+ cerradas?/);
  });

  it("puts the range right over the chart it changes, not over the figure", async () => {
    const host = await show("/cubo?fecha=2029-01-15", Cubo);
    const range = host.querySelector(".card.is-chart fieldset.segmented");
    const after = range?.closest(".chart-range")?.nextElementSibling;
    // The chart shares its row with its figures: nothing goes between it and the range.
    expect(after?.firstElementChild?.matches("figure.chart")).toBe(true);
  });

  it("says each warning once, where it happens, and never links to itself", async () => {
    const host = await show("/cubo?fecha=2029-01-15", Cubo);
    // No list of notices repeating the cards: the missing index is said by the
    // statistics, with the way to fix it, and by nothing else.
    expect(host.querySelector('[aria-label="Avisos del cubo"]')).toBeNull();
    const notices = [...host.querySelectorAll(".notice")].map(text);
    expect(notices.some((notice) => notice.includes("precio del índice"))).toBe(false);
    expect(host.querySelector('.notice a[href="/cubo"]')).toBeNull();
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it("is one empty state when nothing ever happened in it", async () => {
    await openLedger("");
    const host = await show("/cubo", Cubo);
    expect(host.querySelectorAll(".card")).toHaveLength(1);
    expect(text(host.querySelector(".empty"))).toContain("El cubo está vacío.");
    expect(host.querySelector('.empty a[href="/registrar/tesis"]')).not.toBeNull();
  });
});
