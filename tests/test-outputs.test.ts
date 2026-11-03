// Every folder a `tsconfig` compiles into is out of the reach of vitest: the compiled twin of a
// test (`dist-test-browser/browser.test.js`) would run a second time after `npm run build`, and the
// counts of two runs would differ for no reason.

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

/**
 * Each measured area runs **in a pass of its own**: merging the coverage of several projects once
 * lost the hits of a whole test file of the domain, and made the 100 % depend on tests of other
 * projects. `npm run test:coverage`, which the CI calls, runs every pass; the last one, with every
 * other project, carries no threshold.
 */
describe("the coverage of each area is measured on its own", () => {
  const scripts = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
    .scripts as Record<string, string>;

  it("runs each area with coverage alone, then every other project, in the script the CI calls", () => {
    expect(scripts["test:coverage"]).toBe(
      "npm run test:coverage:domain && npm run test:coverage:access && npm run test:coverage:api-access && npm run test:others",
    );
    expect(scripts["test:coverage:domain"]).toBe(
      "ATLAS_COVERAGE=domain vitest run --coverage --project domain",
    );
    expect(scripts["test:coverage:access"]).toBe(
      "ATLAS_COVERAGE=access vitest run --coverage --project access",
    );
    expect(scripts["test:coverage:api-access"]).toBe(
      "ATLAS_COVERAGE=api-access vitest run --coverage --project api",
    );
    // `api` runs in its own pass above, with the coverage of the access of the API.
    expect(scripts["test:others"]).toBe(
      "vitest run --project adapters --project cli --project jobs --project web --project repo",
    );
    // The infrastructure suite has a job of its own in the CI, which installs Terraform.
    expect(scripts["test:infra"]).toBe("vitest run --project infra --pool=forks --maxWorkers=1");
  });

  it("keeps 100 % on what computes figures and on the access, 90 % elsewhere in the domain", () => {
    const config = readFileSync(join(repoRoot, "vitest.config.ts"), "utf8");
    expect(config).toMatch(
      /const FULL = \{ lines: 100, branches: 100, functions: 100, statements: 100 \}/,
    );
    expect(config).toMatch(
      /const MOST = \{ lines: 90, branches: 90, functions: 90, statements: 90 \}/,
    );
    expect(config).toMatch(/include:\s*\["packages\/domain\/src\/\*\*"\]/);
    expect(config).toMatch(/\["money",\s*"projections",\s*"tax",\s*"informative",\s*"dates"\]/);
    expect(config).toMatch(
      /access: \{ include: \["packages\/access\/src\/\*\*"\], thresholds: FULL \}/,
    );
    expect(config).toMatch(
      /"api-access": \{ include: \["apps\/api\/src\/access\/\*\*"\], thresholds: FULL \}/,
    );
  });
});
