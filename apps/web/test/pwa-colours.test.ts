// The installed application paints its splash and the system bar before any
// stylesheet loads, from the manifest and the meta tags. They used to keep the
// navy of the first palette: on Android the bar and the start came out navy
// over a page of paper (review of 2026-09-19). Now they are read from the
// tokens, so a change of palette that forgets them fails here.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string): string => readFileSync(join(here, path), "utf8");
const tokens = read("../src/styles/tokens.css");
const config = read("../vite.config.ts");
const html = read("../index.html");

/** The values of a token, light first and dark after. */
const token = (name: string): string[] =>
  [...tokens.matchAll(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "gi"))].map((m) => m[1] as string);

describe("the colours of the installed application", () => {
  it("start on the paper and paint the bar like the top bar", () => {
    const [canvas] = token("--c-canvas");
    const [surface, darkSurface] = token("--c-surface");
    expect(config).toContain(`background_color: "${canvas}"`);
    expect(config).toContain(`theme_color: "${surface}"`);
    expect(html).toContain(`content="${surface}" media="(prefers-color-scheme: light)"`);
    expect(html).toContain(`content="${darkSurface}" media="(prefers-color-scheme: dark)"`);
    expect(`${config}${html}`).not.toContain("#0b1220");
  });
});
