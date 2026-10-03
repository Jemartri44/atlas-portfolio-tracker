// The colour of a gain or a loss goes **only on results** (feature 020, E1,
// block 1; proposal of 2026-09-25 §5.4): a gain or a loss realised or latent,
// the result against the index, the averages of the theses and the fiscal
// results built from them. Never on a weight, a deviation, a price, a balance
// or what a fiscal criterion puts at stake (Q6, answered 2026-09-27).
//
// `Amount` and `Figure` colour by sign only when asked with `coloured`; this
// is the closed list of who asks, file by file and with what each one is. A
// new `coloured` anywhere fails here until someone writes down why it is a
// result.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = join(dirname(fileURLToPath(import.meta.url)), "../src");

const files = (dir: string, pattern = /\.tsx$/): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, pattern) : pattern.test(path) ? [path] : [];
  });

/** The two components that paint a figure by its sign; nobody else may. */
const PAINTERS = new Set(["components/Amount.tsx", "components/Figure.tsx"]);

/**
 * Every `class` and `classList` attribute of a piece of markup, with its value
 * whole: a quoted string, or an expression in braces, nested braces included.
 */
const classAttributes = (source: string): string[] => {
  const found: string[] = [];
  for (const match of source.matchAll(/\bclass(?:List)?=/g)) {
    let at = (match.index ?? 0) + match[0].length;
    const open = source.charAt(at);
    if (open === '"' || open === "'") {
      found.push(source.slice(at + 1, source.indexOf(open, at + 1)));
      continue;
    }
    if (open !== "{") {
      continue;
    }
    let depth = 0;
    const start = at;
    for (; at < source.length; at += 1) {
      const character = source.charAt(at);
      depth += character === "{" ? 1 : character === "}" ? -1 : 0;
      if (depth === 0) {
        break;
      }
    }
    found.push(source.slice(start, at + 1));
  }
  return found;
};

/** Where the colour is asked for, and what each place colours. */
const RESULTS: Record<string, { count: number; what: string }> = {
  "components/ClosedYearNotice.tsx": {
    count: 2,
    what: "a declared fiscal figure before and after",
  },
  "routes/cubo/BudgetCard.tsx": {
    count: 2,
    what: "the realised and the latent result of the bucket",
  },
  "routes/cubo/PositionsCard.tsx": {
    count: 4,
    what: "the latent gain of a position, amount and %, and the % that stands for it",
  },
  "routes/cubo/StatsCard.tsx": {
    count: 6,
    what: "the result against the index and the averages of won and lost theses",
  },
  "routes/cubo/ThesesCard.tsx": {
    count: 4,
    what: "the result, latent and against the index, of a thesis, and its % over what was invested",
  },
  "routes/fiscal/BaseCard.tsx": { count: 4, what: "the savings base and its gains and losses" },
  "routes/fiscal/FilingCard.tsx": {
    count: 3,
    what: "a filed result, today's and where the difference comes from",
  },
  "routes/fiscal/LossesCard.tsx": { count: 3, what: "the losses pending compensation" },
  "routes/movimientos/DetailFields.tsx": { count: 3, what: "what a sale produced" },
  "routes/registrar/Preview.tsx": { count: 1, what: "the result a sale would produce" },
};

const asked = (source: string): number =>
  source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .reduce((sum, line) => sum + (line.match(/\bcoloured\b(?!\?)/g) ?? []).length, 0);

describe("the colour of a result goes only on results", () => {
  it("is asked for only by the closed list of places that show one", () => {
    const found: Record<string, number> = {};
    for (const path of files(src)) {
      const name = relative(src, path);
      if (name === "components/Amount.tsx" || name === "components/Figure.tsx") {
        continue;
      }
      const count = asked(readFileSync(path, "utf8"));
      if (count > 0) {
        found[name] = count;
      }
    }
    expect(found).toEqual(
      Object.fromEntries(Object.entries(RESULTS).map(([name, entry]) => [name, entry.count])),
    );
  });

  it("is never written as a sign class by hand, outside the two components that paint by sign", () => {
    // Round 1 of the review of PR #105, B2: a `class="positive"` on attention
    // went through every guardian, because they only looked at `coloured`.
    const written = files(src)
      .map((path) => [relative(src, path), readFileSync(path, "utf8")] as const)
      .filter(([name]) => !PAINTERS.has(name))
      .flatMap(([name, source]) =>
        classAttributes(source)
          .filter((value) => /\b(positive|negative)\b/.test(value))
          .map((value) => `${name}: ${value}`),
      );
    expect(written).toEqual([]);
  });

  it("is not asked of the sign of a value outside the two components that paint by sign", () => {
    const asking = files(src, /\.(ts|tsx)$/)
      .map((path) => [relative(src, path), readFileSync(path, "utf8")] as const)
      .filter(([name]) => !PAINTERS.has(name))
      .filter(([, source]) => /\bsignOf\s*\(/.test(source))
      .map(([name]) => name);
    expect(asking).toEqual([]);
  });
});
