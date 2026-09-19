// The outline of a field has to be seen against what it sits on: WCAG 1.4.11
// asks 3:1 for the parts of a control that say it is one. It sits on the
// paper of the page and on the surface of a card, in both themes. The first
// value missed the paper by a hair (2,997:1, review of 2026-09-19).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(here, "../src/styles/tokens.css"), "utf8");

/** Every value of a token in the file, in order: light first, then dark. */
const valuesOf = (name: string): string[] =>
  [...tokens.matchAll(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "gi"))].map(
    (match) => match[1] as string,
  );

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  const linear = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r as number) + 0.7152 * linear(g as number) + 0.0722 * linear(b as number);
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

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
