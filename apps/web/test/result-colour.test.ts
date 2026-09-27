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

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".tsx") ? [path] : [];
  });

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
    count: 3,
    what: "the latent gain of a position, amount and %",
  },
  "routes/cubo/StatsCard.tsx": {
    count: 6,
    what: "the result against the index and the averages of won and lost theses",
  },
  "routes/cubo/ThesesCard.tsx": {
    count: 3,
    what: "the result, latent and against the index, of a thesis",
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
});
