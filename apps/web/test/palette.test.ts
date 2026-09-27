// The palette, checked the way the eye cannot (feature 020, E1, block 1).
//
// `tokens.css` defines every colour three times: the light theme, the dark one
// under the system preference and the dark one forced by the switch. A reader
// of the values "in order of appearance" does not notice a colour defined in
// light and forgotten in `[data-theme="dark"]`, so this one reads the file
// **block by block**, by the selector each colour sits under, and fails on a
// fourth block that declares a colour it would not look at.
//
// The colour vision part simulates protanopia, deuteranopia and tritanopia
// with the matrices of Machado et al. (2009) and measures in OKLab
// (Ottosson 2020): see `helpers/colour-vision.ts` for the sources. The
// simulation itself is checked against what its source publishes, or an
// identity matrix would let every pair pass.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  apply,
  type Deficiency,
  deltaE,
  linear,
  MACHADO_2009,
  oklab,
} from "./helpers/colour-vision.js";
import { cssRules } from "./helpers/css-rules.js";

const here = dirname(fileURLToPath(import.meta.url));
const tokensCss = readFileSync(join(here, "../src/styles/tokens.css"), "utf8");

/** The three places a colour lives, by the path of at-rules and selector. */
const BLOCKS = {
  light: [":root"],
  "dark-system": ["@media (prefers-color-scheme: dark)", ':root:not([data-theme="light"])'],
  "dark-forced": [':root[data-theme="dark"]'],
} as const;
type Block = keyof typeof BLOCKS;

const isColour = (property: string): boolean => property.startsWith("--c-");

/** Every rule of a sheet that declares a colour, with its path. */
const colourRules = (source: string) =>
  cssRules(source).filter((rule) => rule.declarations.some(([property]) => isColour(property)));

const blockOf = (source: string, block: Block): Map<string, string> => {
  const path = JSON.stringify(BLOCKS[block]);
  const rule = colourRules(source).find((candidate) => JSON.stringify(candidate.path) === path);
  if (rule === undefined) {
    throw new Error(`tokens.css no tiene el bloque ${block}`);
  }
  return new Map(rule.declarations.filter(([property]) => isColour(property)));
};

/** The colours that mean something: status and result. Never aliased, never shared. */
const SEMANTIC = [
  "--c-gain",
  "--c-loss",
  "--c-danger",
  "--c-danger-soft",
  "--c-danger-border",
  "--c-caution",
  "--c-caution-icon",
  "--c-caution-soft",
];

/** The only colour that is not a plain `#rrggbb`: a veil needs its alpha. */
const NOT_HEX = { "--c-backdrop": "the veil behind a dialog is translucent by definition" };

/**
 * Colours that may share a value inside one block, **a closed list**, each
 * group with why. Nothing semantic may enter it (tested below): a gain that is
 * "the same as" something else is the door through which the colour of a
 * result ends up on something that is not one.
 */
const SHARED: { names: string[]; why: string }[] = [
  {
    names: ["--c-surface", "--c-raised", "--c-on-accent", "--c-on-danger"],
    why: "in light, a card, the current tab on its track and the text on the accent and on the danger are all white paper",
  },
  {
    names: ["--c-accent", "--c-accent-soft-text"],
    why: "in light, the text on the soft accent is the accent itself",
  },
  {
    names: ["--c-accent-hover", "--c-accent-soft-text"],
    why: "in dark, the text on the soft accent is the lighter accent of the hover",
  },
  {
    names: ["--c-fill", "--c-chart-grid"],
    why: "in dark, the grid of a chart is drawn in the tone of a well",
  },
  {
    names: ["--c-raised", "--c-chart-gap-edge"],
    why: "in dark, the dashed edge of a hole is the tone of the raised tab",
  },
  {
    names: ["--c-class-equity", "--c-series-core"],
    why: "the core series is drawn in the colour of its main asset class, on purpose",
  },
  {
    names: ["--c-class-fixed-income", "--c-series-cash"],
    why: "the cash series borrows the fixed-income colour; they never share a chart",
  },
  {
    names: ["--c-class-gold", "--c-series-bucket"],
    why: "the bucket series borrows the gold colour; they never share a chart",
  },
  {
    names: ["--c-positive", "--c-done"],
    why: "until M6 of feature 020 a completed step wore the colour of a gain",
  },
];

describe("the palette is read block by block", () => {
  it("declares colours in exactly the three blocks, and nowhere else in the file", () => {
    const paths = colourRules(tokensCss).map((rule) => JSON.stringify(rule.path));
    expect(paths.sort()).toEqual(
      Object.values(BLOCKS)
        .map((path) => JSON.stringify(path))
        .sort(),
    );
  });

  it("has every colour in the three blocks", () => {
    const names = (block: Block): string[] => [...blockOf(tokensCss, block).keys()].sort();
    expect(names("dark-system")).toEqual(names("light"));
    expect(names("dark-forced")).toEqual(names("light"));
  });

  it("writes every colour as #rrggbb, save the closed list", () => {
    for (const block of Object.keys(BLOCKS) as Block[]) {
      for (const [name, value] of blockOf(tokensCss, block)) {
        if (name in NOT_HEX) {
          continue;
        }
        expect(value, `${name} en ${block}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("never takes a semantic colour by `var()`, inside the file either", () => {
    const aliases = cssRules(tokensCss).flatMap((rule) =>
      rule.declarations.filter(([, value]) =>
        SEMANTIC.some((name) => new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(value)),
      ),
    );
    expect(aliases).toEqual([]);
  });

  it("gives two colours the same value only inside the closed list, and no semantic colour enters it", () => {
    expect(
      SHARED.flatMap((group) => group.names).filter((name) => SEMANTIC.includes(name)),
    ).toEqual([]);
    const used = new Set<number>();
    for (const block of Object.keys(BLOCKS) as Block[]) {
      const byValue = new Map<string, string[]>();
      for (const [name, value] of blockOf(tokensCss, block)) {
        byValue.set(value, [...(byValue.get(value) ?? []), name]);
      }
      for (const [value, names] of byValue) {
        if (names.length < 2) {
          continue;
        }
        const group = SHARED.findIndex((allowed) =>
          names.every((name) => allowed.names.includes(name)),
        );
        expect(group, `${names.join(" = ")} = ${value} en ${block}`).toBeGreaterThanOrEqual(0);
        used.add(group);
      }
    }
    // A group nobody uses any more is a stale excuse: the list stays closed.
    expect(SHARED.filter((_, index) => !used.has(index)).map((group) => group.names)).toEqual([]);
  });
});

describe("the simulation is the one its source publishes", () => {
  const PRIMARIES = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as const;

  it.each(["protan", "deutan", "tritan"] as Deficiency[])(
    "%s: a linear primary comes out as the published column of the matrix",
    (kind) => {
      const matrix = MACHADO_2009[kind];
      PRIMARIES.forEach((primary, column) => {
        const out = apply(matrix, primary);
        expect(out.map((value) => value.toFixed(6))).toEqual(
          matrix.map((row) => (row[column] as number).toFixed(6)),
        );
      });
      // The source's tables at severity 1 keep white white: each row adds up to one.
      for (const value of apply(matrix, [1, 1, 1])) {
        expect(Math.abs(value - 1)).toBeLessThanOrEqual(0.000002);
      }
    },
  );

  it("the published columns: what the identity or another deficiency would not give", () => {
    // The first column of each table, as printed at the source.
    expect(MACHADO_2009.protan.map((row) => row[0])).toEqual([0.152286, 0.114503, -0.003882]);
    expect(MACHADO_2009.deutan.map((row) => row[0])).toEqual([0.367322, 0.280085, -0.01182]);
    expect(MACHADO_2009.tritan.map((row) => row[0])).toEqual([1.255528, -0.078411, 0.004733]);
  });

  it("OKLab gives the references of its source: white is L 1, black is L 0, both without hue", () => {
    const white = oklab(linear("#ffffff"));
    expect(white[0]).toBeCloseTo(1, 4);
    expect(white[1]).toBeCloseTo(0, 4);
    expect(white[2]).toBeCloseTo(0, 4);
    expect(oklab(linear("#000000"))).toEqual([0, 0, 0]);
  });

  it("reproduces the ΔE the proposal measured on today's colours", () => {
    // docs/design/proposals/2026-09-25-visual-improvements.md §5.1, "Hoy".
    expect(deltaE("#1b6a44", "#a2392b", "deutan")).toBeCloseTo(6.3, 1);
    expect(deltaE("#6fc79a", "#f0917e", "deutan")).toBeCloseTo(4.2, 1);
    expect(deltaE("#a2392b", "#9e2f27")).toBeCloseTo(2.1, 1);
  });
});
