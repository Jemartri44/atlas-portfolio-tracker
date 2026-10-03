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

/**
 * The domain's 100 % is measured **in a pass of its own** (feature 015, E5;
 * `specs/015-api-access/questions.md` §33.5 and §34): merging the coverage of
 * several projects once lost the hits of a whole test file of the domain, and
 * made the 100 % depend on tests of other projects. `npm run test:coverage`,
 * which the CI calls, runs both passes; the second one, with every other
 * project, carries no threshold of the domain.
 */
describe("the coverage of the domain is measured on its own", () => {
  const scripts = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
    .scripts as Record<string, string>;

  it("runs the domain with coverage alone, then every other project, in the script the CI calls", () => {
    expect(scripts["test:coverage"]).toBe("npm run test:coverage:domain && npm run test:others");
    expect(scripts["test:coverage:domain"]).toBe("vitest run --coverage --project domain");
    expect(scripts["test:others"]).toBe("vitest run --project !domain --project !infra");
    // The infrastructure suite has a job of its own in the CI, which installs Terraform.
    expect(scripts["test:infra"]).toBe("vitest run --project infra --pool=forks --maxWorkers=1");
  });

  it("keeps the threshold of 100 % and the coverage of the domain alone in the configuration", () => {
    const config = readFileSync(join(repoRoot, "vitest.config.ts"), "utf8");
    expect(config).toMatch(/include:\s*\["packages\/domain\/src\/\*\*"\]/);
    expect(config).toMatch(
      /thresholds:\s*\{\s*lines:\s*100,\s*branches:\s*100,\s*functions:\s*100,\s*statements:\s*100,?\s*\}/,
    );
  });
});
