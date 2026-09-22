// The preview of an event on a phone. The name of a row was `nowrap` inside a
// row that could not shrink: a long fund name pushed the card 58 to 248 px past
// a 400 px screen, the page zoomed out, and the "Registrar" button ended up
// under the navigation bar, where a real tap landed on "Núcleo". Measured in
// Chromium at 360 and 400 px with a touch event; this keeps the declarations
// that fixed it.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** A path of the web, from this file: `new URL` is not Node's under happy-dom. */
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../src/styles/components.css"), "utf8");

/** The declarations of one selector of the stylesheet, comments out. */
const declarations = (selector: string): string[] => {
  const found: string[] = [];
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, " ").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (
      (match[1] as string)
        .split(",")
        .map((one) => one.trim())
        .includes(selector)
    ) {
      found.push(...(match[2] as string).split(";").map((one) => one.trim().replace(/\s+/g, " ")));
    }
  }
  return found;
};

describe("the preview fits a phone", () => {
  it("lets a row wrap and its name shrink", () => {
    expect(declarations(".preview .change")).toContain("flex-wrap: wrap");
    expect(declarations(".preview .change .change-name")).toContain("min-width: 0");
    expect(declarations(".preview .change .change-name")).toContain("overflow-wrap: anywhere");
  });
});
