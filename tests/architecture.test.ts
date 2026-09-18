import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const domainRoot = join(repoRoot, "packages", "domain");
const domainSrc = join(domainRoot, "src");
const domainVendor = join(domainRoot, "vendor");

const listTsFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return listTsFiles(path);
    }
    return path.endsWith(".ts") ? [path] : [];
  });

const importPattern =
  /(?:^|\n)\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

const specifiersOf = (source: string): string[] => {
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
const targetOf = (from: string, specifier: string): string | undefined => {
  if (!specifier.startsWith(".")) {
    return undefined;
  }
  const target = resolve(dirname(from), specifier).replace(/\.js$/, ".ts");
  return relative(domainSrc, target).startsWith("..") ? undefined : target;
};

/** The import graph of `domain/src`, built once: every file with the files it imports. */
const importGraph = (): Map<string, string[]> => {
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
const reachableFrom = (graph: Map<string, string[]>, root: string): Map<string, string[]> => {
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

const asChain = (files: readonly string[]): string =>
  files.map((file) => relative(domainSrc, file)).join(" -> ");

describe("architecture: @atlas/domain imports nothing", () => {
  it("declares no runtime dependencies", () => {
    const manifest = JSON.parse(readFileSync(join(domainRoot, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
    expect(manifest.optionalDependencies).toBeUndefined();
  });

  it("only imports relative modules inside src/ or vendor/", () => {
    const violations: string[] = [];
    for (const file of listTsFiles(domainSrc)) {
      for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
        const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
        if (!isRelative) {
          violations.push(`${relative(repoRoot, file)} -> ${specifier}`);
          continue;
        }
        const target = resolve(dirname(file), specifier);
        const insideSrc = !relative(domainSrc, target).startsWith("..");
        const insideVendor = !relative(domainVendor, target).startsWith("..");
        if (!insideSrc && !insideVendor) {
          violations.push(`${relative(repoRoot, file)} -> ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps synth/ a leaf: nothing in domain/src imports from it, except the public index", () => {
    const synthDir = join(domainSrc, "synth");
    const violations: string[] = [];
    for (const file of listTsFiles(domainSrc)) {
      const insideSynth = !relative(synthDir, file).startsWith("..");
      if (insideSynth || file === join(domainSrc, "index.ts")) {
        continue;
      }
      for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
        const target = resolve(dirname(file), specifier);
        if (!relative(synthDir, target).startsWith("..")) {
          violations.push(`${relative(repoRoot, file)} -> ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
    expect(readFileSync(join(domainSrc, "index.ts"), "utf8")).toContain("./synth/index.js");
  });

  /**
   * Prompt 005 §3.0 ter: one door to a price. When phase 4 brings automatic
   * prices, `prices.ts` is the only file that changes; a projection that read
   * the valuations on its own would silently keep ignoring them.
   *
   * Reading a field is not an import, so this half cannot be graph-based: what
   * it can be is blind to how the field is spelled. It looks for the **read**
   * in either of its two forms, `state.valuations` and a destructuring of it,
   * because a `const { valuations } = state` used to walk straight past it.
   *
   * The three exceptions are not price lookups: `operations.ts` fills the list,
   * `snapshot.ts` serialises it and `valuations.ts` is the Modelo 720 view,
   * which enumerates registered valuations instead of asking what an asset is
   * worth on a date. `state.ts` declares the field and reads nothing.
   */
  it("keeps every read of the valuations behind the gate of prices.ts", () => {
    const allowed = new Set(
      ["prices.ts", "valuations.ts", "snapshot.ts", "operations.ts"]
        .map((name) => join(domainSrc, "projections", name))
        .concat(join(domainSrc, "projections", "state.ts")),
    );
    const reads = [/\.valuations\b/, /\{[^{}]*\bvaluations\b[^{}]*\}\s*=[^=]/];
    const violations = listTsFiles(domainSrc)
      .filter((file) => !allowed.has(file))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return reads.some((pattern) => pattern.test(source));
      })
      .map((file) => relative(repoRoot, file));
    expect(violations).toEqual([]);
  });

  /**
   * And the gate stays a gate: `prices.ts` may lean on the types of the state
   * and on money and dates, never on a projection the state does not already
   * carry. A door that starts importing the rest of the house is no longer a
   * door, and "the rest of the house" is read off the graph, not off a list.
   */
  it("keeps prices.ts a leaf among the projections", () => {
    const graph = importGraph();
    const projections = join(domainSrc, "projections");
    const pricesFile = join(projections, "prices.ts");
    const typeLayer = reachableFrom(graph, join(projections, "state.ts"));
    const violations = [...reachableFrom(graph, pricesFile).values()]
      .filter((chain) => {
        const file = chain[chain.length - 1] as string;
        return (
          file !== pricesFile &&
          !typeLayer.has(file) &&
          !relative(projections, file).startsWith("..")
        );
      })
      .map(asChain);
    expect(violations).toEqual([]);
  });

  /**
   * Constitution II: prices are informative and no tax calculation may depend
   * on them. Both sides of the rule come out of the graph, so a file added
   * tomorrow is covered without being written down anywhere:
   *
   * - the **fiscal path** is everything `project-ledger.ts` reaches, which is
   *   pass A, pass A' and pass B: the code that creates lots, gains, theses and
   *   fiscal warnings;
   * - a file is **price-aware** when it reaches `prices.ts`, the single gate.
   *
   * The two sets must not meet, at any depth. Checking direct imports against
   * two fixed lists left a new file in neither list and a leak one hop away
   * from being seen; this sees the whole chain and prints it.
   *
   * Note which way round it is: a view reading `theses.ts` is fine, and that is
   * exactly why the index comparison lives in `bucket.ts` and **wraps**
   * `theses()` instead of extending it. What is forbidden is the fiscal path
   * learning what a price is.
   */
  it("keeps prices out of every fiscal calculation, transitively", () => {
    const graph = importGraph();
    const pricesFile = join(domainSrc, "projections", "prices.ts");
    const projectLedger = join(domainSrc, "projections", "project-ledger.ts");
    const fiscal = reachableFrom(graph, projectLedger);
    expect(fiscal.size).toBeGreaterThan(1);
    const violations = [...fiscal.entries()]
      .map(([file, chain]) => ({ chain, toPrices: reachableFrom(graph, file).get(pricesFile) }))
      .filter((entry) => entry.toPrices !== undefined)
      .map((entry) => `${asChain(entry.chain)}  ==  then  ==>  ${asChain(entry.toPrices ?? [])}`);
    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The web (feature 006). Three rules that cannot be left to memory: the privacy
// gate, the isolation of the bundle and the ban on `use:` directives.
// ---------------------------------------------------------------------------

const webRoot = join(repoRoot, "apps", "web");
const webSrc = join(webRoot, "src");

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return listSourceFiles(path);
    }
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });

describe("architecture: apps/web", () => {
  /**
   * Decision (d) of prompt 006 and Q6: **every** amount and **every** quantity
   * is painted by one component, so the privacy mode cannot be bypassed by a
   * screen written in two years by someone who never read the prompt.
   *
   * It is checked on the **import graph** rather than by rendering: the module
   * that knows how to format a sensitive figure has exactly one legitimate
   * consumer. It is the same mechanism that guards the price gate of the domain
   * above, and it does not depend on a testing library.
   */
  it("lets only the Amount component format an amount or a quantity", () => {
    const gate = join(webSrc, "format", "money.ts");
    const allowed = new Set([join(webSrc, "components", "Amount.tsx")]);
    const violations: string[] = [];
    for (const file of listSourceFiles(webSrc)) {
      if (file === gate || allowed.has(file)) {
        continue;
      }
      for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
        if (!specifier.startsWith(".")) {
          continue;
        }
        const target = resolve(dirname(file), specifier)
          .replace(/\.js$/, ".ts")
          .replace(/\.jsx$/, ".tsx");
        if (target === gate) {
          violations.push(`${relative(repoRoot, file)} -> ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  /**
   * FR-014: importing the browser store must not drag `node:fs` into the
   * bundle. The barrel of `@atlas/adapters` exports `FileLedgerStore`, so the
   * web imports subpaths only. `scripts/check-bundle.mjs` verifies the same
   * thing on the built output; this one says it in the source, where the fix is.
   */
  it("never imports node builtins or the adapters barrel", () => {
    const violations: string[] = [];
    for (const file of listSourceFiles(webSrc)) {
      for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
        if (specifier.startsWith("node:")) {
          violations.push(`${relative(repoRoot, file)} -> ${specifier}`);
        }
        if (specifier === "@atlas/adapters") {
          violations.push(`${relative(repoRoot, file)} -> ${specifier} (usa una subruta)`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  /**
   * ADR-0017: `use:` directives are the only thing Solid 2.0 removes entirely,
   * and avoiding them today costs nothing. A grep is enough because the syntax
   * is unmistakable.
   */
  it("uses no `use:` directive anywhere", () => {
    const violations = listSourceFiles(webSrc)
      .filter((file) => /\suse:[a-zA-Z]/.test(readFileSync(file, "utf8")))
      .map((file) => relative(repoRoot, file));
    expect(violations).toEqual([]);
  });

  /**
   * Constitution, security: nothing is ever requested from a foreign origin. The
   * sources may not name one (the built output is checked by the bundle script,
   * which knows about the inert sentinels of the router).
   */
  it("names no remote origin in its sources", () => {
    const allowed = /https?:\/\/(www\.)?w3\.org/;
    const violations: string[] = [];
    for (const file of listSourceFiles(webSrc)) {
      for (const match of readFileSync(file, "utf8").matchAll(/https?:\/\/[\w.-]+/g)) {
        if (!allowed.test(match[0])) {
          violations.push(`${relative(repoRoot, file)}: ${match[0]}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
