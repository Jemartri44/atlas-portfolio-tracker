// The reader of the source graph the guardians share (feature 015, block 1
// of E1; moved out of `tests/api-access.test.ts` by feature 016, block 1 of
// E1, so `tests/jobs-access.test.ts` walks the same graph and does not grow a
// second, weaker copy). Static imports, re-exports and literal dynamic
// imports, parsed with the parser Vite ships, across packages through their
// `exports`. Nothing here is a test: it only reads.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "vite";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const domainRoot = join(repoRoot, "packages", "domain");
export const adaptersRoot = join(repoRoot, "packages", "adapters");
export const apiRoot = join(repoRoot, "apps", "api");
export const webSrc = join(repoRoot, "apps", "web", "src");
export const cliSrc = join(repoRoot, "apps", "cli", "src");
export const jobsRoot = join(repoRoot, "apps", "jobs");

export const listSources = (dir: string): string[] =>
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
export const productSources = (): string[] => [
  ...listSources(join(domainRoot, "src")),
  ...listSources(join(adaptersRoot, "src")),
  ...listSources(join(apiRoot, "src")),
  ...listSources(join(jobsRoot, "src")),
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
export interface Parsed {
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

export interface Binding {
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

export const parse = (file: string): Parsed => {
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
export const specifiersOf = (file: string): readonly string[] => parse(file).specifiers;

/** Every node of a parsed program, depth first. */
export const nodesOf = function* (node: unknown): Generator<Record<string, unknown>> {
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

/** Every target the conditions of an export name, at any depth (`types`, `import`, `default`, `require`…). */
const targetsOf = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : typeof value === "object" && value !== null
      ? Object.values(value).flatMap(targetsOf)
      : [];

/**
 * A package subpath as its source file, **read off `exports`** (never a list
 * written here). **Every condition** is resolved, and they must all name the
 * same module (round 2 of the review of PR #106, R2-N3): the graph once read
 * `types` while the bundler took `import`, and a subpath could point the two
 * at different files. Different modules fail, so no guard passes on one.
 */
export const exportsOf = (root: string): Map<string, string> => {
  const exported = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).exports as Record<
    string,
    unknown
  >;
  return new Map(
    Object.entries(exported).map(([subpath, target]) => {
      const sources = new Set(
        targetsOf(target).map((named) =>
          join(
            root,
            "src",
            `${named.replace(/^\.\/dist\//, "").replace(/\.d\.ts$|\.js$|\.ts$/, "")}.ts`,
          ),
        ),
      );
      if (sources.size !== 1) {
        throw new Error(
          `${subpath} of ${relative(repoRoot, join(root, "package.json"))}: its conditions name ${sources.size} modules, not one`,
        );
      }
      return [subpath, [...sources][0] as string];
    }),
  );
};

export const packages = (): Map<string, Map<string, string>> =>
  new Map([
    ["@atlas/domain", exportsOf(domainRoot)],
    ["@atlas/adapters", exportsOf(adaptersRoot)],
  ]);

export const resolveAcross = (
  known: Map<string, Map<string, string>>,
  from: string,
  specifier: string,
): string | undefined => {
  const fileAt = (target: string): string | undefined => {
    const bare = target.replace(/\.(js|jsx)$/, "");
    return [target, `${bare}.ts`, `${bare}.tsx`, join(target, "index.ts")].find(
      (path) =>
        /\.tsx?$/.test(path) && statSync(path, { throwIfNoEntry: false })?.isFile() === true,
    );
  };
  if (specifier.startsWith(".")) {
    return fileAt(resolve(dirname(from), specifier));
  }
  // A root-absolute path, which Vite resolves from the root of the web (and an
  // absolute path of the disk): never a way past a guard (round 2 of the
  // review of PR #97, B1).
  if (specifier.startsWith("/")) {
    return (
      fileAt(join(repoRoot, "apps", "web", specifier)) ??
      fileAt(specifier) ??
      `<unresolved ${specifier}>`
    );
  }
  // An alias of the `imports` field of a package.json: the graph cannot follow
  // it, so it fails closed (review of PR #106, N1), and a test forbids the field.
  if (specifier.startsWith("#")) {
    return `<unresolved ${specifier}>`;
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
export const reach = (
  roots: readonly string[],
  /** Files reached but not walked past: the one door a guard allows. */
  stop: ReadonlySet<string> = new Set(),
): Map<string, string[]> => {
  const known = packages();
  const chains = new Map<string, string[]>(roots.map((root) => [root, [root]]));
  const pending = [...roots];
  while (pending.length > 0) {
    const file = pending.shift() as string;
    if (file.startsWith("<") || stop.has(file)) {
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

export const chainText = (chain: readonly string[]): string =>
  chain.map((file) => (file.startsWith("<") ? file : relative(repoRoot, file))).join(" -> ");

/** What the web bundles: everything `apps/web/src` reaches, derived from its imports and `exports`. */
export const webReach = (): Map<string, string[]> => reach(listSources(webSrc));
