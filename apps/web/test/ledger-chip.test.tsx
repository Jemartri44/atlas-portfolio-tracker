// @vitest-environment happy-dom
//
// The chip of the header says where the data live and, in the browser, how old
// the last export is. While there is nothing recorded there is nothing to
// lose, and it says nothing about exporting: a warning with no stake teaches
// the user to ignore the one that will matter.

import { describe, expect, it } from "vitest";
import { store } from "../src/ledger/state.js";
import { openLedger, settle, showInShell, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const screen = { "/": () => <p>pantalla</p> };

describe("the chip of the data", () => {
  it("warns that the data were never exported once there is something to lose", async () => {
    const host = await showInShell("/", screen);
    const chip = host.querySelector(".source");
    expect(text(chip)).toContain("sin exportar");
    expect(chip?.querySelector(".age.is-overdue")).not.toBeNull();
  });

  it("says only where they live while nothing is recorded", async () => {
    await openLedger("");
    const host = await showInShell("/", screen);
    const chip = host.querySelector(".source");
    expect(text(chip)).toContain("Navegador");
    expect(chip?.querySelector(".age")).toBeNull();
    expect(chip?.getAttribute("title")).toContain("Todavía no hay nada que exportar");
  });

  // Round 2 of the review of PR #97, N2: an export with something held back
  // is not complete until what is held is downloaded too.
  it("says what is held back is still to be downloaded, until it is", async () => {
    const exported = (heldOwed?: number) => {
      const current = store.load();
      if (current.phase !== "ready" || current.source.kind !== "browser") {
        throw new Error("no browser ledger");
      }
      const { heldOwed: _gone, ...rest } = current.source;
      store.setLoad({
        ...current,
        source: {
          ...rest,
          lastExportAt: "2029-07-01T09:00:00.000Z",
          ...(heldOwed === undefined ? {} : { heldOwed }),
        },
      });
    };
    exported(2);
    const host = await showInShell("/", screen);
    const chip = () => host.querySelector(".source");
    expect(text(chip())).toContain("falta descargar lo retenido");
    expect(chip()?.querySelector(".age.is-overdue")).not.toBeNull();
    exported();
    await settle(10);
    expect(text(chip())).toContain("exportado hoy");
    expect(chip()?.querySelector(".age.is-overdue")).toBeNull();
  });
});
