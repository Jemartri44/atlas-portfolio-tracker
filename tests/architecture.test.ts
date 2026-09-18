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
   * prices, `prices.ts` is the only file that changes; a projection that reads
   * the valuations on its own would silently keep ignoring them.
   *
   * The three exceptions are not price lookups: `operations.ts` fills the list,
   * `snapshot.ts` serialises it and `valuations.ts` is the Modelo 720 view,
   * which enumerates registered valuations instead of asking what an asset is
   * worth on a date.
   */
  it("keeps every price lookup behind the gate of prices.ts", () => {
    const allowed = new Set(
      ["prices.ts", "valuations.ts", "snapshot.ts", "operations.ts"].map((name) =>
        join(domainSrc, "projections", name),
      ),
    );
    const violations = listTsFiles(domainSrc)
      .filter((file) => !allowed.has(file) && readFileSync(file, "utf8").includes(".valuations"))
      .map((file) => relative(repoRoot, file));
    expect(violations).toEqual([]);
  });

  /**
   * Constitution II: prices are informative and no tax calculation may depend
   * on them. The phase-2 projections stay on their side of the line, and the
   * fiscal ones never learn that a price exists.
   */
  it("keeps prices out of every fiscal calculation", () => {
    const projections = join(domainSrc, "projections");
    /** Views: they may read the fiscal state, never compute with it. */
    const informative = [
      "prices.ts",
      "weights.ts",
      "contribution.ts",
      "simulate-transfer.ts",
      "costs.ts",
      "networth.ts",
      "bucket.ts",
      "bucket-stats.ts",
    ];
    /** The engine: what computes lots and gains. No view may import it. */
    const engine = ["lots.ts", "gains.ts", "income.ts", "corporate-actions.ts", "primitives.ts"];
    /**
     * The whole fiscal path: the engine plus everything pass B of the projection
     * calls. None of it may learn what a price is — if `theses.ts` did, the code
     * that creates lots and gains would depend on prices through it, which is
     * what constitution II forbids. That is exactly why the index comparison
     * lives in `bucket.ts` and **wraps** `theses()` instead of extending it;
     * reading that projection from a view is fine, the other way round is not.
     */
    const fiscal = [...engine, "operations.ts", "theses.ts", "wash-sale.ts", "settings-impact.ts"];
    const forbiddenForFiscal = ["prices.js", "bucket.js", "bucket-stats.js", "networth.js"];
    const violations: string[] = [];
    for (const file of informative) {
      for (const specifier of specifiersOf(readFileSync(join(projections, file), "utf8"))) {
        if (engine.some((name) => specifier.endsWith(name.replace(".ts", ".js")))) {
          violations.push(`${file} -> ${specifier}`);
        }
        if (specifier.endsWith("fiscal-date.js")) {
          violations.push(`${file} -> ${specifier}`);
        }
      }
    }
    for (const file of fiscal) {
      for (const specifier of specifiersOf(readFileSync(join(projections, file), "utf8"))) {
        if (forbiddenForFiscal.some((name) => specifier.endsWith(name))) {
          violations.push(`${file} -> ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
