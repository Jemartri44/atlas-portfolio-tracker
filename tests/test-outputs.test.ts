// Every folder a `tsconfig` compiles into is out of the reach of vitest: the
// compiled twin of a test (`dist-test-browser/browser.test.js`) would run a
// second time after `npm run build`, and the counts of two runs would differ
// for no reason (review of PR #95, round 2).

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const tsconfigs = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith("dist")) {
      return [];
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return tsconfigs(path);
    }
    return /^tsconfig.*\.json$/.test(entry.name) ? [path] : [];
  });

describe("vitest leaves out every compiled folder", () => {
  it("excludes the outDir of each tsconfig of the workspaces and of tests/", () => {
    const config = readFileSync(join(repoRoot, "vitest.config.ts"), "utf8");
    const exclude = /exclude:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? "";
    const outDirs = new Set(
      ["packages", "apps", "tests"]
        .flatMap((top) => tsconfigs(join(repoRoot, top)))
        .map((path) => /"outDir":\s*"([^"]+)"/.exec(readFileSync(path, "utf8"))?.[1])
        .filter((outDir): outDir is string => outDir !== undefined),
    );
    expect(outDirs.has("dist-test-browser")).toBe(true);
    for (const outDir of outDirs) {
      expect(exclude, outDir).toContain(`"**/${outDir}/**"`);
    }
  });
});
