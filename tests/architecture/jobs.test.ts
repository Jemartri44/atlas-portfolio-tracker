import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  apiRoot,
  chainText,
  domainRoot,
  listSources,
  parse as parsedSource,
  specifiersOf as parsedSpecifiersOf,
  productSources,
  reach,
  webReach,
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
describe("architecture: apps/jobs", () => {
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
    // It parses every source and test of the repo: 3-4.7 s measured under a load of 9, 5 s limit.
  }, 20_000);
});

describe("jobs: two rules of the January and mail tasks", () => {
  /**
   * No price reaches the fiscal path, not even a warning (ADR-0031, second amendment): the income
   * tax and the thresholds of the 720 and 721 are decided in the domain by functions that take the
   * ledger and the day, and reach nothing price-aware.
   */
  it("decides the income tax and the 720 in the domain with nothing price-aware", () => {
    const sep = String.raw`[/\\]`;
    const priceAware = new RegExp(
      `${sep}domain${sep}src${sep}(projections${sep}prices\\.ts$|quotes(\\.ts$|${sep}))`,
    );
    const priceAwareIn = (file: string): string[] =>
      [...reach([join(domainRoot, "src", "jobs", file)])]
        .filter(([reached]) => priceAware.test(reached))
        .map(([, chain]) => chainText(chain));
    for (const file of ["informative.ts", "tax-return.ts"]) {
      expect(reach([join(domainRoot, "src", "jobs", file)]).size, file).toBeGreaterThan(5);
      expect(priceAwareIn(file), file).toEqual([]);
    }
    // Not vacuous: the weekly review, which values with the closes, does reach them.
    expect(priceAwareIn("review.ts").length).toBeGreaterThan(0);
  });

  /**
   * The switch of the amounts lives in SSM (ADR-0028, row 18). Only the mail task reads it, with the
   * rule of the domain: a second reader could read «present = on» and the mail would leave with
   * amounts.
   */
  it("names the parameter of the switch of amounts only in the composition of the mail task", () => {
    const readers = productSources().filter((file) =>
      /mail\/amounts/.test(parsedSource(file).code),
    );
    expect(readers.map((file) => relative(repoRoot, file))).toEqual([
      "apps/jobs/src/tasks/mail.ts",
    ]);
  });
});

describe("jobs: mail and keys out of the API and the web, and the clock injected", () => {
  const sep = String.raw`[/\\]`;
  const adapters = (...names: string[]): string =>
    `${sep}adapters${sep}src${sep}${names.join(sep)}`;
  /** What sends mail and the port that says what a mail is; what reads the keys of the price sources. */
  const MAIL_AND_KEYS = new RegExp(
    `${adapters("aws")}${sep}(sdk-ses|mail|price-keys)\\.ts$|${adapters("prices")}${sep}(eodhd|secrets)\\.ts$|${sep}domain${sep}src${sep}ports${sep}notifier\\.ts$`,
  );
  const reachedBy = (reached: Map<string, string[]>): string[] =>
    [...reached]
      .filter(([file]) => file.startsWith("<") || MAIL_AND_KEYS.test(file))
      .map(([, chain]) => chainText(chain));

  it("keeps the mail and the keys of the sources out of the API and the web", () => {
    const api = reach([join(apiRoot, "src", "lambda.ts"), ...listSources(join(apiRoot, "src"))]);
    expect(api.size).toBeGreaterThan(1);
    expect(reachedBy(api)).toEqual([]);
    expect(reachedBy(webReach())).toEqual([]);
    const sesv2 = productSources().filter(
      (file) =>
        parsedSource(file).specifiers.some((specifier) =>
          specifier.startsWith("@aws-sdk/client-sesv2"),
        ) && !/[/\\]adapters[/\\]src[/\\]aws[/\\]sdk-ses\.ts$/.test(file),
    );
    expect(sesv2.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  /**
   * The «today» decides fiscal deadlines, so the domain and the jobs never read the real time: the
   * clock adapter does, and the compositions inject it. `globalThis.Date`, `Reflect.construct(Date`
   * and taking `Date` apart reach the same clock.
   */
  const REAL_TIME =
    /\bnew\s+(?:globalThis\s*\.\s*)?Date\s*\(\s*\)|\bDate\s*\.\s*now\b|\bglobalThis\s*\.\s*Date\b|\bReflect\s*\.\s*construct\s*\(\s*(?:globalThis\s*\.\s*)?Date\b|=\s*Date\s*[;,)]|\}\s*=\s*Date\b/;

  it("reads the real time neither in the domain nor in the jobs", () => {
    const files = [
      ...listSources(join(domainRoot, "src")),
      ...listSources(join(repoRoot, "apps", "jobs", "src")),
    ];
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.filter((file) => REAL_TIME.test(parsedSource(file).code));
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  it("catches every way of reaching the clock it names", () => {
    for (const code of [
      "const at = new Date();",
      "const at = new globalThis.Date();",
      "const ms = Date.now();",
      "const D = globalThis.Date;",
      "const at = Reflect.construct(Date, []);",
      "const { now } = Date;",
      "const Clock = Date;",
    ]) {
      expect(REAL_TIME.test(code), code).toBe(true);
    }
    for (const code of ["new Date(now)", "Date.parse(text)", "Date.UTC(2026, 0, 1)"]) {
      expect(REAL_TIME.test(code), code).toBe(false);
    }
  });
});
