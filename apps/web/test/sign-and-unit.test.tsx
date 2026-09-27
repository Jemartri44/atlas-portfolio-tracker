// @vitest-environment happy-dom
//
// How a figure says its sign and its unit (feature 020, E1, block 2; proposal
// of 2026-09-25 §5.4). The colour goes with the sign and never replaces it:
//
//   - a negative carries the typographic minus, U+2212, never the hyphen;
//   - a zero carries no sign («0,0 pp»): a signed zero reads as a tiny gain or
//     loss that is not there;
//   - **pp** for a difference of weights, **%** for a weight or a return, and
//     never both in one column of a table.

import { Money } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { formatMoney } from "../src/format/money.js";
import { formatDecimalString, formatPercent, formatPoints, NBSP } from "../src/format/number.js";
import Cartera from "../src/routes/cartera/index.jsx";
import Cubo from "../src/routes/cubo/index.jsx";
import { show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const MINUS = "−";

describe("the sign of a figure", () => {
  it("is the typographic minus, U+2212, and never the hyphen", () => {
    for (const shown of [
      formatPoints("-1.5"),
      formatPercent("-12.3", { signed: true }),
      formatDecimalString("-7", { decimals: 0 }),
      formatMoney(Money.parse("-10", "EUR"), { signed: true }),
    ]) {
      expect(shown.codePointAt(0)).toBe(0x2212);
      expect(shown).not.toContain("-");
    }
  });

  it("is not printed on a zero, nor on what rounds to one", () => {
    expect(formatPoints("0", { decimals: 1 })).toBe(`0,0${NBSP}pp`);
    expect(formatPoints("-0.04", { decimals: 1 }).startsWith("0,0")).toBe(true);
    expect(formatPoints("0.04", { decimals: 1 }).startsWith("0,0")).toBe(true);
    expect(formatPercent("-0.004", { decimals: 2, signed: true }).startsWith("0,00")).toBe(true);
    expect(formatPoints("-0.06", { decimals: 1 })).toContain(`${MINUS}0,1`);
  });
});

/** The unit each cell of a column ends in, `%` or `pp`, over every table of a screen. */
const mixedColumns = (host: HTMLElement): string[] =>
  [...host.querySelectorAll("table")].flatMap((table, which) => {
    const units = new Map<number, Set<string>>();
    for (const row of table.querySelectorAll("tbody tr")) {
      [...row.querySelectorAll("td, th")].forEach((cell, column) => {
        const unit = /(%|pp)$/.exec(text(cell).trim())?.[1];
        if (unit !== undefined) {
          units.set(column, (units.get(column) ?? new Set()).add(unit));
        }
      });
    }
    return [...units]
      .filter(([, seen]) => seen.size > 1)
      .map(([column]) => `tabla ${which}, columna ${column}`);
  });

describe("the unit of a column", () => {
  it.each([
    ["/cartera?fecha=2027-01-10", Cartera],
    ["/cartera?fecha=2029-01-10", Cartera],
    ["/cubo?fecha=2029-01-10", Cubo],
  ] as const)("never mixes pp and %% in %s", async (route, screen) => {
    const host = await show(route, screen);
    expect(host.querySelectorAll("table").length).toBeGreaterThan(0);
    expect(mixedColumns(host)).toEqual([]);
  });
});
