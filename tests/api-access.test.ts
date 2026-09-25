// Feature 015, block 1 of E1: the guardians of the API and the access, written
// **before** `apps/api` exists and seen failing against an empty module
// (`specs/015-api-access/questions.md`, E1). Kept apart from
// `architecture.test.ts`, which is already two thousand lines long; the graph
// walk is the same idea: static imports, across packages through `exports`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const domainRoot = join(repoRoot, "packages", "domain");
const adaptersRoot = join(repoRoot, "packages", "adapters");
const apiRoot = join(repoRoot, "apps", "api");
const webSrc = join(repoRoot, "apps", "web", "src");
const cliSrc = join(repoRoot, "apps", "cli", "src");

const listSources = (dir: string): string[] =>
  statSync(dir, { throwIfNoEntry: false })?.isDirectory() === true
    ? readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          return listSources(path);
        }
        return /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts") ? [path] : [];
      })
    : [];

/** Every source of the product: what ships, never a test. */
const productSources = (): string[] => [
  ...listSources(join(domainRoot, "src")),
  ...listSources(join(adaptersRoot, "src")),
  ...listSources(join(apiRoot, "src")),
  ...listSources(cliSrc),
  ...listSources(webSrc),
];

const importPattern =
  /(?:^|\n)\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Static and dynamic specifiers alike: a dynamic import reaches as much as a static one. */
const specifiersOf = (source: string): string[] =>
  [...source.matchAll(importPattern)]
    .map((match) => match[1] ?? match[2] ?? match[3])
    .filter((specifier): specifier is string => specifier !== undefined);

/** A package subpath as its source file, **read off `exports`** (never a list written here). */
const exportsOf = (root: string): Map<string, string> => {
  const exported = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).exports as Record<
    string,
    { types: string }
  >;
  return new Map(
    Object.entries(exported).map(([subpath, target]) => [
      subpath,
      join(root, "src", target.types.replace(/^\.\/dist\//, "").replace(/\.d\.ts$/, ".ts")),
    ]),
  );
};

const packages = (): Map<string, Map<string, string>> =>
  new Map([
    ["@atlas/domain", exportsOf(domainRoot)],
    ["@atlas/adapters", exportsOf(adaptersRoot)],
  ]);

const resolveAcross = (
  known: Map<string, Map<string, string>>,
  from: string,
  specifier: string,
): string | undefined => {
  if (specifier.startsWith(".")) {
    const target = resolve(dirname(from), specifier);
    const bare = target.replace(/\.(js|jsx)$/, "");
    return [`${bare}.ts`, `${bare}.tsx`, join(target, "index.ts")].find(
      (path) => statSync(path, { throwIfNoEntry: false })?.isFile() === true,
    );
  }
  for (const [name, subpaths] of known) {
    if (specifier === name || specifier.startsWith(`${name}/`)) {
      const file = subpaths.get(`.${specifier.slice(name.length)}`);
      // A subpath the package does not export cannot be imported at all; it
      // is named so that a guard never passes by resolving it to nothing.
      return file ?? `<unexported ${specifier}>`;
    }
  }
  return undefined;
};

/** Everything a set of roots reaches, with the chain, across packages. */
const reach = (roots: readonly string[]): Map<string, string[]> => {
  const known = packages();
  const chains = new Map<string, string[]>(roots.map((root) => [root, [root]]));
  const pending = [...roots];
  while (pending.length > 0) {
    const file = pending.shift() as string;
    if (file.startsWith("<")) {
      continue;
    }
    for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
      const next = resolveAcross(known, file, specifier);
      if (next !== undefined && !chains.has(next)) {
        chains.set(next, [...(chains.get(file) as string[]), next]);
        pending.push(next);
      }
    }
  }
  return chains;
};

const chainText = (chain: readonly string[]): string =>
  chain.map((file) => (file.startsWith("<") ? file : relative(repoRoot, file))).join(" -> ");

/** What the web bundles: everything `apps/web/src` reaches, derived from its imports and `exports`. */
const webReach = (): Map<string, string[]> => reach(listSources(webSrc));

describe("architecture (015): the API is a workspace of its own", () => {
  it("has the files it guards, so no rule below passes by looking at nothing", () => {
    const manifest = JSON.parse(readFileSync(join(apiRoot, "package.json"), "utf8")) as {
      name: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(manifest.name).toBe("@atlas/api");
    expect(statSync(join(apiRoot, "src", "handler.ts"), { throwIfNoEntry: false })?.isFile()).toBe(
      true,
    );
    expect(
      statSync(join(domainRoot, "src", "access.ts"), { throwIfNoEntry: false })?.isFile(),
    ).toBe(true);
  });

  it("depends only on workspaces of the repository (§2 bis, B4)", () => {
    const manifest = JSON.parse(readFileSync(join(apiRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];
    expect(names.filter((name) => !name.startsWith("@atlas/"))).toEqual([]);
  });

  it("is reached from nothing: not the web, not the console, not a package", () => {
    const offenders = [
      ...listSources(webSrc),
      ...listSources(cliSrc),
      ...listSources(join(domainRoot, "src")),
      ...listSources(join(adaptersRoot, "src")),
    ].filter((file) =>
      specifiersOf(readFileSync(file, "utf8")).some(
        (specifier) =>
          specifier === "@atlas/api" ||
          specifier.startsWith("@atlas/api/") ||
          (specifier.startsWith(".") &&
            !relative(join(apiRoot), resolve(dirname(file), specifier)).startsWith("..")),
      ),
    );
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  /**
   * The doubles of S3, SSM and Google, and the local server of the captures,
   * are test code: nothing the product ships may reach them (plan §11). Read
   * on the whole graph of the API and of every subpath of `exports`.
   */
  it("reaches no test double and nothing under a test folder, from the API or any export", () => {
    const roots = [
      ...listSources(join(apiRoot, "src")),
      ...[...packages().values()].flatMap((subpaths) => [...subpaths.values()]),
    ];
    const violations = [...reach(roots)]
      .filter(
        ([file]) =>
          /[/\\](test|tests)[/\\]/.test(relative(repoRoot, file)) ||
          /test-only-/.test(file) ||
          file.startsWith("<unexported"),
      )
      .map(([, chain]) => chainText(chain));
    expect(violations).toEqual([]);
    // And every product source names no test folder in any specifier.
    const named = productSources().filter((file) =>
      specifiersOf(readFileSync(file, "utf8")).some((specifier) =>
        /(^|\/)(test|tests)\/|test-only-/.test(specifier),
      ),
    );
    expect(named.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  it("keeps the rules of the access out of the barrel, behind a door of its own", () => {
    const barrel = readFileSync(join(domainRoot, "src", "index.ts"), "utf8");
    expect(specifiersOf(barrel).filter((specifier) => /\.\/access[/.]/.test(specifier))).toEqual(
      [],
    );
    expect(exportsOf(domainRoot).get("./access")).toBe(join(domainRoot, "src", "access.ts"));
  });
});

describe("architecture (015): credentials travel where ADR-0027 says", () => {
  /**
   * CloudFront overwrites `Authorization` with OAC (ADR-0027, fact 1): every
   * credential goes in the cookie or in `x-atlas-device-token`. Named as a
   * header in any form — a string or a property — in any source of the
   * product, it is a violation; comments are stripped first, prose is not code.
   */
  it("never reads nor writes the Authorization header anywhere", () => {
    const offenders = productSources().filter((file) => {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
      return /["'`]authorization["'`]|\.authorization\b|\bauthorization\s*:/i.test(code);
    });
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });
});

describe("architecture (015): AWS and Google only where they belong", () => {
  const googleHosts =
    /["'`][^"'`\n]*(?:accounts\.google\.com|googleapis\.com|oauth2\.google|openid-configuration)/;

  it("imports the AWS SDK nowhere but the thin adapters of src/aws/sdk-*", () => {
    const offenders = productSources().filter(
      (file) =>
        specifiersOf(readFileSync(file, "utf8")).some((specifier) =>
          specifier.startsWith("@aws-sdk/"),
        ) && !/[/\\]adapters[/\\]src[/\\]aws[/\\]sdk-[^/\\]+\.ts$/.test(file),
    );
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
    for (const root of [
      domainRoot,
      join(repoRoot, "apps", "web"),
      apiRoot,
      join(repoRoot, "apps", "cli"),
    ]) {
      const manifest = readFileSync(join(root, "package.json"), "utf8");
      expect(manifest.includes("@aws-sdk/")).toBe(false);
    }
  });

  it("names the addresses of Google only in the identity adapter", () => {
    const offenders = productSources()
      .filter((file) => googleHosts.test(readFileSync(file, "utf8")))
      .filter((file) => !/[/\\]adapters[/\\]src[/\\]identity[/\\]/.test(file));
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  /**
   * What the web bundles is **derived** — its own imports resolved through
   * `exports` — so a subpath added tomorrow and imported by the web is looked
   * at without anybody writing it here (§2 bis; mutant 11).
   */
  it("lets neither the SDK, nor Google, nor the Node adapters of the API reach the web", () => {
    const reached = webReach();
    expect(reached.size).toBeGreaterThan(listSources(webSrc).length);
    const violations = [...reached]
      .filter(([file]) => {
        if (file.startsWith("<")) {
          return true;
        }
        const source = readFileSync(file, "utf8");
        return (
          googleHosts.test(source) ||
          specifiersOf(source).some(
            (specifier) => specifier.startsWith("@aws-sdk/") || specifier.startsWith("node:"),
          ) ||
          /[/\\]adapters[/\\]src[/\\](aws|identity|access)[/\\]/.test(file) ||
          /[/\\]domain[/\\]src[/\\]access(\.ts|[/\\])/.test(file)
        );
      })
      .map(([, chain]) => chainText(chain));
    expect(violations).toEqual([]);
  });
});

describe("architecture (015): the web cannot configure the sync before P2 and P3", () => {
  /**
   * The hard requirement inherited from feature 014 (D-Q17): **no module of
   * the web may reach what configures the sync** — initialise, join, redownload,
   * the store that writes the `sync:*` keys, the HTTP client — until the
   * refusal to import (P2) and what is held back in the export (P3) are in.
   * **This guard is loosened only in E4, in the same commit that makes the
   * configuration reachable, and only after the commits of P2 and P3**
   * (`docs/prompts/015-api-access.md` §3, E4, block 1).
   *
   * Read by **name**, not by file: the web already imports the store of the
   * sync for one read-only question (`browserSyncConfigured`, V7 of 014), and
   * that file also holds the writer. So the web may import from the doors of
   * the sync only the names on this list, never a namespace, never dynamically.
   */
  const READ_ONLY = new Set(["browserSyncConfigured", "browserSyncPresence"]);
  const DOORS = /^@atlas\/(adapters\/sync(-client|-http)?|domain\/sync)$/;

  it("imports from the doors of the sync only read-only names, and writes no sync:* key", () => {
    const violations: string[] = [];
    for (const file of listSources(webSrc)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /import\s+(type\s+)?([^'"]*?)\s*from\s*['"]([^'"]+)['"]/g,
      )) {
        const specifier = match[3] as string;
        if (!DOORS.test(specifier) || match[1] !== undefined) {
          continue;
        }
        const clause = (match[2] as string).trim();
        const names = /^\{([\s\S]*)\}$/.exec(clause);
        if (names === null) {
          violations.push(`${relative(repoRoot, file)}: ${clause} from ${specifier}`);
          continue;
        }
        for (const binding of (names[1] as string).split(",")) {
          const name = binding
            .trim()
            .replace(/^type\s+/, "")
            .split(/\s+as\s+/)[0] as string;
          if (name !== "" && !binding.trim().startsWith("type ") && !READ_ONLY.has(name)) {
            violations.push(`${relative(repoRoot, file)}: ${name} from ${specifier}`);
          }
        }
      }
      for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        if (DOORS.test(match[1] as string)) {
          violations.push(`${relative(repoRoot, file)}: dynamic import of ${match[1]}`);
        }
      }
      if (/["'`]sync:/.test(source)) {
        violations.push(`${relative(repoRoot, file)}: names a sync:* key`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("architecture (015): nothing of the access on the boot path", () => {
  it("lists every web module of the feature in LAZY_ONLY from its first commit", () => {
    const script = readFileSync(
      join(repoRoot, "apps", "web", "scripts", "check-bundle.mjs"),
      "utf8",
    );
    for (const path of [
      "/packages/domain/src/access/",
      "/packages/domain/src/access.ts",
      "/packages/adapters/src/ledger-store/browser/web-device.ts",
      "/src/sync/",
      "/src/routes/ajustes/sync/",
    ]) {
      expect(script).toContain(`path: "${path}"`);
    }
  });
});
