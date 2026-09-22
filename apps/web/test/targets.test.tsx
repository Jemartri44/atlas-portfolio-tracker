// @vitest-environment happy-dom
//
// The way back from a page that does not exist is a button of 44px, not a word
// of 24: it is the only thing on the screen to press (review of 2026-09-19).

import { afterEach, describe, expect, it } from "vitest";
import NoExiste from "../src/routes/no-existe.jsx";
import { show, showInShell, withGoldenLedger } from "./helpers/render.jsx";
import { applied, pixels, withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => withoutStyles());

describe("the page that does not exist", () => {
  it("offers the way back as a full target", async () => {
    withStyles(400);
    const host = await show("/no-existe", NoExiste);
    const back = host.querySelector('a[href="/"]');
    expect(back?.getAttribute("role")).toBe("button");
    expect(pixels(applied(back, "min-height"))).toBeGreaterThanOrEqual(44);
  });
});

describe("the brand of the top bar", () => {
  it("is a full target where it shows the mark alone, from 1200 to 1439px", async () => {
    withStyles(1280, 800);
    const host = await showInShell("/", { "/": () => <p>resumen</p> });
    const brand = host.querySelector(".brand");
    expect(pixels(applied(brand, "min-width"))).toBeGreaterThanOrEqual(44);
    expect(pixels(applied(brand, "min-height"))).toBeGreaterThanOrEqual(44);
  });
});
