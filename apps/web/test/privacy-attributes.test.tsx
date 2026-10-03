// @vitest-environment happy-dom
//
// The guardian of E3 (feature 020, prompt §3, E3, block 1): every screen this
// delivery touches, rendered with the privacy mode **on**, says no amount and
// no quantity of the synthetic ledger — not in its text and not in any
// attribute, the `<title>` and the `<desc>` of an SVG included. It fails with a
// single appearance.
//
// A percentage next to a mask is the point of the delivery, so the net lets
// percentages and points through and nothing else (`helpers/exposures.ts`).

import { describe, expect, it } from "vitest";
import { store } from "../src/ledger/state.js";
import Cartera from "../src/routes/cartera/index.jsx";
import Cubo from "../src/routes/cubo/index.jsx";
import { exposures, ledgerFigures } from "./helpers/exposures.js";
import { show, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

/** Dates that change what the screens say: whole totals, a partial one, a young bucket. */
const DATES = ["2029-07-01", "2029-01-10", "2029-01-15", "2027-01-10"];

describe("the net itself", () => {
  const dom = (html: string): Element => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host;
  };

  it("has figures to look for, written the way a screen writes them", () => {
    const figures = ledgerFigures();
    expect(figures.length).toBeGreaterThan(50);
    expect(figures).toContain("3.100,00");
  });

  it("sees an amount in the text, in a title and in an aria-label", () => {
    expect(exposures(dom("<p>Aportado 3.100,00 €</p>"))).not.toEqual([]);
    expect(exposures(dom('<span title="coste 3.100,00">••••</span>'))).not.toEqual([]);
    expect(exposures(dom('<svg role="img" aria-label="invertido 3.100,00"></svg>'))).not.toEqual(
      [],
    );
  });

  it("sees a figure in the title and in the desc of an SVG", () => {
    expect(exposures(dom("<svg><title>Tesis 12.345,67 €</title></svg>"))).not.toEqual([]);
    expect(exposures(dom("<svg><desc>31,2343 part.</desc></svg>"))).not.toEqual([]);
  });

  it("sees the shape of an amount a fixture does not contain", () => {
    expect(exposures(dom("<p>Quedan 7,25 €</p>"), [])).not.toEqual([]);
    expect(exposures(dom("<p>Quedan 8 part.</p>"), [])).not.toEqual([]);
  });

  it("lets a percentage, points, a date and a mask through", () => {
    expect(
      exposures(
        dom(
          '<p>12,5 % · +1,1 pp · 31/12/2028 · •••• € <span aria-label="importe oculto" title="Tipo del BCE: 1,0850"></span></p>',
        ),
      ),
    ).toEqual([]);
  });
});

describe("the screens of E3 with the privacy mode on", () => {
  for (const [name, screen, path] of [
    ["Cartera", Cartera, "/cartera"],
    ["Cubo", Cubo, "/cubo"],
  ] as const) {
    for (const date of DATES) {
      it(`${name} at ${date} says no amount and no quantity`, async () => {
        store.setPrivacy(true);
        const host = await show(`${path}?fecha=${date}`, screen);
        expect(host.querySelector("section.card")).not.toBeNull();
        expect(exposures(host)).toEqual([]);
      });
    }
  }
});
