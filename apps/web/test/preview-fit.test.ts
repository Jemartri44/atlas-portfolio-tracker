// @vitest-environment happy-dom
//
// The preview of an event on a phone. The name of a row was `nowrap` inside a
// row that could not shrink: a long fund name pushed the card 58 to 248 px past
// a 400 px screen, the page zoomed out, and the "Registrar" button ended up
// under the navigation bar, where a real tap landed on "Núcleo". Measured in
// Chromium at 360 and 400 px with a touch event; this checks the styles that
// fixed it as they **apply** at that width, not as they are written.

import { afterEach, describe, expect, it } from "vitest";
import { applied, pixels, withoutStyles, withStyles } from "./helpers/styles.js";

afterEach(() => withoutStyles());

describe("the preview fits a phone", () => {
  it("lets a row wrap and its name shrink", () => {
    withStyles(400);
    // The markup of `Preview.tsx`: a list of changes, name and figures.
    document.body.insertAdjacentHTML(
      "beforeend",
      `<ul class="changes"><li class="change"><span class="change-name">Un fondo con un nombre muy largo · Una cuenta</span><span class="values"><span>1</span><span class="arrow">→</span><span>2</span></span></li></ul>`,
    );
    const row = document.querySelector(".change");
    expect(applied(row, "flex-wrap")).toBe("wrap");
    expect(pixels(applied(row?.querySelector(".change-name"), "min-width"))).toBe(0);
    expect(applied(row?.querySelector(".change-name"), "overflow-wrap")).toBe("anywhere");
  });
});
