// The outline of a field has to be seen against what it sits on: WCAG 1.4.11
// asks 3:1 for the parts of a control that say it is one. It sits on the
// paper of the page and on the surface of a card, in both themes. The first
// value missed the paper by a hair (2,997:1, review of 2026-09-19).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrast } from "./helpers/colour-vision.js";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(here, "../src/styles/tokens.css"), "utf8");

/** Every value of a token in the file, in order: light first, then dark. */
const valuesOf = (name: string): string[] =>
  [...tokens.matchAll(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "gi"))].map(
    (match) => match[1] as string,
  );

describe("the outline of a field", () => {
  it("reaches 3:1 on the paper and on a card, in both themes", () => {
    const borders = valuesOf("--c-border-control");
    const canvases = valuesOf("--c-canvas");
    const surfaces = valuesOf("--c-surface");
    expect(borders.length).toBeGreaterThanOrEqual(2);
    borders.forEach((border, index) => {
      expect(
        contrast(border, canvases[index] as string),
        `${border} on paper`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(border, surfaces[index] as string),
        `${border} on a card`,
      ).toBeGreaterThanOrEqual(3);
    });
  });
});
