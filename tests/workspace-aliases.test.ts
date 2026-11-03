// The doors of the workspaces are listed once, in the `exports` of each package.json: Vite and
// Vitest derive their aliases from them (`scripts/workspace-aliases.mjs`), and no configuration
// names a door by hand.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { workspaceAliases } from "../scripts/workspace-aliases.mjs";
import { exportsOf, repoRoot } from "./support/source-graph.js";

// Every workspace with doors: all of packages/ and the API. The configurations must name each one.
const WORKSPACES = [
  ...readdirSync(join(repoRoot, "packages")).map((name) => `packages/${name}`),
  "apps/api",
];

describe("the aliases of the workspaces", () => {
  it("give every door of every exports one source file that exists", () => {
    const aliases = workspaceAliases(repoRoot, WORKSPACES);
    const doors = WORKSPACES.flatMap((folder) =>
      Object.keys(JSON.parse(readFileSync(join(repoRoot, folder, "package.json"), "utf8")).exports),
    );
    expect(aliases).toHaveLength(doors.length);
    expect(aliases.filter(({ replacement }) => !existsSync(replacement))).toEqual([]);
    // Exact: a door never matches a longer specifier, so their order does not matter.
    const domain = aliases.find(({ find }) => find.test("@atlas/domain"));
    expect(domain?.find.test("@atlas/domain/fiscal")).toBe(false);
  });

  it("are the only aliases of @atlas in the configurations of Vite and Vitest", () => {
    for (const config of ["vitest.config.ts", "apps/web/vite.config.ts"]) {
      const text = readFileSync(join(repoRoot, config), "utf8");
      expect(text, config).toContain("workspaceAliases(");
      // No door written by hand, as a key or as the `find` of an entry.
      expect(text, config).not.toMatch(/["'`]@atlas\/[\w/-]+["'`]\s*[:,]|find:\s*["'`/]\^?@atlas/);
    }
    // Vitest knows every workspace with doors.
    const vitest = readFileSync(join(repoRoot, "vitest.config.ts"), "utf8");
    for (const folder of WORKSPACES) {
      expect(vitest, folder).toContain(`"${folder}"`);
    }
  });
});
