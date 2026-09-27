// Where the colours of a gain and a loss may appear (feature 020, E1, block
// 1). They are the colours of **results** and nothing else: the proposal of
// 2026-09-25 (§5.4) keeps weights, deviations, prices and balances in ink.
//
// Recognised by identity, not by resemblance: the exact rules of the exact
// sheet that paint a result, and no custom property anywhere that carries one
// of them under another name — an alias is the way round every other rule.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cssRules } from "./helpers/css-rules.js";

const src = join(dirname(fileURLToPath(import.meta.url)), "../src");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const sources = walk(src).filter((path) => /\.(css|ts|tsx)$/.test(path));
const sheets = sources.filter((path) => path.endsWith(".css"));

const RESULT_COLOURS = /var\(\s*--c-(gain|loss)\s*[,)]/;

/** The only rules that paint with a result colour: the sign classes `Amount` and `Figure` set. */
const RESULT_RULES = [
  { sheet: "styles/base.css", selector: ".positive" },
  { sheet: "styles/base.css", selector: ".negative" },
];

describe("the colours of a gain and a loss", () => {
  it("left no trace of the colours they replaced", () => {
    const left = sources
      .filter((path) => /--c-(positive|negative)\b/.test(readFileSync(path, "utf8")))
      .map((path) => relative(src, path));
    expect(left).toEqual([]);
  });

  it("are painted only by the rules of a result", () => {
    const painting = sheets.flatMap((path) =>
      cssRules(readFileSync(path, "utf8"))
        .filter((rule) => rule.declarations.some(([, value]) => RESULT_COLOURS.test(value)))
        .map((rule) => ({ sheet: relative(src, path), selector: rule.path.join(" ") })),
    );
    expect(painting).toEqual(RESULT_RULES);
  });

  it("are never carried by another custom property, in any sheet", () => {
    const aliases = sheets.flatMap((path) =>
      cssRules(readFileSync(path, "utf8")).flatMap((rule) =>
        rule.declarations
          .filter(([property, value]) => property.startsWith("--") && RESULT_COLOURS.test(value))
          .map(([property]) => `${relative(src, path)}: ${property}`),
      ),
    );
    expect(aliases).toEqual([]);
  });

  it("are never named by the code: the chart and the markup get them only through a sign class", () => {
    const named = sources
      .filter((path) => !path.endsWith(".css"))
      .filter((path) => /--c-(gain|loss)\b/.test(readFileSync(path, "utf8")))
      .map((path) => relative(src, path));
    expect(named).toEqual([]);
  });

  it("are not copied by value either: no sheet or code writes their hex, nor the danger's", () => {
    // Round 1 of the review of PR #105, N4: `.meta { color: #0f6b5c }` was a
    // gain on a non-result that no guardian saw. The values are read from
    // `tokens.css`, all three blocks, so a change of palette moves this too.
    const tokens = readFileSync(join(src, "styles/tokens.css"), "utf8");
    const values = new Set<string>();
    for (const rule of cssRules(tokens)) {
      for (const [property, value] of rule.declarations) {
        if (["--c-gain", "--c-loss", "--c-danger"].includes(property)) {
          values.add(value.toLowerCase());
        }
      }
    }
    expect(values.size).toBe(6);
    const copies = sources
      .filter((path) => !path.endsWith("styles/tokens.css"))
      .flatMap((path) => {
        const text = readFileSync(path, "utf8").toLowerCase();
        return [...values]
          .filter((value) => new RegExp(`${value}(?![0-9a-f])`).test(text))
          .map((value) => `${relative(src, path)}: ${value}`);
      });
    expect(copies).toEqual([]);
  });
});
