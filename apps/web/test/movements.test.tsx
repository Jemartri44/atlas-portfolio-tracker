// @vitest-environment happy-dom
//
// The movements as composed in docs/design/system.md §7.3: grouped by day on a
// phone, the filters folded there and in a column beside the table from 1024px
// (D12), and a detail that opens with one sentence whose figures the privacy
// mode masks with their unit.

import { ledgerEntries, projectLedger } from "@atlas/domain";
import { afterEach, describe, expect, it } from "vitest";
import { nameIndex } from "../src/format/names.js";
import { store } from "../src/ledger/state.js";
import Detail from "../src/routes/movimientos/detail.jsx";
import Movimientos from "../src/routes/movimientos/index.jsx";
import { byDay } from "../src/routes/movimientos/MovementList.jsx";
import { movementRows } from "../src/view-models/index.js";
import { movementSentence } from "../src/view-models/sentence.js";
import { goldenEvents } from "./helpers/golden.js";
import { show, text, withGoldenLedger } from "./helpers/render.jsx";
import { withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => withoutStyles());

const events = goldenEvents();
const state = projectLedger(events, { collectErrors: true });
const names = nameIndex(state);
const entries = ledgerEntries(state, events);

/** The sentence as plain text, figures included, as it reads with the mask off. */
const said = (type: string): string => {
  const entry = entries.find((one) => one.event.type === type && one.status === "current");
  return movementSentence(entry as NonNullable<typeof entry>, names)
    .map((part) =>
      "text" in part
        ? part.text
        : "amount" in part
          ? `[${part.amount.currency}]`
          : `[${part.of ?? ""}]`,
    )
    .join("");
};

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

  it("keeps every filter in sight beside the table from 1024px", async () => {
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
