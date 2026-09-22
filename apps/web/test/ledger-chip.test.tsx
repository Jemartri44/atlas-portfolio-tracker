// @vitest-environment happy-dom
//
// The chip of the header says where the data live and, in the browser, how old
// the last export is. While there is nothing recorded there is nothing to
// lose, and it says nothing about exporting: a warning with no stake teaches
// the user to ignore the one that will matter.

import { describe, expect, it } from "vitest";
import { openLedger, showInShell, text, withGoldenLedger } from "./helpers/render.jsx";

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
});
