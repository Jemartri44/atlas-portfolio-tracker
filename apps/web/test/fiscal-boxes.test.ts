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

/** The same, with the official image it was read in, as the year table gives it. */
const checkedEntry = (
  concept: BoxEntry["concept"],
  box: string,
  page: string,
  certainty: BoxEntry["certainty"] = "high",
): BoxEntry => ({
  ...entry(concept, box),
  source: {
    document: "Orden HAC/277/2026, anexo I",
    page,
    url: `https://www.boe.es/datos/imagenes/disp/2026/76/7041_16815484_${page}.png`,
  },
  checked_at: "2026-09-23",
  ...(certainty === undefined ? {} : { certainty }),
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

  it("leaves out the blocks the year has nothing in", () => {
    // Eleven blocks always exist in the form; painting the empty ones gives
    // the reader ten headings with nothing under them to scroll past before
    // the one that has his figure in it.
    const view = boxesView(boxesOf("none", [entry("base.savings")]), NO_NAMES);
    expect(view.blocks.map((block) => block.key)).toEqual(["base"]);
  });

  it("keeps the literal label of the form beside what the figure is", () => {
    const view = boxesView(boxesOf("checked", [entry("base.savings", "0460")]), NO_NAMES);
    const [row] = view.blocks.flatMap((block) => block.rows);
    expect(row?.name).toBe("Base imponible del ahorro");
    expect(row?.label).toBe("rótulo de 0460");
    expect(row?.box).toBe("0460");
  });
});

/**
 * A number the user types into a real return has to say **where it comes
 * from**. The screen showed neither the official image nor how firm the
 * reading of it was — and `check-bundle.mjs` let `boe.es` through its rule
 * against foreign origins saying it was "a citation the screen shows", which
 * was not true while nothing showed it.
 */
describe("where a box number comes from", () => {
  it("says on the row where it was checked and when", () => {
    const view = boxesView(
      boxesOf("checked", [checkedEntry("base.savings", "0460", "19")]),
      NO_NAMES,
    );
    const [row] = view.blocks.flatMap((block) => block.rows);
    expect(row?.checked).toBe("Comprobada en la pág. 19 el 23/09/2026");
  });

  it("marks a box whose reading is not firm, and leaves the firm ones plain", () => {
    const view = boxesView(
      boxesOf("checked", [
        checkedEntry("base.savings", "0460", "19", "medium"),
        checkedEntry("rcm.interest", "0027", "5"),
      ]),
      NO_NAMES,
    );
    const rows = view.blocks.flatMap((block) => block.rows);
    expect(rows.map((row) => row.checked)).toEqual([
      "Comprobada en la pág. 5 el 23/09/2026",
      "Comprobada en la pág. 19 el 23/09/2026, sin confirmar",
    ]);
  });

  it("cites the official image once per block, never once per row", () => {
    const view = boxesView(
      boxesOf("checked", [
        checkedEntry("rcm.interest", "0027", "5"),
        checkedEntry("rcm.dividends", "0029", "5"),
        checkedEntry("base.savings", "0460", "19"),
      ]),
      NO_NAMES,
    );
    const rcm = view.blocks.find((block) => block.key === "rcm");
    expect(rcm?.rows.length).toBe(2);
    // Two boxes of the same page: one citation, not two.
    expect(rcm?.sources.map((source) => source.page)).toEqual(["5"]);
    expect(rcm?.sources[0]?.url).toContain("https://www.boe.es/");
    expect(view.blocks.find((block) => block.key === "base")?.sources.length).toBe(1);
  });

  it("cites nothing in a year nobody checked", () => {
    const view = boxesView(boxesOf("none", [entry("base.savings")]), NO_NAMES);
    expect(view.blocks.flatMap((block) => block.sources)).toEqual([]);
    expect(
      view.blocks.flatMap((block) => block.rows).every((row) => row.checked === undefined),
    ).toBe(true);
  });
});
