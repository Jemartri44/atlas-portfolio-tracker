// @vitest-environment happy-dom
//
// Movements, denser on a phone (feature 020, E2, M8): one heading per month
// with the date in each row, and the valuations of one day gathered into one
// row that unfolds, in the list and in the recent movements of the summary,
// where a gathered day counts as one of the five and the list is cut at the
// date read.

import { describe, expect, it } from "vitest";
import Movimientos from "../src/routes/movimientos/index.jsx";
import Resumen from "../src/routes/resumen/index.jsx";
import {
  byMonth,
  firstEntries,
  groupValuations,
  type MovementRow,
} from "../src/view-models/index.js";
import { show, text, today, until, withGoldenLedger } from "./helpers/render.jsx";
import { withStyles } from "./helpers/styles.js";

withGoldenLedger();

const row = (id: string, date: string, type = "valuation", status = "current"): MovementRow =>
  ({ id, date, type, status }) as unknown as MovementRow;

describe("the valuations of a day", () => {
  it("are gathered into one, where the first of them was", () => {
    const entries = groupValuations([
      row("a", "2028-12-31"),
      row("b", "2028-12-31", "buy"),
      row("c", "2028-12-31"),
      row("d", "2028-12-30"),
    ]);
    expect(
      entries.map((entry) =>
        entry.kind === "row" ? entry.row.id : entry.rows.map((r) => r.id).join("+"),
      ),
    ).toEqual(["a+c", "b", "d"]);
  });

  it("never gather days apart, other types or one that is annulled", () => {
    const entries = groupValuations([
      row("a", "2028-12-31"),
      row("b", "2028-12-31", "valuation", "reversed"),
      row("c", "2028-12-31"),
      row("d", "2028-12-30"),
      row("e", "2028-12-30", "dividend"),
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual(["valuations", "row", "row", "row"]);
    const [group] = entries;
    expect(group?.kind === "valuations" ? group.rows.map((r) => r.id) : []).toEqual(["a", "c"]);
  });

  it("leave a day with a single valuation as it was", () => {
    expect(
      groupValuations([row("a", "2028-12-31"), row("b", "2028-12-30")]).map((e) => e.kind),
    ).toEqual(["row", "row"]);
  });
});

describe("the heading of a month", () => {
  it("reads the month off the civil date: the last day of the year stays in December", () => {
    const months = byMonth(
      groupValuations([row("a", "2029-01-01", "buy"), row("b", "2028-12-31", "buy")]),
    );
    expect(months.map((month) => month.month)).toEqual(["2029-01", "2028-12"]);
  });
});

describe("the first entries of a list", () => {
  it("count a gathered day as one, and complete the day at the edge of a chunk", () => {
    const rows = [
      row("a", "2028-12-31"),
      row("b", "2028-12-31"),
      row("c", "2028-12-31"),
      row("d", "2028-12-30", "buy"),
      row("e", "2028-12-29", "buy"),
      row("f", "2028-12-28", "buy"),
      row("g", "2028-12-27", "buy"),
      row("h", "2028-12-26", "buy"),
    ];
    // Asking for two entries: the three valuations of the 31st are one entry,
    // and the day is complete even though the first chunk may end inside it.
    const first = firstEntries(rows.length, (from, to) => rows.slice(from, to), 2);
    expect(first).toHaveLength(2);
    expect(first[0]?.kind === "valuations" ? first[0].rows : []).toHaveLength(3);
    const five = firstEntries(rows.length, (from, to) => rows.slice(from, to), 5);
    expect(five.map((entry) => (entry.kind === "row" ? entry.row.id : "31"))).toEqual([
      "31",
      "d",
      "e",
      "f",
      "g",
    ]);
  });
});

describe("the day at the edge of a chunk", () => {
  it("is completed before it is counted: a valuation of the same day in the next chunk still joins", () => {
    // limit 1: the first chunk takes four rows, and the second valuation of
    // the 31st is the fifth. Counted before completing the day, the first
    // valuation would be shown alone.
    const rows = [
      row("a", "2028-12-31"),
      row("b", "2028-12-31", "buy"),
      row("c", "2028-12-31", "buy"),
      row("d", "2028-12-31", "buy"),
      row("e", "2028-12-31"),
      row("f", "2028-12-30", "buy"),
    ];
    const [first] = firstEntries(rows.length, (from, to) => rows.slice(from, to), 1);
    expect(first?.kind === "valuations" ? first.rows.map((r) => r.id) : first?.kind).toEqual([
      "a",
      "e",
    ]);
  });
});

describe("the recent movements of the summary", () => {
  it("gather the valuations of 31/12/2028 into one of the five, cut at the date read", async () => {
    today("2029-01-20");
    const host = await show("/", Resumen);
    await until(() => host.querySelector(".summary-moves") !== null, "los últimos movimientos");
    const items = [...(host.querySelector(".summary-moves .rows")?.children ?? [])];
    expect(items).toHaveLength(5);
    const first = text(items[0]);
    expect(first).toMatch(/^\s*\d+ valoraciones · 31\/12\/2028/);
    // A date read earlier cuts what is later: the gathered day is not there.
    today("2028-12-30");
    const before = await show("/", Resumen);
    await until(() => before.querySelector(".summary-moves") !== null, "los movimientos antes");
    expect(text(before.querySelector(".summary-moves"))).not.toContain("31/12/2028");
  });
});

describe("the list of a phone", () => {
  it("puts a heading per month and the date in each row", async () => {
    withStyles(400);
    const host = await show("/movimientos", Movimientos);
    const headings = [...host.querySelectorAll(".days .day-title")].map(text);
    expect(headings[0]).toMatch(
      /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) de \d{4}$/,
    );
    expect(new Set(headings).size).toBe(headings.length);
    // The day of 31/12/2028, gathered: one row that unfolds with its 44px summary.
    expect(host.querySelector(".days .rows details.disclosure > summary")).not.toBeNull();
  });
});
