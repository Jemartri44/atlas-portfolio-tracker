import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const domainRoot = join(repoRoot, "packages", "domain");
export const domainSrc = join(domainRoot, "src");
export const domainVendor = join(domainRoot, "vendor");

export const listTsFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return listTsFiles(path);
    }
    return path.endsWith(".ts") ? [path] : [];
  });

export const importPattern =
  /(?:^|\n)\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

export const specifiersOf = (source: string): string[] => {
  const found: string[] = [];
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) {
      found.push(specifier);
    }
  }
  return found;
};

/** A relative specifier as a file of `src/`, or nothing when it points outside. */
export const targetOf = (from: string, specifier: string): string | undefined => {
  if (!specifier.startsWith(".")) {
    return undefined;
  }
  const target = resolve(dirname(from), specifier).replace(/\.js$/, ".ts");
  return relative(domainSrc, target).startsWith("..") ? undefined : target;
};

/** The import graph of `domain/src`, built once: every file with the files it imports. */
export const importGraph = (): Map<string, string[]> => {
  const graph = new Map<string, string[]>();
  for (const file of listTsFiles(domainSrc)) {
    graph.set(
      file,
      specifiersOf(readFileSync(file, "utf8"))
        .map((specifier) => targetOf(file, specifier))
        .filter((target): target is string => target !== undefined),
    );
  }
  return graph;
};

/**
 * Everything reachable from a file, **transitively**, with the chain that gets
 * there. A rule checked on direct imports only is a rule one intermediate file
 * turns off, and neither side has to be enumerated: the graph finds them.
 */
export const reachableFrom = (
  graph: Map<string, string[]>,
  root: string,
): Map<string, string[]> => {
  const chains = new Map<string, string[]>([[root, [root]]]);
  const pending = [root];
  while (pending.length > 0) {
    const file = pending.shift() as string;
    for (const next of graph.get(file) ?? []) {
      if (!chains.has(next)) {
        chains.set(next, [...(chains.get(file) as string[]), next]);
        pending.push(next);
      }
    }
  }
  return chains;
};

export const asChain = (files: readonly string[]): string =>
  files.map((file) => relative(domainSrc, file)).join(" -> ");

/**
 * Everything that **knows about prices**: the gate, the manual leaf, the two ports of prices and
 * every file of `quotes/` with its door — the last read **off the folder**, so a module of prices
 * created tomorrow is covered without anybody writing it down here.
 */
export const priceRoots = (): string[] => {
  const projections = join(domainSrc, "projections");
  return [
    join(projections, "prices.ts"),
    join(projections, "manual-price.ts"),
    join(domainSrc, "ports", "price-source.ts"),
    join(domainSrc, "ports", "price-store.ts"),
    join(domainSrc, "quotes.ts"),
    ...listTsFiles(join(domainSrc, "quotes")),
  ];
};

/** The first price root `file` reaches, with the chain; `undefined` when none. */
export const priceReachedFrom = (
  graph: Map<string, string[]>,
  file: string,
  roots: readonly string[],
): string[] | undefined => {
  const reach = reachableFrom(graph, file);
  for (const root of roots) {
    const chain = reach.get(root);
    if (chain !== undefined) {
      return chain;
    }
  }
  return undefined;
};

/** The body of `export interface <name> {…}` in `file`, comments stripped, and its keys at depth 1. */
export const interfaceKeys = (file: string, name: string): string[] => {
  const source = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  const start = source.indexOf(`export interface ${name} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const keys: string[] = [];
  let depth = 0;
  let line = "";
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    const char = source[index] as string;
    if (depth === 1 && (char === "\n" || char === ";")) {
      // A key with or without quotes: `"quotes": …` is a key as much as `quotes: …`, and the quoted
      // form slipped past this.
      const match = /^\s*(?:readonly\s+)?(?:(["'])([^"']+)\1|([A-Za-z_$][\w$]*))\??\s*:/.exec(line);
      if (match !== null) {
        keys.push((match[2] ?? match[3]) as string);
      }
      line = "";
    }
    // An index signature lets any key through, whatever its form: it is read as a key of its own,
    // which no frozen list contains.
    if (char === "[" && depth === 1 && /^\s*(?:readonly\s+)?$/.test(line)) {
      keys.push("[index signature]");
    }
    if ("{([<".includes(char)) {
      depth += 1;
    } else if ("})]>".includes(char) && !(char === ">" && source[index - 1] === "=")) {
      depth -= 1;
      if (depth === 0) {
        break;
      }
    }
    if (depth === 1 && char !== "{" && char !== "\n" && char !== ";") {
      line += char;
    }
  }
  return keys;
};

export const webRoot = join(repoRoot, "apps", "web");
export const webSrc = join(webRoot, "src");

export const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return listSourceFiles(path);
    }
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
