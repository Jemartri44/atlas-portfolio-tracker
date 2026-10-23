import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { exportsOf as sharedExportsOf } from "../support/source-graph.js";
import {
  domainSrc,
  listSourceFiles,
  listTsFiles,
  repoRoot,
  specifiersOf,
  webSrc,
} from "./support.js";

// ---------------------------------------------------------------------------
// Nobody writes over a filed return in silence.
// ---------------------------------------------------------------------------

/**
 * The **fact** that a write reaches a closed year comes free with the use case
 * (`RecordResult.closed`), so the domain cannot forget it. The **figure** —how
 * much of what was declared moves— is put on by each interface, because it is
 * the interface that decides when to say it, and an interface that forgets is
 * exactly the silence ADR-0020 forbids.
 *
 * So the writers are enumerated here, by hand and by name:
 *
 *   - the list is **closed**: a third interface (an API, a bot, an importer)
 *     breaks this test the day it imports a write use case, and the only way
 *     to make it green is to add it to the list, which is the moment someone
 *     has to ask whether it warns;
 *   - and every one of them has to **reach** `closedYearImpact`, through its
 *     own imports at any depth, which is what a module that only records has
 *     to acquire.
 *
 * Reaching it is a necessary condition, not a sufficient one: what the user
 * reads is checked by the tests of each interface (`apps/cli/test/commands/
 * closed-year.test.ts`). What this catches is the whole flow going in with no
 * way of saying it at all.
 */
/**
 * The fiscal output has a **door of its own**, `@atlas/domain/fiscal`, and the
 * barrel does not re-export it.
 *
 * This is not tidiness, it is 21 KB gzip on the boot path of the web, measured:
 * `index.ts` is the module the first screen imports, so anything it exports
 * and any screen uses ends up in the chunk the browser downloads before
 * painting. While nothing used the tax engine, tree shaking hid the problem;
 * the day the fiscal screen imported `taxYear` from the barrel the boot went
 * from 72,5 to 93,3 KB against a ceiling of 74, and `check-bundle.mjs` refused
 * the build.
 *
 * `check-bundle.mjs` already reads the source maps of the boot chunks and
 * fails if `tax/` or `informative/` is inside. This says the same thing one
 * step earlier, where it is cheap to read and cheap to fix: the barrel names
 * neither of them, nor the two modules of `filings/` that reach the tax chain.
 */
describe("architecture: the fiscal output is not in the barrel", () => {
  it("keeps the tax engine, the informative returns and the comparison out of index.ts", () => {
    const barrel = readFileSync(join(domainSrc, "index.ts"), "utf8");
    const offenders = specifiersOf(barrel).filter((specifier) =>
      /\.\/(tax|informative)\/|\.\/filings\/(closed-years|comparison)/.test(specifier),
    );
    expect(offenders).toEqual([]);
    // And the door exists and is the one that names them.
    const door = specifiersOf(readFileSync(join(domainSrc, "fiscal.ts"), "utf8"));
    expect(door.some((specifier) => specifier.includes("./tax/"))).toBe(true);
    expect(door.some((specifier) => specifier.includes("./informative/"))).toBe(true);
  });
});

describe("architecture: the ECB is not in the barrel", () => {
  /**
   * Nothing of the ECB on the boot path of the web. The barrel is on it, so the ECB lives behind a
   * door of its own (`@atlas/domain/ecb`), like the fiscal output; `check-bundle.mjs` checks the
   * real output, and this checks the source.
   */
  it("keeps the ECB and the local configuration out of index.ts", () => {
    const barrel = readFileSync(join(domainSrc, "index.ts"), "utf8");
    const offenders = specifiersOf(barrel).filter((specifier) =>
      /\.\/(ecb|config)\/|\.\/ecb\.js/.test(specifier),
    );
    expect(offenders).toEqual([]);
    const door = specifiersOf(readFileSync(join(domainSrc, "ecb.ts"), "utf8"));
    expect(door.some((specifier) => specifier.includes("./ecb/"))).toBe(true);
  });
});

describe("architecture: the tools of the screens on demand are not in the barrel", () => {
  /**
   * The draft of a corporate action, the deep check and the simulation of a transfer live behind
   * `@atlas/domain/tools`. They rode in the barrel onto the boot path of the web for screens opened
   * now and then (2.166 B gzip of boot); the barrel never exports them again, and no other module
   * of the domain imports them.
   */
  const TOOLS =
    /\.\/(projections\/)?(corporate-action-draft|deep-check|simulate-transfer)\.js$|\.\/tools\.js$/;

  it("keeps them out of index.ts, and behind their door", () => {
    const barrel = readFileSync(join(domainSrc, "index.ts"), "utf8");
    expect(specifiersOf(barrel).filter((specifier) => TOOLS.test(specifier))).toEqual([]);
    const door = specifiersOf(readFileSync(join(domainSrc, "tools.ts"), "utf8"));
    expect(door.filter((specifier) => TOOLS.test(specifier))).toHaveLength(3);
  });

  it("is imported by no other module of the domain", () => {
    const own = new Set(
      [
        "tools.ts",
        "projections/corporate-action-draft.ts",
        "projections/deep-check.ts",
        "projections/simulate-transfer.ts",
      ].map((file) => join(domainSrc, file)),
    );
    const offenders = listTsFiles(domainSrc)
      .filter((file) => !own.has(file))
      .filter((file) =>
        specifiersOf(readFileSync(file, "utf8")).some((specifier) => TOOLS.test(specifier)),
      )
      .map((file) => relative(repoRoot, file));
    expect(offenders).toEqual([]);
  });
});

describe("architecture: the charts of the screens on demand are not in the barrel", () => {
  /**
   * The gauges of the bucket and the percentages of its theses live behind `@atlas/domain/charts`.
   * The barrel never exports them, no other module of the domain imports them, and
   * `check-bundle.mjs` keeps the door and its folder off the boot path (LAZY_ONLY).
   */
  const CHARTS = /(?:^|\/)charts(?:\.js|\/)/;

  it("keeps them out of index.ts, and behind their door", () => {
    const barrel = readFileSync(join(domainSrc, "index.ts"), "utf8");
    expect(specifiersOf(barrel).filter((specifier) => CHARTS.test(specifier))).toEqual([]);
    const door = specifiersOf(readFileSync(join(domainSrc, "charts.ts"), "utf8"));
    expect(door.some((specifier) => specifier.includes("./charts/"))).toBe(true);
  });

  it("is imported by no other module of the domain", () => {
    const own = new Set(
      listTsFiles(join(domainSrc, "charts")).concat(join(domainSrc, "charts.ts")),
    );
    const offenders = listTsFiles(domainSrc)
      .filter((file) => !own.has(file))
      .filter((file) =>
        specifiersOf(readFileSync(file, "utf8")).some((specifier) => CHARTS.test(specifier)),
      )
      .map((file) => relative(repoRoot, file));
    expect(offenders).toEqual([]);
  });

  it("is in LAZY_ONLY of the check of the bundle, door and folder", () => {
    const script = readFileSync(
      join(repoRoot, "apps", "web", "scripts", "check-bundle.mjs"),
      "utf8",
    );
    for (const path of ["/packages/domain/src/charts.ts", "/packages/domain/src/charts/"]) {
      expect(script).toContain(`path: "${path}"`);
    }
  });
});

describe("architecture: the analysis of the Cartera and the Cubo is behind its door", () => {
  /**
   * The contribution, the costs, the statistics of the bucket and its theses against the index
   * are read by two screens opened on demand. The barrel exports their types and never their
   * functions (a function re-exported there is reachable from boot, whatever the chunk rules
   * say), and `check-bundle.mjs` keeps the door and its modules off the boot path.
   */
  const FUNCTIONS = ["bucketStats", "bucketTheses", "contributionPlan", "costSummary"];
  const MODULES = ["bucket-theses", "bucket-stats", "costs", "contribution"];

  it("keeps their functions out of index.ts, and behind their door", () => {
    const barrel = readFileSync(join(domainSrc, "index.ts"), "utf8");
    const door = readFileSync(join(domainSrc, "portfolio.ts"), "utf8");
    for (const name of FUNCTIONS) {
      expect(barrel).not.toMatch(new RegExp(`^\\s+${name},?$`, "m"));
      expect(door).toMatch(new RegExp(`^\\s+${name},?$`, "m"));
    }
  });

  it("is imported by nothing that boots: the door, the charts, the jobs and each other", () => {
    const own = new Set(
      [
        "portfolio.ts",
        ...MODULES.map((name) => `projections/${name}.ts`),
        ...listTsFiles(join(domainSrc, "charts")).map((file) => relative(domainSrc, file)),
        "charts.ts",
        "index.ts",
      ].map((file) => join(domainSrc, file)),
    );
    const offenders = listTsFiles(domainSrc)
      .filter((file) => !own.has(file) && !file.startsWith(join(domainSrc, "jobs")))
      .filter((file) =>
        specifiersOf(readFileSync(file, "utf8")).some((specifier) =>
          MODULES.some((name) => specifier.endsWith(`/${name}.js`)),
        ),
      )
      .map((file) => relative(repoRoot, file));
    expect(offenders).toEqual([]);
  });

  it("is in LAZY_ONLY of the check of the bundle, door and modules", () => {
    const script = readFileSync(
      join(repoRoot, "apps", "web", "scripts", "check-bundle.mjs"),
      "utf8",
    );
    for (const path of [
      "/packages/domain/src/portfolio.ts",
      ...MODULES.map((name) => `/packages/domain/src/projections/${name}.ts`),
    ]) {
      expect(script).toContain(`path: "${path}"`);
    }
  });
});

describe("architecture: the automatic prices are not in the barrel", () => {
  /**
   * Nothing of the automatic prices on the boot path of the web. They live behind a door of their
   * own (`@atlas/domain/quotes`), like the ECB; `check-bundle.mjs` checks the real output, and this
   * the source.
   */
  it("keeps the quotes and the ports of prices out of index.ts", () => {
    const barrel = readFileSync(join(domainSrc, "index.ts"), "utf8");
    const offenders = specifiersOf(barrel).filter((specifier) =>
      /\.\/quotes\/|\.\/quotes\.js|\.\/ports\/price-(?:source|store)\.js/.test(specifier),
    );
    expect(offenders).toEqual([]);
    const door = specifiersOf(readFileSync(join(domainSrc, "quotes.ts"), "utf8"));
    expect(door.some((specifier) => specifier.includes("./quotes/"))).toBe(true);
  });
});

describe("architecture: the ECB and the prices are downloaded by the console only", () => {
  const adapters = join(repoRoot, "packages", "adapters");
  const adaptersSrc = join(adapters, "src");

  /**
   * Every file of the adapters the web can bundle: what each subpath of `exports` points at, **read
   * off `package.json`, excluding `"."`** (the barrel of Node), and everything those files import,
   * at any depth. A subpath added tomorrow is looked at without anybody writing it here.
   */
  const webReachableAdapters = (): string[] => {
    // Every condition of each export, one module or a failure.
    const pending = [...sharedExportsOf(adapters)]
      .filter(([subpath]) => subpath !== ".")
      .map(([, source]) => source);
    const seen = new Set<string>();
    while (pending.length > 0) {
      const file = pending.pop() as string;
      if (seen.has(file)) {
        continue;
      }
      seen.add(file);
      for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
        if (specifier.startsWith(".")) {
          pending.push(resolve(dirname(file), specifier).replace(/\.js$/, ".ts"));
        }
      }
    }
    return [...seen];
  };

  /**
   * The web downloads nothing from a third party (ADR-0028, ADR-0029, ADR-0031): **the addresses of
   * the ECB and of the APIs of prices live in `@atlas/adapters`, outside every subpath the web
   * imports, and never in the domain**, which the web bundles whole. The check of origins of the
   * bundle catches a URL that reaches the output; this catches it in the source, before, and also
   * without its scheme. The hosts of the four sources ADR-0031 names are all here, the two that
   * were dropped included: none of them may reach the web.
   */
  it("keeps the addresses of the ECB and of the sources of prices out of what the web bundles", () => {
    const reachable = webReachableAdapters();
    expect(reachable.some((file) => file.endsWith(join("browser", "prices.ts")))).toBe(true);
    const webReachable = [...listTsFiles(domainSrc), ...listSourceFiles(webSrc), ...reachable];
    const hosts =
      /["'`][^"'`\n]*(?:ecb\.europa\.eu|eodhd\.com|eodhistoricaldata\.com|alphavantage\.co|api\.coingecko\.com|openfigi\.com)/;
    const violations = webReachable
      // Inside a string, with or without its scheme. Comments are not stripped
      // first: a line comment starts with the `//` of every `https://`, and
      // stripping them hid the very address this looks for.
      .filter((file) => hosts.test(readFileSync(file, "utf8")))
      .map((file) => relative(repoRoot, file));
    expect(violations).toEqual([]);
    // And the places they do live are where the test above does not look.
    expect(readFileSync(join(adaptersSrc, "ecb", "source.ts"), "utf8")).toContain("ecb.europa.eu");
    expect(readFileSync(join(adaptersSrc, "prices", "eodhd.ts"), "utf8")).toContain("eodhd.com");
    expect(readFileSync(join(adaptersSrc, "prices", "alpha-vantage.ts"), "utf8")).toContain(
      "alphavantage.co",
    );
    expect(reachable.some((file) => file.includes(join("src", "prices")))).toBe(false);
  });

  /** And the web never reads the keys: nothing it bundles names the file or its reader. */
  it("never lets the web reach the file of the keys", () => {
    const offenders = [
      ...listTsFiles(domainSrc),
      ...listSourceFiles(webSrc),
      ...webReachableAdapters(),
    ]
      .filter((file) =>
        /secrets\.json|readSecrets|prices\/secrets/.test(readFileSync(file, "utf8")),
      )
      .map((file) => relative(repoRoot, file));
    expect(offenders).toEqual([]);
  });
});
