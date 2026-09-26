// Feature 015, block 1 of E1: the guardians of the API and the access, written
// **before** `apps/api` exists and seen failing against an empty module
// (`specs/015-api-access/questions.md`, E1). Kept apart from
// `architecture.test.ts`, which is already two thousand lines long; the graph
// walk is the same idea: static imports, across packages through `exports`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "vite";
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

/**
 * A source as the bundler reads it (round 2 of the review of PR #90, B2-bis
 * and B3). The guards used to read imports with regular expressions and to
 * strip comments with one more: a `//` inside a string swallowed the rest of
 * the line, and a re-export, a `require` or an `import.meta.glob` walked past
 * them. Now the source is **parsed** — with the parser Vite already ships
 * (`parseSync`, Oxc), no new dependency — and its imports, re-exports and
 * dynamic imports come from the parser, and its comments are blanked by the
 * ranges the parser gives. A source it cannot parse fails the guard.
 *
 * These guards are the **quick warning**. The authoritative check is on the
 * real graph of the bundle: `apps/web/scripts/check-bundle.mjs` reads the
 * modules Rolldown put in it.
 */
interface Parsed {
  readonly source: string;
  /** The source with every comment blanked, strings and regular expressions untouched. */
  readonly code: string;
  /** Every `import … from`, `export … from`, side-effect import and literal `import("…")`. */
  readonly specifiers: readonly string[];
  /** The names each static import and re-export takes from each specifier. */
  readonly bindings: readonly Binding[];
  /** How many `import(…)` and `import.meta` the parser found: a file with none has none to walk. */
  readonly dynamicImports: number;
  readonly importMetas: number;
  /** The program, built only when asked: most guards never need it. */
  readonly program: () => unknown;
}

interface Binding {
  readonly specifier: string;
  readonly how: "import" | "export" | "dynamic";
  /** The imported name; `*` for a namespace or `export *`, `default` for a default. */
  readonly name: string;
  readonly isType: boolean;
}

interface ModuleInfo {
  readonly staticImports: readonly {
    readonly moduleRequest: { readonly value: string };
    readonly entries: readonly {
      readonly importName: { readonly kind: string; readonly name: string | null };
      readonly isType: boolean;
    }[];
  }[];
  readonly staticExports: readonly {
    readonly entries: readonly {
      readonly moduleRequest: { readonly value: string } | null;
      readonly importName: { readonly kind: string; readonly name: string | null };
      readonly isType: boolean;
    }[];
  }[];
  readonly dynamicImports: readonly {
    readonly moduleRequest: { readonly start: number; readonly end: number };
  }[];
  readonly importMetas: readonly unknown[];
}

const parsedFiles = new Map<string, Parsed>();

const parse = (file: string): Parsed => {
  const known = parsedFiles.get(file);
  if (known !== undefined) {
    return known;
  }
  const source = readFileSync(file, "utf8");
  const result = parseSync(file, source);
  if (result.errors.length > 0) {
    throw new Error(`${relative(repoRoot, file)} cannot be parsed: ${result.errors[0]?.message}`);
  }
  let code = source;
  for (const comment of result.comments) {
    const blank = source.slice(comment.start, comment.end).replace(/[^\n]/g, " ");
    code = code.slice(0, comment.start) + blank + code.slice(comment.end);
  }
  const module = result.module as unknown as ModuleInfo;
  const bindings: Binding[] = [];
  for (const statement of module.staticImports) {
    const specifier = statement.moduleRequest.value;
    if (statement.entries.length === 0) {
      bindings.push({ specifier, how: "import", name: "*", isType: false });
    }
    for (const entry of statement.entries) {
      bindings.push({
        specifier,
        how: "import",
        name:
          entry.importName.kind === "Name"
            ? (entry.importName.name as string)
            : entry.importName.kind === "Default"
              ? "default"
              : "*",
        isType: entry.isType,
      });
    }
  }
  for (const statement of module.staticExports) {
    for (const entry of statement.entries) {
      if (entry.moduleRequest !== null) {
        bindings.push({
          specifier: entry.moduleRequest.value,
          how: "export",
          name: entry.importName.kind === "Name" ? (entry.importName.name as string) : "*",
          isType: entry.isType,
        });
      }
    }
  }
  for (const dynamic of module.dynamicImports) {
    const argument = source.slice(dynamic.moduleRequest.start, dynamic.moduleRequest.end);
    const literal = /^(["'])([^"'`\n$\\]*)\1$/.exec(argument.trim());
    if (literal !== null) {
      bindings.push({ specifier: literal[2] as string, how: "dynamic", name: "*", isType: false });
    }
  }
  const parsed: Parsed = {
    source,
    code,
    specifiers: [...new Set(bindings.map((binding) => binding.specifier))],
    bindings,
    dynamicImports: module.dynamicImports.length,
    importMetas: module.importMetas.length,
    program: () => result.program,
  };
  parsedFiles.set(file, parsed);
  return parsed;
};

/** Static and dynamic specifiers alike: a dynamic import reaches as much as a static one. */
const specifiersOf = (file: string): readonly string[] => parse(file).specifiers;

/** Every node of a parsed program, depth first. */
const nodesOf = function* (node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const item of node) {
      yield* nodesOf(item);
    }
  } else if (typeof node === "object" && node !== null) {
    const record = node as Record<string, unknown>;
    if (typeof record.type === "string") {
      yield record;
    }
    for (const [key, value] of Object.entries(record)) {
      if (key !== "parent") {
        yield* nodesOf(value);
      }
    }
  }
};

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
    for (const specifier of specifiersOf(file)) {
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

  it("depends at runtime only on workspaces, and builds with esbuild pinned (§2 bis, B4; §7 P3)", () => {
    const manifest = JSON.parse(readFileSync(join(apiRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(
      Object.keys(manifest.dependencies ?? {}).filter((name) => !name.startsWith("@atlas/")),
    ).toEqual([]);
    // The one tool the user authorised for the API (§12 of questions.md), at an exact version.
    expect(manifest.devDependencies).toEqual({ esbuild: "0.28.2" });
  });

  it("gives the adapters the two clients of the SDK the user authorised, pinned, and no other", () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "packages", "adapters", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(
      Object.fromEntries(
        Object.entries(manifest.dependencies ?? {}).filter(([name]) => !name.startsWith("@atlas/")),
      ),
    ).toEqual({ "@aws-sdk/client-s3": "3.1141.0", "@aws-sdk/client-ssm": "3.1141.0" });
    expect(manifest.devDependencies ?? {}).toEqual({});
  });

  it("is reached from nothing: not the web, not the console, not a package", () => {
    const offenders = [
      ...listSources(webSrc),
      ...listSources(cliSrc),
      ...listSources(join(domainRoot, "src")),
      ...listSources(join(adaptersRoot, "src")),
    ].filter((file) =>
      specifiersOf(file).some(
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
      specifiersOf(file).some((specifier) => /(^|\/)(test|tests)\/|test-only-/.test(specifier)),
    );
    expect(named.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  it("keeps the rules of the access out of the barrel, behind a door of its own", () => {
    const barrel = join(domainRoot, "src", "index.ts");
    expect(specifiersOf(barrel).filter((specifier) => /\.\/access[/.]/.test(specifier))).toEqual(
      [],
    );
    expect(exportsOf(domainRoot).get("./access")).toBe(join(domainRoot, "src", "access.ts"));
  });
});

describe("architecture (015): every import can be read", () => {
  /**
   * The graph every guard above and below walks is read off the imports of
   * each source, so an import it cannot read is an import it cannot see. A
   * dynamic `import(…)` whose argument is not a plain string literal in
   * single or double quotes — a template literal, a variable, any expression —
   * is refused **everywhere in the product** (B2 of the review of PR #90: a
   * template literal walked past the guard of P2 and P3 with every test
   * green). Read off the parsed program, so a `//` inside a string before it
   * hides nothing (B2-bis of round 2: the regular expression that stripped
   * comments swallowed the rest of the line).
   */
  it("allows a dynamic import only with a quoted string literal", () => {
    const offenders: string[] = [];
    for (const file of productSources()) {
      const { program, source, dynamicImports } = parse(file);
      if (dynamicImports === 0) {
        continue;
      }
      for (const node of nodesOf(program())) {
        const argument = node.source as { type?: string; value?: unknown } | undefined;
        if (
          node.type === "ImportExpression" &&
          !(argument?.type === "Literal" && typeof argument.value === "string")
        ) {
          const { start, end } = node as unknown as { start: number; end: number };
          offenders.push(`${relative(repoRoot, file)}: ${source.slice(start, end)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * Two more ways in that no guard read (B3 of round 2): `require(…)` — the
   * web compiles with the types of Node, and the bundler follows it — and
   * `import.meta.glob(…)`, which Vite turns into imports at build time. The
   * product is ESM with literal imports only: neither is allowed anywhere,
   * nor `createRequire`, nor `import.meta` read by a computed key. Only the
   * sources that can hold one are walked: an identifier spells `require` as a
   * word of the text or through a `\u` escape, and the parser lists every
   * `import.meta`.
   */
  it("never uses require, createRequire or import.meta.glob", () => {
    const offenders: string[] = [];
    for (const file of productSources()) {
      const { program, source, importMetas } = parse(file);
      if (importMetas === 0 && !/\brequire\b|createRequire|\\u/.test(source)) {
        continue;
      }
      for (const node of nodesOf(program())) {
        const { start, end } = node as unknown as { start: number; end: number };
        const at = `${relative(repoRoot, file)}: ${source.slice(start, end).slice(0, 80)}`;
        if (
          node.type === "Identifier" &&
          ["require", "createRequire"].includes(node.name as string)
        ) {
          offenders.push(at);
        }
        const object = node.object as { type?: string; meta?: { name?: string } } | undefined;
        const property = node.property as { name?: string } | undefined;
        if (
          node.type === "MemberExpression" &&
          object?.type === "MetaProperty" &&
          object.meta?.name === "import" &&
          (node.computed === true || /^glob/.test(property?.name ?? ""))
        ) {
          offenders.push(at);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("architecture (015): credentials travel where ADR-0027 says", () => {
  /**
   * CloudFront overwrites `Authorization` with OAC (ADR-0027, fact 1): every
   * credential goes in the cookie or in `x-atlas-device-token`. Named as a
   * header in any form — a string or a property — in any source of the
   * product, it is a violation; comments are blanked first (by the ranges the
   * parser gives, so a `//` inside a string hides nothing), prose is not code.
   */
  it("never reads nor writes the Authorization header anywhere", () => {
    const offenders = productSources().filter((file) =>
      /["'`]authorization["'`]|\.authorization\b|\bauthorization\s*:/i.test(parse(file).code),
    );
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });
});

describe("architecture (015): AWS and Google only where they belong", () => {
  const googleHosts =
    /["'`][^"'`\n]*(?:accounts\.google\.com|googleapis\.com|oauth2\.google|openid-configuration)/;

  it("imports the AWS SDK nowhere but the thin adapters of src/aws/sdk-*", () => {
    const offenders = productSources().filter(
      (file) =>
        specifiersOf(file).some((specifier) => specifier.startsWith("@aws-sdk/")) &&
        !/[/\\]adapters[/\\]src[/\\]aws[/\\]sdk-[^/\\]+\.ts$/.test(file),
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
          specifiersOf(file).some(
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

  /**
   * The doors, as files: whatever the specifier that reaches them — the name
   * of the package, a relative path into `packages/`, a relay of the web that
   * re-exports them — a binding taken from one of these files is read by name
   * (B3 of round 2: a relative path and a re-export walked past the names).
   */
  const doorFiles = (): Set<string> =>
    new Set(
      [...packages()].flatMap(([name, subpaths]) =>
        [...subpaths]
          .filter(([subpath]) => DOORS.test(`${name}${subpath.slice(1)}`))
          .map(([, file]) => file),
      ),
    );

  it("imports from the doors of the sync only read-only names, and writes no sync:* key", () => {
    const known = packages();
    const doors = doorFiles();
    expect(doors.size).toBeGreaterThanOrEqual(3);
    const violations: string[] = [];
    for (const file of listSources(webSrc)) {
      const { source, bindings } = parse(file);
      for (const binding of bindings) {
        const target = resolveAcross(known, file, binding.specifier);
        if (!DOORS.test(binding.specifier) && !(target !== undefined && doors.has(target))) {
          continue;
        }
        const at = `${relative(repoRoot, file)}: ${binding.how} ${binding.name} from ${binding.specifier}`;
        if (binding.how === "dynamic") {
          violations.push(at);
        } else if (!binding.isType && !READ_ONLY.has(binding.name)) {
          violations.push(at);
        }
      }
      if (/["'`]sync:/.test(source)) {
        violations.push(`${relative(repoRoot, file)}: names a sync:* key`);
      }
    }
    expect(violations).toEqual([]);
  });

  /**
   * And by **reach**, for what the web must not touch at all before E4: the
   * client of the sync and its orchestration (`packages/adapters/src/sync/`:
   * `initialiseRemote`, `joinWithOwnLines`, `replaceFromRemote`, the held
   * actions) and the HTTP client of E3. Walked across relative paths and
   * re-exports, so a relay module of the web or a path into `packages/` is
   * followed to the file (B3 of round 2, mutants R1 and R3). Loosened in E4
   * with the guard above.
   */
  it("reaches neither the client of the sync nor its orchestration, by any path", () => {
    const violations = [...webReach()]
      .filter(([file]) => /[/\\]adapters[/\\]src[/\\]sync(-http)?[/\\]/.test(file))
      .map(([, chain]) => chainText(chain));
    expect(violations).toEqual([]);
  });
});

describe("architecture (015): the records of the tokens are never deleted nor labelled (T26)", () => {
  /**
   * ADR-0033, point 9: a record is written to create it and to revoke it, and
   * never deleted; a label or a delete is a way to bring a revoked token back
   * (B1). The narrow interface of SSM offers exactly four operations, and no
   * source of the product names the others of the service.
   */
  it("offers get, putNew, overwrite and listByPath, and nothing else", () => {
    const file = join(adaptersRoot, "src", "aws", "parameter-store.ts");
    const members = [...parse(file).code.matchAll(/^\s{2}([a-zA-Z]+)\(/gm)].map(
      (match) => match[1],
    );
    expect(members).toEqual(["get", "putNew", "overwrite", "listByPath"]);
    const offenders = productSources().filter((path) =>
      /DeleteParameters?|LabelParameterVersion|UnlabelParameterVersion|deleteParameter|labelParameter/.test(
        parse(path).code,
      ),
    );
    expect(offenders.map((path) => relative(repoRoot, path))).toEqual([]);
  });
});

describe("architecture (015): the thin adapters of the SDK send only what they are for (E3)", () => {
  /**
   * The API only appends to the bucket and never deletes (ADR-0026, Part A;
   * ADR-0028, row 7), and the records of the tokens are never deleted nor
   * labelled (T26). What the adapters take from the SDK is the closed list of
   * commands they send; a delete, or anything else, is a violation.
   */
  it("takes from the SDK only the clients and the commands of the narrow interfaces", () => {
    const allowed: Record<string, readonly string[]> = {
      "@aws-sdk/client-s3": [
        "S3Client",
        "GetObjectCommand",
        "PutObjectCommand",
        "ListObjectsV2Command",
        "ListObjectsV2CommandOutput",
      ],
      "@aws-sdk/client-ssm": [
        "SSMClient",
        "GetParameterCommand",
        "GetParameterCommandOutput",
        "PutParameterCommand",
        "GetParametersByPathCommand",
        "GetParametersByPathCommandOutput",
      ],
    };
    const taken = productSources().flatMap((file) =>
      parse(file)
        .bindings.filter((binding) => binding.specifier.startsWith("@aws-sdk/"))
        .map((binding) => `${binding.specifier} ${binding.name}`),
    );
    expect(taken.length).toBeGreaterThan(0);
    expect(
      taken.filter((entry) => {
        const [specifier, name] = entry.split(" ") as [string, string];
        return !(allowed[specifier] ?? []).includes(name);
      }),
    ).toEqual([]);
    const deletes = productSources().filter((path) =>
      /DeleteObjects?|deleteObject|DeleteBucket/.test(parse(path).code),
    );
    expect(deletes.map((path) => relative(repoRoot, path))).toEqual([]);
  });
});

describe("architecture (015): the API only appends, and the domain judges every line (E3)", () => {
  const apiSources = () => listSources(join(apiRoot, "src"));

  /**
   * ADR-0026, Part A: the API never rewrites nor deletes a line. It holds the
   * remote ledger only as `AppendOnlyLedger`, and no source of it names an
   * operation that rewrites or deletes (mutant 31).
   */
  it("names no operation that rewrites or deletes the remote", () => {
    const offenders = apiSources().filter((file) =>
      /\breplaceLines\b|\.replace\(\s*\[|\bBlobLedgerStore\b|\bS3LedgerBlob\b|DeleteObject|deleteObject|deleteOutOfBand/.test(
        parse(file).code,
      ),
    );
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
    const sync = readFileSync(join(apiRoot, "src", "sync.ts"), "utf8");
    expect(sync).toContain("AppendOnlyLedger");
  });

  /**
   * What a line is worth is `acceptAppend` and `acceptInit`, never a copy in
   * the handler: no source of the API names a code of the table of §5.2
   * (mutant 31, «reimplement a rule of acceptAppend»).
   */
  it("reimplements no rule of acceptAppend: the codes of a line live in the domain", () => {
    const codes =
      /["'`](line_unreadable|schema_version_unsupported|line_invalid|recorded_at_in_future|domain_rejected|duplicate_unconfirmed|pair_declaration_invalid|pair_incomplete|pair_not_contiguous|pair_rejected|seal_mismatch|waiver_not_appendable)["'`]/;
    const offenders = apiSources().filter((file) => codes.test(parse(file).code));
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
    const sync = readFileSync(join(apiRoot, "src", "sync.ts"), "utf8");
    expect(sync).toMatch(/acceptAppend\(/);
    expect(sync).toMatch(/acceptInit\(/);
  });
});

describe("architecture (015): the exception of the redo is bound to the sealed plan (E3, N1)", () => {
  /**
   * `recordRedo` records with the rule of `correctEvent` (§7 P6, option (a)).
   * Only the orchestration of the redo may reach it — never the ordinary form
   * of recording, where it would be a flag nobody could tell apart (N1;
   * mutant 33 bis). The door of the sync re-exports it; nothing else names it.
   */
  it("is imported only by the orchestration of the redo", () => {
    const users = productSources()
      .filter((file) => parse(file).bindings.some((binding) => binding.name === "recordRedo"))
      .map((file) => relative(repoRoot, file).replaceAll("\\", "/"))
      .sort();
    expect(users).toEqual([
      "packages/adapters/src/sync/held-actions.ts",
      "packages/domain/src/sync.ts",
    ]);
  });
});

describe("architecture (015): the authoritative guard reads the graph of the bundle", () => {
  /**
   * The guards of this file read the sources; the one that decides reads the
   * modules Rolldown put in the bundle (round 2 of the review of PR #90). It
   * runs inside `npm run build`, so this only holds that it is there: the
   * plugin that writes the graph, and each family it refuses.
   */
  it("writes the graph in the build and refuses each family on it", () => {
    const config = readFileSync(join(repoRoot, "apps", "web", "vite.config.ts"), "utf8");
    expect(config).toContain('moduleGraph("main"),');
    // Round 3: the workers are other builds, with the same plugin.
    expect(config).toContain('worker: { plugins: () => [moduleGraph("worker")] }');
    expect(config).toContain('fileName: ".vite/atlas-modules.json"');
    expect(config).toContain("realpathSync(path)");
    // Round 4: a source of code is never inlined as a `data:` URL.
    expect(config).toMatch(/assetsInlineLimit: \(filePath: string\)/);
    const script = readFileSync(
      join(repoRoot, "apps", "web", "scripts", "check-bundle.mjs"),
      "utf8",
    );
    for (const family of [
      "el cliente o la orquestación de la sincronización",
      "el motor de la sincronización",
      "las reglas del acceso",
      "un adaptador de Node de la API",
      "el SDK de AWS",
      "la API o la consola",
      "un módulo de Node",
      "un doble o código de test",
      "del almacén de la sincronización, que solo se puede leer",
      "un paquete del repositorio por node_modules",
      "crea un worker cuyo grafo no se conoce",
      "el bundle lleva un fuente",
      "ningún grafo dice de dónde sale este fichero",
      "lleva código incrustado como URL data:",
    ]) {
      expect(script).toContain(family);
    }
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

describe("architecture (015): the service worker leaves the API alone", () => {
  /**
   * Found by looking at the screen (E1): the PWA answered **every** navigation
   * with `index.html` (`navigateFallback`), so `GET /api/auth/login` and the
   * return from Google never reached the Lambda once the service worker was
   * installed — the SPA painted «Aquí no hay nada». A navigation under
   * `/api/` is the API's, always.
   */
  it("never answers a navigation under /api/ with the shell of the SPA", () => {
    const config = readFileSync(join(repoRoot, "apps", "web", "vite.config.ts"), "utf8");
    expect(config).toContain("navigateFallbackDenylist: [/^\\/api\\//]");
    const script = readFileSync(
      join(repoRoot, "apps", "web", "scripts", "check-bundle.mjs"),
      "utf8",
    );
    expect(script).toContain("navigateFallbackDenylist");
  });
});
