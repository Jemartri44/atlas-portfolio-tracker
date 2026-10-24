import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  asChain,
  domainRoot,
  domainSrc,
  domainVendor,
  importGraph,
  listSourceFiles,
  listTsFiles,
  priceReachedFrom,
  priceRoots,
  reachableFrom,
  repoRoot,
  specifiersOf,
} from "./support.js";

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
   * One door to a price. When phase 4 brings automatic prices, `prices.ts` is the only file that
   * changes; a projection that read the valuations on its own would silently keep ignoring them.
   *
   * Reading a field is not an import, so this half cannot be graph-based: what
   * it can be is blind to how the field is spelled. It looks for the **read**
   * in either of its two forms, `state.valuations` and a destructuring of it,
   * because a `const { valuations } = state` used to walk straight past it.
   *
   * The three exceptions are not price lookups: `operations.ts` fills the list, `snapshot.ts`
   * serialises it and `valuations.ts` is the Modelo 720 view, which enumerates registered
   * valuations instead of asking what an asset is worth on a date. `state.ts` declares the field
   * and reads nothing. `manual-price.ts` is the manual leaf the Modelo 720 reads, and the gate
   * reads the valuations **through** it.
   */
  it("keeps every read of the valuations behind the gate of prices.ts", () => {
    const allowed = new Set(
      ["prices.ts", "manual-price.ts", "valuations.ts", "snapshot.ts", "operations.ts"]
        .map((name) => join(domainSrc, "projections", name))
        .concat(join(domainSrc, "projections", "state.ts")),
    );
    const reads = [
      /\.valuations\b/,
      /\{[^{}]*\bvaluations\b[^{}]*\}\s*=[^=]/,
      /\[\s*["'`]valuations["'`]\s*\]/,
    ];
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
   * **`broker_settled_eur` is informative** (ADR-0030): no projection, no tax
   * figure and no balance reads it. A closed list of modules may: the
   * validation, and the one function that sets it beside the ECB figure for the
   * interfaces to show. Checked in the domain **and** in both interfaces, with
   * the ways of reading a field the test of the valuations above learnt — a
   * dot, a destructuring (which once slipped past it), a string index — and a
   * destructured parameter, which slipped past this one.
   */
  it("keeps every read of broker_settled_eur on a closed list", () => {
    const allowed = new Set([
      join(domainSrc, "schema", "validate.ts"),
      join(domainSrc, "ecb", "broker-settlement.ts"),
    ]);
    const reads = [
      /\.broker_settled_eur\b/,
      /\{[^{}]*\bbroker_settled_eur\b[^{}]*\}\s*=[^=]/,
      /\[\s*["'`]broker_settled_eur["'`]\s*\]/,
      // A destructured parameter, `({ broker_settled_eur }: T) =>`, which the assignment pattern
      // above does not see: the pattern, an optional annotation, the closing parenthesis and then
      // an arrow, a body or a return type.
      /[(,]\s*\{[^{}]*\bbroker_settled_eur\b[^{}]*\}\s*(?::\s*(?:\{[^{}]*\}|[^(){}]*))?\s*\)\s*(?:=>|\{|:)/,
    ];
    const apps = join(repoRoot, "apps");
    const files = [
      ...listTsFiles(domainSrc),
      ...readdirSync(apps).flatMap((app) => {
        const src = join(apps, app, "src");
        return statSync(src, { throwIfNoEntry: false })?.isDirectory() === true
          ? listSourceFiles(src)
          : [];
      }),
    ];
    const violations = files
      .filter((file) => !allowed.has(file))
      .filter((file) => {
        const code = readFileSync(file, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, " ")
          .replace(/\/\/[^\n]*/g, " ");
        return reads.some((pattern) => pattern.test(code));
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
    // The manual leaf, named: the gate reads the valuations through it, so they are read in one
    // place.
    const manualLeaf = join(projections, "manual-price.ts");
    const violations = [...reachableFrom(graph, pricesFile).values()]
      .filter((chain) => {
        const file = chain[chain.length - 1] as string;
        return (
          file !== pricesFile &&
          file !== manualLeaf &&
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
   * - a file is **price-aware** when it reaches `prices.ts`, the single gate, the manual leaf, a
   *   port of prices or any file of `quotes/`: a module of prices that did not import `prices.ts`
   *   would be invisible here, and the tax engine could import it with this test green.
   *
   * The two sets must not meet, at any depth. Checking direct imports against
   * two fixed lists left a new file in neither list and a leak one hop away
   * from being seen; this sees the whole chain and prints it.
   *
   * Note which way round it is: a view reading `theses.ts` is fine, and that is
   * exactly why the index comparison lives in `bucket-theses.ts` and **wraps**
   * `theses()` instead of extending it. What is forbidden is the fiscal path
   * learning what a price is.
   */
  it("keeps prices out of every fiscal calculation, transitively", () => {
    const graph = importGraph();
    const pricesFile = join(domainSrc, "projections", "prices.ts");
    const projectLedger = join(domainSrc, "projections", "project-ledger.ts");
    // The tax engine is the fiscal path by definition: every file of `tax/` is a root too, so a
    // price can reach neither the projection nor the base of the return.
    const taxDir = join(domainSrc, "tax");
    const roots = [
      projectLedger,
      ...listTsFiles(domainSrc).filter((file) => !relative(taxDir, file).startsWith("..")),
    ];
    expect(roots.length).toBeGreaterThan(4);
    const fiscal = new Map<string, string[]>();
    for (const root of roots) {
      for (const [file, chain] of reachableFrom(graph, root)) {
        if (!fiscal.has(file)) {
          fiscal.set(file, chain);
        }
      }
    }
    expect(fiscal.size).toBeGreaterThan(1);
    const roots2 = priceRoots();
    expect(roots2).toContain(pricesFile);
    const violations = [...fiscal.entries()]
      .map(([file, chain]) => ({ chain, toPrices: priceReachedFrom(graph, file, roots2) }))
      .filter((entry) => entry.toPrices !== undefined)
      .map((entry) => `${asChain(entry.chain)}  ==  then  ==>  ${asChain(entry.toPrices ?? [])}`);
    expect(violations).toEqual([]);
  });
});

/**
 * The guards above read the graph of **static** imports. A dynamic `import()` is invisible to it,
 * so one in the domain would dodge every one of them. None exists; none may.
 */
describe("architecture: the graph the guards read is the whole graph", () => {
  it("uses no dynamic import in the domain", () => {
    const violations = listTsFiles(domainSrc)
      .filter((file) =>
        /\bimport\s*\(/.test(
          readFileSync(file, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            .replace(/\/\/[^\n]*/g, " "),
        ),
      )
      .map((file) => relative(repoRoot, file));
    expect(violations).toEqual([]);
  });
});
