// @vitest-environment happy-dom
//
// The way back from a page that does not exist is a button of 44px, not a word
// of 24: it is the only thing on the screen to press (review of 2026-09-19).

import { afterEach, describe, expect, it } from "vitest";
import NoExiste from "../src/routes/no-existe.jsx";
import { show, withGoldenLedger } from "./helpers/render.jsx";
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
