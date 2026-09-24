import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
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
   * the three ways of reading a field the test of the valuations above learnt
   * — a dot, a destructuring (which once slipped past it) and a string index.
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
    // The tax engine (feature 009) is the fiscal path by definition: every file
    // of `tax/` is a root too, so a price can reach neither the projection nor
    // the base of the return.
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
    const violations = [...fiscal.entries()]
      .map(([file, chain]) => ({ chain, toPrices: reachableFrom(graph, file).get(pricesFile) }))
      .filter((entry) => entry.toPrices !== undefined)
      .map((entry) => `${asChain(entry.chain)}  ==  then  ==>  ${asChain(entry.toPrices ?? [])}`);
    expect(violations).toEqual([]);
  });
});

/**
 * Feature 009, decision (f): the tax engine converts every amount at the ECB
 * rate **of its own operation**, as published and with its date (ADR-0013).
 * `state.fxRates` is the last rate the ledger knows per currency, a convenience
 * for valuing cash today; reading it from `tax/` would convert a disposal of
 * 2027 at a rate of 2029. And `state.valuations` are prices. Neither may be
 * read there, in either of the two forms a read can take.
 */
describe("architecture: the tax engine", () => {
  it("reads neither the known FX rates nor the valuations of the state", () => {
    const taxDir = join(domainSrc, "tax");
    // The three forms a read can take: a property, a destructuring and a
    // bracket with the name written as a string.
    const reads = [
      /\.(?:fxRates|valuations)\b/,
      /\{[^{}]*\b(?:fxRates|valuations)\b[^{}]*\}\s*=[^=]/,
      /\[\s*["'`](?:fxRates|valuations)["'`]\s*\]/,
    ];
    const files = listTsFiles(taxDir);
    expect(files.length).toBeGreaterThan(4);
    const violations = files
      .filter((file) => reads.some((pattern) => pattern.test(readFileSync(file, "utf8"))))
      .map((file) => relative(repoRoot, file));
    expect(violations).toEqual([]);
  });

  /**
   * The Modelo 720 view (`projections/valuations.ts`) reads valuations because
   * the law values that return at market prices. The next feature puts it next
   * to the tax engine; this keeps the engine from ever reaching it, at any depth.
   */
  it("never reaches the valuations view, at any depth", () => {
    const graph = importGraph();
    const taxDir = join(domainSrc, "tax");
    const view = join(domainSrc, "projections", "valuations.ts");
    const violations = listTsFiles(taxDir)
      .map((file) => reachableFrom(graph, file).get(view))
      .filter((chain): chain is string[] => chain !== undefined)
      .map(asChain);
    expect(violations).toEqual([]);
  });

  /**
   * Feature 010, block 3: the informative returns (Modelo 720 and 721) are the
   * **only** fiscal route the law makes value things at market price, and they
   * live in `informative/` for that reason alone. The income tax may not depend
   * on a price (constitution II), so the fiscal path —everything
   * `project-ledger.ts` and every file of `tax/` reach— must not reach a single
   * file of that folder, at any depth.
   *
   * The other direction is allowed and is the point: `informative/` reads
   * `prices.ts` and the catalogue of criteria. A table of criteria is a table;
   * what must never happen is the return learning what a price is.
   */
  it("keeps the informative returns out of reach of every fiscal calculation", () => {
    const graph = importGraph();
    const informative = join(domainSrc, "informative");
    const taxDir = join(domainSrc, "tax");
    const roots = [join(domainSrc, "projections", "project-ledger.ts"), ...listTsFiles(taxDir)];
    const violations: string[] = [];
    for (const root of roots) {
      for (const [file, chain] of reachableFrom(graph, root)) {
        if (!relative(informative, file).startsWith("..")) {
          violations.push(asChain(chain));
        }
      }
    }
    expect(violations).toEqual([]);
  });

  /**
   * And they read it at **level 1**: a registered `valuation`, which is a
   * decision of the user. The specification makes the photograph of the year
   * end a manual datum on purpose (§7.1 and §14.1), so an automatic quote of
   * phase 4 must never walk into a tax return. `priceAt` only returns one when
   * it is handed an `ExternalPrices`, so the rule is that this folder never
   * names one — checked on the text, where the mistake would be made.
   */
  it("never lets an automatic quote into an informative return", () => {
    const offenders = listTsFiles(join(domainSrc, "informative"))
      // Comments are not code: what the rule forbids is naming the type or
      // passing the argument, and both of those are code.
      .filter((file) =>
        /\bExternalPrices\b|\bExternalQuote\b|external\s*[:,)]/.test(
          readFileSync(file, "utf8").replace(/\/\/[^\n]*/g, ""),
        ),
      )
      .map((file) => relative(repoRoot, file));
    expect(offenders).toEqual([]);
  });

  /** And the rule is not vacuous: the informative returns do read the price gate. */
  it("lets the informative returns read a price, which is what they are for", () => {
    const graph = importGraph();
    const m720 = join(domainSrc, "informative", "m720.ts");
    const prices = join(domainSrc, "projections", "prices.ts");
    expect(reachableFrom(graph, m720).get(prices)).toBeDefined();
    expect(listTsFiles(join(domainSrc, "informative")).length).toBeGreaterThan(4);
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

/*
 * The stylesheet and the markup have to talk about the same classes.
 *
 * What this exists for: `Nav.tsx` shipped a `<nav>` with no `class="nav"` while
 * `layout.css` carried twenty rules under `.nav`. Everything compiled, all the
 * tests passed, and the navigation had no styles at all — icons at their
 * intrinsic size, sideways scrolling at 360px and no rail on the desktop. It
 * cost one forgotten attribute and nothing in the repository could see it.
 *
 * So both directions are checked, over the real files: every class the
 * stylesheet targets is written by the markup, and every class the markup
 * writes literally is declared by our CSS or by vendored uPlot (a misspelt
 * class is the same defect mirrored).
 */

/** Class selectors of a stylesheet, with comments and declarations removed. */
const cssClassesOf = (source: string): Set<string> => {
  const found = new Set<string>();
  const selectors = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{[^{}]*\}/g, "{}")
    .split(/[{}]/);
  for (const chunk of selectors) {
    for (const match of chunk.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      found.add(match[1] as string);
    }
  }
  return found;
};

interface ClassAttribute {
  /** `class="a b"`, whose tokens are exactly what the browser gets. */
  literal: boolean;
  text: string;
}

/** The value of every `class=` of a file, static or an expression. */
const classAttributesOf = (source: string): ClassAttribute[] => {
  const found: ClassAttribute[] = [];
  for (let at = source.indexOf("class="); at !== -1; at = source.indexOf("class=", at + 1)) {
    const start = at + "class=".length;
    const opening = source.charAt(start);
    if (opening === '"' || opening === "'") {
      const end = source.indexOf(opening, start + 1);
      found.push({ literal: true, text: source.slice(start + 1, end) });
      continue;
    }
    if (opening !== "{") {
      continue;
    }
    let depth = 0;
    let end = start;
    for (; end < source.length; end += 1) {
      const character = source.charAt(end);
      if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
    }
    found.push({ literal: false, text: source.slice(start + 1, end) });
  }
  return found;
};

const CLASS_NAME = /^-?[_a-zA-Z][\w-]*$/;

/** Stands where an interpolation was: `@` cannot appear in a class name. */
const HOLE = "@";

interface MarkupClasses {
  /** Names written in full. */
  exact: Set<string>;
  /**
   * Beginnings of a name completed at runtime (`` `item is-${severity}` ``).
   * The suffix comes from a union of values, and a rule that pretended
   * otherwise would have to enumerate them.
   */
  prefixes: Set<string>;
}

const addTokens = (text: string, into: Set<string>): void => {
  for (const token of text.split(/\s+/)) {
    if (CLASS_NAME.test(token)) {
      into.add(token);
    }
  }
};

/** Mines a `class={…}` expression, recursing into its interpolations. */
const mineClasses = (expression: string, found: MarkupClasses): void => {
  for (const match of expression.matchAll(/"([^"]*)"|'([^']*)'/g)) {
    addTokens((match[1] ?? match[2]) as string, found.exact);
  }
  let flat = "";
  const holes: string[] = [];
  for (let at = 0; at < expression.length; at += 1) {
    if (expression.charAt(at) !== "$" || expression.charAt(at + 1) !== "{") {
      flat += expression.charAt(at);
      continue;
    }
    let depth = 0;
    let end = at + 1;
    for (; end < expression.length; end += 1) {
      const character = expression.charAt(end);
      if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
    }
    holes.push(expression.slice(at + 2, end));
    flat += HOLE;
    at = end;
  }
  for (const match of flat.matchAll(/`([^`]*)`/g)) {
    for (const part of (match[1] as string).split(/\s+/)) {
      const pieces = part.split(HOLE);
      pieces.forEach((piece, index) => {
        if (piece === "") {
          return;
        }
        if (pieces.length === 1 || index === pieces.length - 1) {
          addTokens(piece, found.exact);
        } else if (CLASS_NAME.test(`${piece}x`)) {
          found.prefixes.add(piece);
        }
      });
    }
  }
  for (const hole of holes) {
    mineClasses(hole, found);
  }
};

/**
 * Every stylesheet of `src/styles` except the one that only imports the rest:
 * read from the folder, so a new layer of the design system cannot be left
 * out of the check by forgetting to add it to a list.
 */
const STYLESHEETS = readdirSync(join(webSrc, "styles")).filter(
  (name) => name.endsWith(".css") && name !== "index.css",
);

const ourClasses = (): Set<string> =>
  new Set(
    STYLESHEETS.flatMap((name) => [
      ...cssClassesOf(readFileSync(join(webSrc, "styles", name), "utf8")),
    ]),
  );

const markupClasses = (): MarkupClasses & { literal: Set<string> } => {
  const found: MarkupClasses & { literal: Set<string> } = {
    exact: new Set(),
    prefixes: new Set(),
    literal: new Set(),
  };
  for (const file of listSourceFiles(webSrc).filter((name) => name.endsWith(".tsx"))) {
    for (const attribute of classAttributesOf(readFileSync(file, "utf8"))) {
      if (attribute.literal) {
        addTokens(attribute.text, found.literal);
        addTokens(attribute.text, found.exact);
      } else {
        mineClasses(attribute.text, found);
      }
    }
  }
  return found;
};

/**
 * Classes no markup writes because a function returns them. Each one with its
 * reason, like the allowed URLs of `scripts/check-bundle.mjs`: an exception has
 * to be looked at, not waved through by a wildcard.
 */
const RUNTIME_CLASSES = [
  { name: "positive", reason: "la devuelve signOf()/signOfValue() y la pinta Amount o Figure" },
  { name: "negative", reason: "idem, cuando el valor es negativo" },
  {
    name: "mask",
    reason: "la compone amountDisplay() en format/money.ts, la puerta de privacidad",
  },
  {
    name: "u-wrap",
    reason: "la escribe uPlot al construir la gráfica; nuestro CSS solo la centra",
  },
];

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
    /*
     * Two consumers, enumerated, each with its reason:
     *
     * - `Amount.tsx` is the gate of the interface: every figure a screen paints
     *   goes through it (decision (d) of prompt 006).
     * - `chart/axis.ts` exists because uPlot asks for functions that take
     *   numbers and return the labels of an axis and of a tooltip, where there
     *   is no component to go through. Authorised in feature 007 (Q5) on the
     *   condition that a rendered test proves the mask applies there too:
     *   **the axis of a chart is an amount for every purpose**.
     */
    const allowed = new Set([
      join(webSrc, "components", "Amount.tsx"),
      join(webSrc, "components", "chart", "axis.ts"),
    ]);
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
   * The other half of that gate: the figures a message **says**.
   *
   * `Amount` covers every figure a screen paints, and none of the warnings and
   * errors the domain writes as prose goes through it — they are strings. So
   * the mask on, the table said `••••` and the warning right under it said "el
   * aporte bruto al cubo (5000 EUR) supera el tope de 6000 EUR" (N11 of the
   * review of feature 007). The fix is that a template asks `format/privacy.ts`
   * for its figures instead of writing them, and this is what keeps the next
   * template from forgetting: it reads the catalogues and refuses a detail that
   * is an amount or a quantity by name and goes in with `text()`.
   *
   * Both directions, like the stylesheet rules above: a figure that is not
   * masked, and something masked that is not a figure — masking a percentage
   * or a date would be the same defect mirrored, and the mode would stop being
   * readable in public, which is what it is for.
   */
  const SENSITIVE_DETAIL =
    /_eur$|_quantity$|^(?:amount|quantity|position|available|open|missing|distributed|core|gross|loss|invested|cost)$/;

  /** A detail whose **name** matches but which is not a figure, with its reason. */
  const NOT_A_FIGURE: Record<string, string> = {
    "liquidation_must_cover_all_accounts.missing": "son las cuentas que faltan, no una cantidad",
  };

  /**
   * And a figure whose name says nothing, so the catalogue has to say it.
   * `invalid_settings` is not here: its value is an amount or a percentage
   * depending on the field it names, and the catalogue decides that with its
   * own `MONEY_SETTINGS`, outside the sentence.
   */
  const A_FIGURE_ANYWAY = new Set([
    "invalid_amount.value",
    "invalid_quantity.value",
    // The configured figures of the informative returns: amounts in euros the
    // user set, said back to him when one contradicts the other.
    "alert_above_threshold.alert",
    "alert_above_threshold.threshold",
  ]);

  /** Each entry of a catalogue with its body, from its key to the next one. */
  const templatesOf = (source: string): Map<string, string> => {
    const keys = [...source.matchAll(/^ {2}([a-z_0-9]+):\s*\(/gm)];
    const bodies = new Map<string, string>();
    keys.forEach((key, index) => {
      const start = key.index as number;
      const end = index + 1 < keys.length ? (keys[index + 1]?.index as number) : source.length;
      bodies.set(key[1] as string, source.slice(start, end));
    });
    return bodies;
  };

  /** What a template **prints**: the inside of each `${…}` of its sentence. */
  const interpolationsOf = (body: string): string[] => {
    const found: string[] = [];
    for (let at = body.indexOf("${"); at !== -1; at = body.indexOf("${", at + 1)) {
      let depth = 0;
      let end = at + 1;
      for (; end < body.length; end += 1) {
        const character = body.charAt(end);
        if (character === "{") {
          depth += 1;
        } else if (character === "}") {
          depth -= 1;
          if (depth === 0) {
            break;
          }
        }
      }
      found.push(body.slice(at + 2, end));
    }
    return found;
  };

  /** The call this read sits directly inside: `f.money`, `text`, `n.one`… */
  const wrappingCall = (text: string, at: number): string => {
    let depth = 0;
    for (let index = at - 1; index >= 0; index -= 1) {
      const character = text.charAt(index);
      if (character === ")") {
        depth += 1;
      } else if (character === "(") {
        if (depth === 0) {
          return /([\w.]+)$/.exec(text.slice(0, index))?.[1] ?? "";
        }
        depth -= 1;
      }
    }
    return "";
  };

  it("masks every amount and quantity a message says, and only those", () => {
    const catalogues = ["errors.ts", "warnings.ts"].map((name) =>
      join(webSrc, "format", "messages", name),
    );
    const bare: string[] = [];
    const overreach: string[] = [];
    let checked = 0;
    for (const file of catalogues) {
      for (const [code, body] of templatesOf(readFileSync(file, "utf8"))) {
        for (const printed of interpolationsOf(body)) {
          for (const read of printed.matchAll(/\bd\.([a-z_0-9]+)\b/g)) {
            const where = `${code}.${read[1]}`;
            const sensitive =
              (SENSITIVE_DETAIL.test(read[1] as string) && NOT_A_FIGURE[where] === undefined) ||
              A_FIGURE_ANYWAY.has(where);
            const call = wrappingCall(printed, read.index as number);
            // `f.titles` is `f.quantity` with its word, «título» or «títulos».
            const wrapped = call === "f.money" || call === "f.quantity" || call === "f.titles";
            if (sensitive) {
              checked += 1;
              if (!wrapped) {
                bare.push(`${where} (${call === "" ? "sin envolver" : call})`);
              }
            } else if (wrapped) {
              overreach.push(`${where} (${call})`);
            }
          }
        }
      }
    }
    // The scanner itself: if it stops finding figures, the rule passes vacuously.
    expect(checked).toBeGreaterThan(15);
    expect([...new Set(bare)].sort()).toEqual([]);
    expect([...new Set(overreach)].sort()).toEqual([]);
  });

  /**
   * FR-014: importing the browser store must not drag `node:fs` into the
   * bundle. The barrel of `@atlas/adapters` exports `FileLedgerStore`, so the
   * web imports subpaths only. `scripts/check-bundle.mjs` verifies the same
   * thing on the built output; this one says it in the source, where the fix is.
   */
  /**
   * **The browser never writes in a folder of the disk** (feature 012,
   * decision of the direction). The File System Access API cannot create a
   * file exclusively, so the web cannot take the lock of the console's folder;
   * without the lock, a write of the web there could overwrite a line of the
   * console in silence. So the web keeps its ledger in its own storage and
   * only **reads** from the folder, and every writing primitive of the API is
   * forbidden here, in the web and in the browser adapters. IndexedDB's own
   * `"readwrite"` transactions are not this: they are positional, never a
   * `mode:` option.
   */
  it("never writes in a folder of the disk from the browser", () => {
    const writing = [
      /\.createWritable\s*\(/,
      /\.createSyncAccessHandle\s*\(/,
      /\bcreate\s*:\s*true\b/,
      /\.removeEntry\s*\(/,
      /\.move\s*\(/,
      /\bmode\s*:\s*["'`]readwrite["'`]/,
      /showSaveFilePicker/,
    ];
    const browserAdapters = join(
      repoRoot,
      "packages",
      "adapters",
      "src",
      "ledger-store",
      "browser",
    );
    const violations = [...listSourceFiles(webSrc), ...listSourceFiles(browserAdapters)]
      .filter((file) => {
        const code = readFileSync(file, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, " ")
          .replace(/\/\/[^\n]*/g, " ");
        return writing.some((pattern) => pattern.test(code));
      })
      .map((file) => relative(repoRoot, file));
    expect(violations).toEqual([]);
  });

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
  /**
   * Direction one: a rule with no element. This is the one that failed in the
   * review, and the reason it is written down.
   */
  it("styles no class the markup never writes", () => {
    const { exact, prefixes } = markupClasses();
    const runtime = new Set(RUNTIME_CLASSES.map((entry) => entry.name));
    const written = (name: string): boolean =>
      exact.has(name) ||
      runtime.has(name) ||
      [...prefixes].some((prefix) => name.startsWith(prefix));
    expect([...ourClasses()].filter((name) => !written(name)).sort()).toEqual([]);
  });

  /** Direction two: an element with no rule, which is the same typo mirrored. */
  it("writes no class the stylesheet does not declare", () => {
    // The vendored stylesheet counts as a declaration: the `.u-*` classes are
    // uPlot's own, written by it at runtime and styled by it.
    const vendored = [join(webRoot, "vendor", "uplot", "uPlot.css")].flatMap((path) => [
      ...cssClassesOf(readFileSync(path, "utf8")),
    ]);
    const declared = new Set([...ourClasses(), ...vendored]);
    const violations = [...markupClasses().literal].filter((name) => !declared.has(name)).sort();
    expect(violations).toEqual([]);
  });
  /*
   * The shell used to be guarded here by declarations that had to exist in
   * `layout.css`, each one there to beat a default of Pico. Pico is gone
   * (ADR-0023), and what those rules protected — a navigation that fits, a
   * screen whose content is shown at every width — is now checked on what the
   * browser **applies**, in `apps/web/test/shell.test.tsx`.
   */

  /**
   * FR-047: a `catch` that does nothing is a defect. It is how a failure becomes
   * a screen that does not react — the user presses, nothing happens, and
   * nothing anywhere says why.
   *
   * A `catch` **may** be silent when the thing that failed is a convenience and
   * the code carries on regardless; those are the three reads and writes of
   * `localStorage`, which throw in a private window. They are recognised by
   * having a comment inside, which is the point: the reason is written where the
   * next reader will look.
   */
  it("swallows no exception in silence", () => {
    const empty = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
    const violations: string[] = [];
    for (const file of listSourceFiles(webSrc)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(empty)) {
        violations.push(`${relative(repoRoot, file)}: ${match[0].replace(/\s+/g, " ")}`);
      }
    }
    expect(violations).toEqual([]);
  });

  /**
   * Decision (g) of prompt 007: no file of `apps/web/src` above ~250 lines
   * without a written reason. The user asked for this in so many words — that
   * the frontend must not turn into a large amount of code that is hard to
   * change — and a ceiling nobody checks is a wish.
   *
   * The exception exists and is allowed; what is not allowed is an exception
   * nobody had to justify. A file over the ceiling carries `LINE BUDGET:` in its
   * header with the reason, and that reason is read in review.
   */
  it("keeps every file of the web under 250 lines, or says why not", () => {
    const LIMIT = 250;
    const violations: string[] = [];
    for (const file of listSourceFiles(webSrc)) {
      const source = readFileSync(file, "utf8");
      const lines = source.split("\n").length;
      if (lines > LIMIT && !source.includes("LINE BUDGET:")) {
        violations.push(`${relative(repoRoot, file)}: ${lines} líneas y ninguna razón escrita`);
      }
    }
    expect(violations.sort()).toEqual([]);
  });

  /**
   * The ceiling itself applies to code, not to the cascade (Q8, answer (a)) —
   * but the exemption was granted **on condition that each stylesheet over the
   * ceiling carries its reason**, and a condition nobody checks is a wish too.
   */
  it("asks the long stylesheets for the same written reason", () => {
    const LIMIT = 250;
    const styles = join(webSrc, "styles");
    const violations: string[] = [];
    for (const entry of readdirSync(styles).filter((name) => name.endsWith(".css"))) {
      const source = readFileSync(join(styles, entry), "utf8");
      const lines = source.split("\n").length;
      if (lines > LIMIT && !source.includes("LINE BUDGET:")) {
        violations.push(`styles/${entry}: ${lines} líneas y ninguna razón escrita`);
      }
    }
    expect(violations.sort()).toEqual([]);
  });

  /**
   * Nothing that is read goes below 13px (brief §10 and §13): the bottom bar
   * used to carry its labels at 10px, and a test demanded that token. Now the
   * scale itself is checked — every `--text-*` step, at every width — and every
   * `font-size` of our stylesheets has to come from it, or be relative to a
   * figure that does (the dots of the mask, the euro of a hero figure).
   */
  it("keeps every step of the type scale at 13px or more", () => {
    const tokens = readFileSync(join(webSrc, "styles", "tokens.css"), "utf8");
    const steps = [...tokens.matchAll(/--text-[a-z0-9-]+:\s*([\d.]+)rem/g)].map((match) =>
      Number.parseFloat(match[1] as string),
    );
    expect(steps.length).toBeGreaterThan(7);
    expect(steps.filter((rem) => rem * 16 < 13)).toEqual([]);

    const loose: string[] = [];
    for (const name of STYLESHEETS) {
      const css = readFileSync(join(webSrc, "styles", name), "utf8").replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      );
      for (const match of css.matchAll(/font-size:\s*([^;]+);/g)) {
        const value = (match[1] as string).trim();
        if (!/^(var\(--(text|t)-[a-z0-9-]+\)|inherit|[\d.]+em)$/.test(value)) {
          loose.push(`${name}: font-size: ${value}`);
        }
      }
    }
    expect(loose).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Feature 010, block 5. Nobody writes over a filed return in silence.
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

describe("architecture: no interface writes over a filed return in silence", () => {
  const WRITE_USE_CASES = ["recordEvent", "correctEvent", "reverseEvent"];
  const IMPACT = "closedYearImpact";

  /**
   * The names a file takes from the domain, imports only — through the barrel
   * or through the `@atlas/domain/fiscal` door, which is where the tax engine
   * lives since it had to be kept off the boot path of the web.
   *
   * **Both** import forms. A named import is what everything here uses, but
   * `import * as domain` followed by `domain.recordEvent(…)` writes exactly
   * the same and used to walk straight past this test, which is the obvious
   * way around it: with a namespace, the members read off it count as
   * bindings.
   */
  const domainBindings = (source: string): Set<string> => {
    const found = new Set<string>();
    for (const match of source.matchAll(
      /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]@atlas\/domain(?:\/fiscal)?['"]/g,
    )) {
      for (const binding of (match[1] as string).split(",")) {
        const name = binding
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0];
        if (name !== undefined && name.length > 0) {
          found.add(name);
        }
      }
    }
    for (const match of source.matchAll(
      /import\s*(?:type\s*)?\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"]@atlas\/domain(?:\/fiscal)?['"]/g,
    )) {
      for (const use of source.matchAll(
        new RegExp(`\\b${match[1] as string}\\.([A-Za-z_$][\\w$]*)`, "g"),
      )) {
        found.add(use[1] as string);
      }
    }
    return found;
  };

  /** A relative specifier as a file on disk: `.js` and `.jsx` are written, `.ts`/`.tsx` exist. */
  const fileOf = (from: string, specifier: string): string | undefined => {
    if (!specifier.startsWith(".")) {
      return undefined;
    }
    const target = resolve(dirname(from), specifier);
    const bare = target.replace(/\.(js|jsx)$/, "");
    const candidates = [
      target,
      `${bare}.ts`,
      `${bare}.tsx`,
      join(target, "index.ts"),
      join(target, "index.tsx"),
    ];
    return candidates.find((path) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    });
  };

  /** The text with its comments removed: a name written in prose is not a call. */
  const codeOf = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  const appFiles = (): string[] =>
    readdirSync(join(repoRoot, "apps")).flatMap((app) => {
      const src = join(repoRoot, "apps", app, "src");
      try {
        return statSync(src).isDirectory() ? listSourceFiles(src) : [];
      } catch {
        return [];
      }
    });

  it("enumerates every module that writes, and asks each to reach the impact", () => {
    const sources = new Map(appFiles().map((file) => [file, readFileSync(file, "utf8")]));
    const writers = [...sources]
      .filter(([, source]) =>
        WRITE_USE_CASES.some((useCase) => domainBindings(source).has(useCase)),
      )
      .map(([file]) => relative(repoRoot, file))
      .sort();
    // The closed list. Adding an interface here is the question "does it warn?"
    expect(writers).toEqual([
      "apps/cli/src/commands/corporate-actions.ts",
      "apps/cli/src/commands/rectify.ts",
      "apps/cli/src/commands/shared.ts",
      "apps/web/src/ledger/write.ts",
    ]);

    const graph = new Map(
      [...sources].map(([file, source]) => [
        file,
        specifiersOf(source)
          .map((specifier) => fileOf(file, specifier))
          .filter((target): target is string => target !== undefined),
      ]),
    );
    const silent = writers.filter((name) => {
      const root = join(repoRoot, name);
      // Two conditions, and the second is the one that bites. Reaching the
      // impact through the graph is not enough: every CLI command imports
      // `shared.ts` for the confirmation, and `shared.ts` names the impact, so
      // the graph alone calls a module that warns nobody "covered". The module
      // has to **name** the warning in its own code as well, which is what
      // disappears the day somebody deletes the call.
      const reaches = [...reachableFrom(graph, root).keys()].some((file) =>
        domainBindings(sources.get(file) ?? "").has(IMPACT),
      );
      return !reaches || !/\bclosedYear/.test(codeOf(sources.get(root) ?? ""));
    });
    expect(silent).toEqual([]);
  });

  /**
   * The condition above is per **file**, and a file holds more than one
   * command: `rectify.ts` has `edit` and `delete`, each with its own call, and
   * deleting the one in `edit` left the whole suite green because `delete`,
   * two functions below, still named the warning. So for the console the rule
   * is per **command**.
   *
   * It is the console and not the web because the two warn in different
   * places by design: a console command prints the warning itself, right
   * before its question, while in the web the screens ask `write.ts` for the
   * impact and render the notice, so the function that writes is not the one
   * that warns. What holds the web is the notice being the same component in
   * the four screens, and its own tests.
   *
   * What this does **not** catch: a command that computes the warning and
   * never prints it, or prints it after writing. Those are read by the tests
   * of `apps/cli/test/commands/closed-year.test.ts`, which check the order.
   */
  it("asks every console command that writes to name the warning itself", () => {
    const files = appFiles().filter((file) => file.includes(`${sep}cli${sep}`));
    /** Top-level `const NAME = …` chunks, exported or not, in order. */
    const chunksOf = (code: string): { name: string; body: string }[] => {
      const found: { name: string; body: string }[] = [];
      const starts = [...code.matchAll(/\n(?:export )?const (\w+)\s*=/g)];
      for (const [index, match] of starts.entries()) {
        const from = match.index as number;
        const to = (starts[index + 1]?.index as number | undefined) ?? code.length;
        found.push({ name: match[1] as string, body: code.slice(from, to) });
      }
      return found;
    };
    const violations: string[] = [];
    for (const file of files) {
      const code = codeOf(readFileSync(file, "utf8"));
      const chunks = chunksOf(code);
      // The helpers of the module that carry the warning: a command that calls
      // one of them is warning, even if it never spells `closedYear` itself.
      const helpers = chunks
        .filter((chunk) => /\bclosedYear/.test(chunk.body))
        .map((chunk) => chunk.name);
      const carries = new RegExp(`\\b(closedYear${helpers.map((name) => `|${name}`).join("")})`);
      for (const chunk of chunks) {
        const writes = WRITE_USE_CASES.some((useCase) =>
          new RegExp(`\\b${useCase}\\s*\\(`).test(chunk.body),
        );
        if (writes && !carries.test(chunk.body)) {
          violations.push(`${relative(repoRoot, file)}: ${chunk.name} escribe y no avisa`);
        }
      }
    }
    expect(violations.sort()).toEqual([]);
  });
});

/**
 * **No compiled output is committed**, and this is not tidiness either.
 *
 * `packages/domain/test/` carried eight of them —`ledger-builder.js`,
 * `tax/helpers.js`, their maps and their declarations— emitted by a `tsc`
 * without an outDir and added by hand. A compiled twin **shadows its source**:
 * the tests import `./helpers.js`, Vite resolves that to the real file when
 * there is one, and the `.ts` beside it is never read. Measured: with a
 * `throw` at the top of `helpers.ts` the whole suite stayed green, so for a
 * while the tests were validating code nobody edits. That they happened to
 * agree was luck, not design.
 *
 * `.gitignore` carries the patterns, but it protects from neither `git add -f`
 * nor a file that is already tracked, so **what is asked here is the index**:
 * a tracked file that is the compiled twin of a tracked source fails the
 * build. Source maps are asked for separately, because one whose source was
 * deleted has no twin left to give it away.
 */
describe("architecture: no compiled output is committed", () => {
  /** What `git` says is in the index. Never the working tree. */
  const tracked = (): string[] => {
    const out = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
    const files = out.split("\n").filter((line) => line.length > 0);
    // A guard on the guard: without git this would pass by looking at nothing.
    if (files.length < 100) {
      throw new Error(`git ls-files devolvió ${files.length} ficheros: no se puede comprobar`);
    }
    return files;
  };

  const SUFFIXES = [".js.map", ".d.ts.map", ".d.ts", ".js", ".jsx"];

  it("keeps out every file that is the compiled twin of a source", () => {
    const files = new Set(tracked());
    const twins = [...files]
      .filter((file) => {
        const suffix = SUFFIXES.find((candidate) => file.endsWith(candidate));
        if (suffix === undefined) {
          return false;
        }
        const base = file.slice(0, -suffix.length);
        return files.has(`${base}.ts`) || files.has(`${base}.tsx`);
      })
      .sort();
    expect(twins).toEqual([]);
  });

  it("keeps out every source map, wherever it is", () => {
    // A `.map` is never written by hand. `vendor/` is exempt because what is
    // vendored is somebody else's build, kept on purpose (ADR-0005, ADR-0017).
    const maps = tracked()
      .filter((file) => file.endsWith(".map") && !file.includes("/vendor/"))
      .sort();
    expect(maps).toEqual([]);
  });
});

/**
 * **An object literal asserted into a type** is how the deduction for double
 * taxation shipped a row with three fields missing.
 *
 * The line was `const row = { event_id: line.event_id } as BoxRow;`. It
 * compiled, because `as` silences the compiler by construction; the other three
 * fields of `BoxRow` were `undefined` at run time; and both interfaces printed
 * "undefined undefined" beside every deduction for two whole blocks without a
 * single test noticing. The invariant that now checks every row of the layout
 * covers **that** type. This covers the **pattern**, which can be written into
 * any other.
 *
 * Why a test and not a rule of the linter: Biome 2.5.9 has
 * `nursery/noUnsafeTypeAssertion`, which forbids **every** assertion but `as
 * const`. Measured on `packages/domain/src`, it flags 20 places, and almost
 * all of them are `state.gains[index] as RealizedGain` — narrowing an indexed
 * read under `noUncheckedIndexedAccess`, which fabricates nothing. Replacing
 * those with a run-time check would add a branch that cannot be reached, and
 * the domain is held at 100 % of branches: the rule would buy a real barrier
 * at the price of unreachable code. So the barrier is written here, over the
 * subset that actually fabricates a value.
 *
 * The list is of **files**, not of occurrences: a file that already does it
 * stays as it is, and a file that starts doing it has to be added by hand,
 * which is the moment somebody asks whether the object really has every field.
 *
 * Three shapes, because the first one alone had two measured holes: an array
 * of literals (`[{ … }] as T[]`, which reads `}]` and not `}`) and a literal
 * put in a variable and asserted a few lines below, which is the same
 * fabrication with a name in the middle. The second is matched by finding the
 * variables initialised with `{` or `[` and looking for `name as T` — never
 * `obj.name as T`, which is a property read and fabricates nothing.
 *
 * **Known limit**: the comments are stripped with a regular expression, so a
 * `//` inside a string literal cuts the rest of that line out of the scan. It
 * is left as it is: parsing TypeScript here to close it would cost more than
 * the hole, and saying what a test does not guarantee is worth more than
 * pretending otherwise.
 */
describe("architecture: no object literal is asserted into a type", () => {
  it("keeps the pattern to the files that already carry it", () => {
    // `}`, or `}]` for an array of literals, followed by `as <name>`. `as
    // const` is not an assertion of this kind and is allowed.
    const direct = /\}\s*\]?\s*as\s+(?!const\b)[A-Za-z_$][\w$]*/;
    /** `const x = {` / `= [`: a literal that gets a name before it is asserted. */
    const held = /(?:^|\n)\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*[{[]/g;
    const roots = [
      join(repoRoot, "packages", "domain", "src"),
      join(repoRoot, "packages", "adapters", "src"),
      join(repoRoot, "apps", "cli", "src"),
      join(repoRoot, "apps", "web", "src"),
    ];
    const asserts = (source: string): boolean => {
      if (direct.test(source)) {
        return true;
      }
      for (const match of source.matchAll(held)) {
        // `(?<![.\w$])` keeps `figures.items as FiledItem[]` out: reading a
        // property of something that exists is not fabricating a value.
        const later = new RegExp(
          `(?<![.\\w$])${match[1] as string}\\s+as\\s+(?!const\\b)[A-Za-z_$]`,
        );
        if (later.test(source)) {
          return true;
        }
      }
      return false;
    };
    const offenders = roots
      .flatMap((root) => listSourceFiles(root))
      .filter((file) => {
        const source = readFileSync(file, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, " ")
          .replace(/\/\/[^\n]*/g, " ");
        return asserts(source);
      })
      .map((file) => relative(repoRoot, file))
      .sort();
    // The five added by the second shape are the **boundary of user input**:
    // a record built from flags or from a form, asserted into a draft and
    // handed to the domain, which validates its shape before writing a line
    // (`validateShape`). They fabricate nothing that goes unchecked; they are
    // on the list so that the sixth one has to be looked at.
    expect(offenders).toEqual([
      "apps/cli/src/commands/catalogue.ts",
      "apps/cli/src/commands/rectify.ts",
      "apps/cli/src/commands/shared.ts",
      "apps/web/src/routes/registrar/corporate/form.tsx",
      "apps/web/src/view-models/forms/values.ts",
      "apps/web/src/view-models/settings.ts",
      "packages/domain/src/projections/corporate-action-draft.ts",
      "packages/domain/src/settings/settings.ts",
      "packages/domain/src/synth/scenario.ts",
      "packages/domain/src/usecases/record-event.ts",
      "packages/domain/src/usecases/rectify.ts",
    ]);
  });
});
