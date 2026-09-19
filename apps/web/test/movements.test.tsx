// @vitest-environment happy-dom
//
// The movements as composed in docs/design/system.md §7.3: grouped by day on a
// phone and on a small laptop, the filters folded there and in a column beside the table from 1280px
// (D12), and a detail that opens with one sentence whose figures the privacy
// mode masks with their unit.

import { ledgerEntries, projectLedger } from "@atlas/domain";
import { afterEach, describe, expect, it } from "vitest";
import { nameIndex } from "../src/format/names.js";
import { store } from "../src/ledger/state.js";
import Detail from "../src/routes/movimientos/detail.jsx";
import Movimientos from "../src/routes/movimientos/index.jsx";
import { movementGlyph } from "../src/routes/movimientos/MovementLine.jsx";
import { byDay } from "../src/routes/movimientos/MovementList.jsx";
import { movementRows } from "../src/view-models/index.js";
import { draftSentence, movementSentence } from "../src/view-models/sentence.js";
import { goldenEvents } from "./helpers/golden.js";
import { show, text, withGoldenLedger } from "./helpers/render.jsx";
import { withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => withoutStyles());

const events = goldenEvents();
const state = projectLedger(events, { collectErrors: true });
const names = nameIndex(state);
const entries = ledgerEntries(state, events);

/** A sentence as plain text, its figures by their unit. */
const plain = (sentence: ReturnType<typeof movementSentence>): string =>
  sentence
    .map((part) =>
      "text" in part
        ? part.text
        : "amount" in part
          ? `[${part.amount.currency}]`
          : `[${part.of ?? ""}]`,
    )
    .join("");

const current = (type: string) => {
  const entry = entries.find((one) => one.event.type === type && one.status === "current");
  return entry as NonNullable<typeof entry>;
};

/** The sentence as plain text, figures included, as it reads with the mask off. */
const said = (type: string): string => plain(movementSentence(current(type), names));

/** The same, told before it is recorded, over the effect of a form. */
const drafted = (type: string): string => plain(draftSentence(current(type).event, names));

describe("the list of movements", () => {
  it("groups consecutive rows of the same day, in the order given", () => {
    const rows = movementRows(entries.slice(0, 30), names);
    const days = byDay(rows);
    expect(days.flatMap((day) => day.rows)).toEqual(rows);
    expect(new Set(days.map((day) => day.date)).size).toBe(days.length);
  });

  it("folds the filters on a phone, with the search always in sight", async () => {
    withStyles(400);
    const host = await show("/movimientos?tipo=buy", Movimientos);
    const bar = host.querySelector(".filters-bar");
    expect(bar?.querySelector("#f-q")?.closest("details")).toBeNull();
    expect(bar?.querySelector("#f-tipo")?.closest("details")).not.toBeNull();
    expect(text(bar?.querySelector("summary"))).toContain("Filtros · 1");
    expect(host.querySelector(".filters-panel")).toBeNull();
  });

  it("folds them too at 1024px, where a column beside the table does not fit", async () => {
    withStyles(1024);
    const host = await show("/movimientos", Movimientos);
    expect(host.querySelector(".filters-panel")).toBeNull();
    expect(host.querySelector(".list-pane")?.classList.contains("span-12")).toBe(true);
    // The folded bar takes the whole row of the grid, not one column of twelve.
    const bar = host.querySelector(".filters-bar") as HTMLElement;
    expect(getComputedStyle(bar).gridColumn).toMatch(/^(span 12|1 \/ -1)$/);
    // And its filters in columns of a readable width, not one select the width of the row.
    const fields = bar.querySelector(".filter-fields") as HTMLElement;
    expect(getComputedStyle(fields).gridTemplateColumns).toContain("minmax(14rem, 1fr)");
    expect(getComputedStyle(bar.querySelector(".field") as HTMLElement).maxWidth).not.toBe("none");
  });

  it("draws money in and money out apart, and neither as a charge", () => {
    const glyphs = ["cash_deposit", "cash_withdrawal", "standalone_fee"].map(movementGlyph);
    expect(new Set(glyphs).size).toBe(3);
  });

  it("labels a valuation's figure as a price, not as money that moved", async () => {
    withStyles(400);
    const host = await show("/movimientos?tipo=valuation", Movimientos);
    const rows = [...host.querySelectorAll(".rows .fig")].map((fig) => text(fig));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((fig) => fig.startsWith("precio "))).toBe(true);
  });

  it("keeps every filter in sight beside the table from 1280px", async () => {
    withStyles(1440);
    const host = await show("/movimientos", Movimientos);
    const panel = host.querySelector("aside.filters-panel");
    expect(panel?.querySelector("#f-q")).not.toBeNull();
    expect(panel?.querySelector("#f-tipo")?.closest("details")).toBeNull();
    expect(host.querySelectorAll("#f-tipo")).toHaveLength(1);
  });
});

describe("the sentence of a movement", () => {
  it("says what was done, with what, for how much, when and where", () => {
    expect(said("buy")).toMatch(
      /^Compraste \[participaciones\] de .+ por \[EUR\] el \d\d\/\d\d\/\d{4} · .+$/,
    );
    expect(said("cash_deposit")).toMatch(/^Ingresaste \[EUR\] el /);
    expect(said("transfer")).toMatch(/^Traspasaste \[participaciones\] de .+ a .+ el /);
    expect(said("valuation")).toMatch(/ valía \[(EUR|USD)\] por unidad el /);
  });

  it("tells what is about to be recorded, in the words of a form", () => {
    expect(drafted("buy")).toMatch(
      /^Vas a registrar la compra de \[participaciones\] de .+ por \[EUR\] el \d\d\/\d\d\/\d{4} · .+\.$/,
    );
    expect(drafted("cash_deposit")).toMatch(/^Vas a registrar un ingreso de \[EUR\] el /);
    expect(drafted("cash_withdrawal")).toMatch(/^Vas a registrar una retirada de \[EUR\] el /);
    expect(drafted("valuation")).toMatch(/^Vas a registrar que .+ valía \[(EUR|USD)\] por unidad/);
    expect(drafted("order_updated")).toMatch(/^Vas a registrar cambio de orden/);
    const correction = {
      ...current("cash_deposit").event,
      corrects_id: "01ARYZ6S41TSV4RRFFQ6900001",
    };
    expect(plain(draftSentence(correction, names))).toMatch(
      /^Vas a rectificarlo: en su lugar, un ingreso de \[EUR\] el /,
    );
    // Each figure carries its field, so a form can reveal what was typed.
    const figures = draftSentence(current("buy").event, names).filter((part) => !("text" in part));
    expect(figures.map((part) => ("field" in part ? part.field : undefined))).toEqual([
      "quantity",
      "amount",
    ]);
  });

  it("says orders and reversals too, and falls back to the type", () => {
    expect(said("order_placed")).toMatch(/^Diste una orden de (compra|venta) de .+ el /);
    expect(said("asset_created")).toMatch(/^Diste de alta el activo .+ el /);
    // An update of an order is about no asset and no account: its type says it.
    expect(said("order_updated")).toBe("Cambio de orden");
  });

  it("opens the detail, masked with its units when the privacy mode is on", async () => {
    const buy = entries.find((one) => one.event.type === "buy" && one.status === "current");
    store.setPrivacy(true);
    const host = await show(`/movimientos/${buy?.event.id}`, Detail, "/movimientos/:id");
    // What is seen, without what is said only to a screen reader.
    const seen = host.querySelector(".sentence")?.cloneNode(true) as Element;
    for (const hidden of seen.querySelectorAll(".sr-only")) {
      hidden.remove();
    }
    const sentence = text(seen);
    expect(sentence).toMatch(/^Compraste ••••\s?participaciones de /);
    expect(sentence).toMatch(/••••\s?€/);
    expect(sentence).not.toMatch(/\d,\d/);
  });
});
