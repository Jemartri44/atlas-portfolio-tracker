// The box card, as data: what each figure is called and where the caveat of a
// year with no checked table is said.
//
// The card used to fall back to the literal "Sin correspondencia comprobada"
// on **every** row, which in the ordinary year —2025 is the only one with a
// checked table and the user's first real return is 2026— meant forty-odd
// identical rows, five in a row per asset told apart only by the number beside
// them. What a figure is now comes from the domain, and the caveat is said
// once.

import type { BoxEntry, TaxBoxes } from "@atlas/domain/fiscal";
import { describe, expect, it } from "vitest";
import { NO_NAMES } from "../src/format/names.js";
import { boxesView } from "../src/view-models/fiscal/boxes.js";

const entry = (concept: BoxEntry["concept"], box?: string): BoxEntry => ({
  concept,
  criteria: [],
  ...(box === undefined ? {} : { box, label: `rótulo de ${box}` }),
});

const boxesOf = (mapping: TaxBoxes["mapping"], entries: BoxEntry[]): TaxBoxes => ({
  year: 2026,
  scope: "fiscal_total",
  today: "2027-06-01",
  mapping,
  entries,
  notes: [],
});

describe("the return laid out by box", () => {
  it("says what every figure is, whether or not it has a number", () => {
    const view = boxesView(
      boxesOf("none", [entry("base.savings"), entry("gp.listed_shares.transmission")]),
      NO_NAMES,
    );
    const rows = view.blocks.flatMap((block) => block.rows);
    expect(rows.map((row) => row.name)).toEqual([
      "Importe de las transmisiones",
      "Base imponible del ahorro",
    ]);
    // Never the identifier the code uses for it.
    expect(rows.some((row) => row.name.includes("."))).toBe(false);
  });

  it("does not raise the caveat per row in a year with no table at all", () => {
    // The card already says it once, at its head: repeating it on every row is
    // what made it unreadable.
    const view = boxesView(boxesOf("none", [entry("base.savings")]), NO_NAMES);
    expect(view.blocks.every((block) => !block.some_without_box)).toBe(true);
  });

  it("marks the block, once, when a checked year still misses a box", () => {
    const view = boxesView(
      boxesOf("checked", [
        entry("base.savings", "0460"),
        entry("base.savings_taxable"),
        entry("rcm.interest", "0027"),
      ]),
      NO_NAMES,
    );
    const base = view.blocks.find((block) => block.key === "base");
    const rcm = view.blocks.find((block) => block.key === "rcm");
    expect(base?.some_without_box).toBe(true);
    expect(rcm?.some_without_box).toBe(false);
  });

  it("keeps the literal label of the form beside what the figure is", () => {
    const view = boxesView(boxesOf("checked", [entry("base.savings", "0460")]), NO_NAMES);
    const [row] = view.blocks.flatMap((block) => block.rows);
    expect(row?.name).toBe("Base imponible del ahorro");
    expect(row?.label).toBe("rótulo de 0460");
    expect(row?.box).toBe("0460");
  });
});
