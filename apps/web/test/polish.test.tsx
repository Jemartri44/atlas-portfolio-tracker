// @vitest-environment happy-dom
//
// The polish that could be seen (feature 020, M13): the date of a movement in
// ink with the whole row as its target, the column «Estado» only when a row
// uses it, and the list of the tax card flush with its title. The button of
// the folder in one line at 400px and the unit of the bucket's axis are
// measured in the real browser and in `chart.test.tsx`.

import { afterEach, describe, expect, it } from "vitest";
import Movimientos from "../src/routes/movimientos/index.jsx";
import FiscalCard from "../src/routes/resumen/FiscalCard.jsx";
import { hasState, type MovementRow, showsStateColumn } from "../src/view-models/index.js";
import { goldenEvents } from "./helpers/golden.js";
import { settle, show, text, withGoldenLedger } from "./helpers/render.jsx";
import { applied, withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => withoutStyles());

const headers = (host: HTMLElement): string[] =>
  [...host.querySelectorAll(".only-wide thead th, table thead th")].map((th) => text(th).trim());

describe("the table of the movements", () => {
  it("shows «Estado» only when a row of the page has a state to say", async () => {
    withStyles(1440);
    // No purchase of the golden ledger is reversed or invalid.
    const buys = await show("/movimientos?tipo=buy", Movimientos);
    expect(headers(buys)).not.toContain("Estado");
    // Its one reversal annuls a dividend: that page has a row to say it.
    const dividends = await show("/movimientos?tipo=dividend", Movimientos);
    expect(headers(dividends)).toContain("Estado");
  });

  it("decides it from the rows, and only from them", () => {
    const row = { status: "current" } as MovementRow;
    expect(showsStateColumn([row, row])).toBe(false);
    expect(showsStateColumn([row, { ...row, status: "reversed" }])).toBe(true);
    expect(showsStateColumn([row, { ...row, invalidReason: "x" }])).toBe(true);
    expect(showsStateColumn([])).toBe(false);
    expect(hasState({ ...row, status: "correction" })).toBe(true);
  });

  it("writes the date in ink and makes the whole row its target", async () => {
    withStyles(1440);
    const host = await show("/movimientos?tipo=buy", Movimientos);
    const link = host.querySelector("table tbody tr td a.row-link");
    expect(link).not.toBeNull();
    expect(applied(link, "text-decoration")).toMatch(/^none/);
    expect(applied(link, "color")).toBe(applied(document.body, "color"));
    expect(applied(link?.closest("tr"), "position")).toBe("relative");
  });
});

describe("the list of the tax card", () => {
  it("sits flush with the title of its card, with no indent", async () => {
    withStyles(400);
    const events = goldenEvents();
    const host = await show("/", () => <FiscalCard events={events} date="2028-02-10" />);
    for (
      let attempt = 0;
      attempt < 200 && host.querySelector(".fiscal-todo") === null;
      attempt += 1
    ) {
      await settle(10);
    }
    expect(applied(host.querySelector(".fiscal-todo"), "padding-left")).toMatch(/^0(px)?$/);
  });
});
