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

/** Every colour written in a text, in hex of 3, 4, 6 or 8 digits or `rgb()`/`rgba()`, as #rrggbb. */
const coloursIn = (text: string): { written: string; rgb: string }[] => {
  const hex = (value: number): string => value.toString(16).padStart(2, "0");
  const found: { written: string; rgb: string }[] = [];
  for (const match of text.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z])/gi)) {
    const digits = (match[1] as string).toLowerCase();
    const long = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join("") : digits;
    found.push({ written: match[0], rgb: `#${long.slice(0, 6)}` });
  }
  for (const match of text.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})[^)]*\)/gi)) {
    const [red, green, blue] = [match[1], match[2], match[3]].map(Number) as [
      number,
      number,
      number,
    ];
    found.push({ written: match[0], rgb: `#${hex(red)}${hex(green)}${hex(blue)}` });
  }
  return found;
};

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

  it("are not copied by value either: no sheet or code writes their colour, nor the danger's", () => {
    // Round 1 of the review of PR #105, N4: `.meta { color: #0f6b5c }` was a
    // gain on a non-result that no guardian saw. Round 2, O3: nor in another
    // notation — `#0f6b5cff`, `#0f6b5c` shortened, `rgb(15, 107, 92)` — so
    // every colour written in the sources is normalised before comparing. The
    // values are read from `tokens.css`, all three blocks.
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
      .flatMap((path) =>
        coloursIn(readFileSync(path, "utf8"))
          .filter((colour) => values.has(colour.rgb))
          .map((colour) => `${relative(src, path)}: ${colour.written}`),
      );
    expect(copies).toEqual([]);
  });

  it("normalises every notation of a colour to #rrggbb", () => {
    expect(coloursIn("#0f6b5c #0F6B5C #0f6b5cff #abc #abcd").map((colour) => colour.rgb)).toEqual([
      "#0f6b5c",
      "#0f6b5c",
      "#0f6b5c",
      "#aabbcc",
      "#aabbcc",
    ]);
    expect(
      coloursIn("rgb(15,107,92) rgb(15 107 92) rgba(15, 107, 92, 0.5) rgb(15 107 92 / 50%)").map(
        (colour) => colour.rgb,
      ),
    ).toEqual(["#0f6b5c", "#0f6b5c", "#0f6b5c", "#0f6b5c"]);
  });
});
