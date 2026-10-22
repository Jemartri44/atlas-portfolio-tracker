import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  listSources,
  parse as parsedSource,
  specifiersOf as parsedSpecifiersOf,
} from "../support/source-graph.js";
import { repoRoot } from "./support.js";

/**
 * **The sync of the ledger**: the guards are in place before a line of the engine exists, and
 * everything is read off folders and off the import graph, never off a list of today's files.
 */
/**
 * The scheduled jobs are a workspace of their own, `apps/jobs`. Like every application it imports
 * the domain and the adapters; unlike the others **nothing imports it** — not the domain, not the
 * adapters, not another application, not a test outside it — so the code that holds the keys of the
 * sources and the permission of SES is never bundled into anything else. Read with the parser
 * (static, re-exports and literal `import()`), and a dynamic import whose argument is not a literal
 * is refused outright in `apps/jobs/src`, since no graph can follow it.
 */
describe("architecture: apps/jobs (016)", () => {
  const jobsRoot = join(repoRoot, "apps", "jobs");
  const jobsSrc = join(jobsRoot, "src");
  const insideJobs = (from: string, specifier: string): boolean =>
    specifier.startsWith(".") &&
    !relative(jobsRoot, resolve(dirname(from), specifier)).startsWith("..");

  it("depends at runtime on the domain and the adapters, and imports nothing else", () => {
    const manifest = JSON.parse(readFileSync(join(jobsRoot, "package.json"), "utf8")) as {
      name: string;
      dependencies?: Record<string, string>;
    };
    expect(manifest.name).toBe("@atlas/jobs");
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      "@atlas/adapters",
      "@atlas/domain",
    ]);
    const files = listSources(jobsSrc);
    expect(files.length).toBeGreaterThan(2);
    const violations = files.flatMap((file) => {
      const parsed = parsedSource(file);
      const literal = parsed.bindings.filter((binding) => binding.how === "dynamic").length;
      const opaque =
        parsed.dynamicImports > literal
          ? [`${relative(repoRoot, file)} -> import(<not a literal>)`]
          : [];
      return [
        ...opaque,
        ...parsedSpecifiersOf(file)
          .filter(
            (specifier) =>
              !insideJobs(file, specifier) &&
              !/^@atlas\/(domain|adapters)(\/[a-z-]+)?$/.test(specifier) &&
              !specifier.startsWith("node:"),
          )
          .map((specifier) => `${relative(repoRoot, file)} -> ${specifier}`),
      ];
    });
    expect(violations).toEqual([]);
  });

  it("is imported by nothing: no package, no other application, no test outside it", () => {
    const roots = [
      join(repoRoot, "packages", "domain", "src"),
      join(repoRoot, "packages", "domain", "test"),
      join(repoRoot, "packages", "adapters", "src"),
      join(repoRoot, "packages", "adapters", "test"),
      join(repoRoot, "apps", "api", "src"),
      join(repoRoot, "apps", "api", "test"),
      join(repoRoot, "apps", "cli", "src"),
      join(repoRoot, "apps", "cli", "test"),
      join(repoRoot, "apps", "web", "src"),
      join(repoRoot, "apps", "web", "test"),
      join(repoRoot, "tests"),
    ];
    const files = roots.flatMap((root) => listSources(root));
    expect(files.length).toBeGreaterThan(100);
    const violations = files.flatMap((file) =>
      parsedSpecifiersOf(file)
        .filter(
          (specifier) =>
            specifier === "@atlas/jobs" ||
            specifier.startsWith("@atlas/jobs/") ||
            (specifier.startsWith(".") &&
              !relative(jobsRoot, resolve(dirname(file), specifier)).startsWith("..")),
        )
        .map((specifier) => `${relative(repoRoot, file)} -> ${specifier}`),
    );
    expect(violations).toEqual([]);
    const manifests = ["packages/domain", "packages/adapters", "apps/api", "apps/cli", "apps/web"]
      .map((dir) => [dir, readFileSync(join(repoRoot, dir, "package.json"), "utf8")] as const)
      .filter(([, text]) => text.includes("@atlas/jobs"))
      .map(([dir]) => dir);
    expect(manifests).toEqual([]);
  });
});
