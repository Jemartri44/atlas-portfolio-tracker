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
 * writes literally is declared by our CSS or by vendored Pico (a misspelt
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

const STYLESHEETS = ["base.css", "layout.css", "components.css", "tokens.css"];

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

/**
 * The declarations of one selector, as written in a stylesheet. At-rule
 * wrappers (`@media …`) do not match, their inner rules do, which is all this
 * needs.
 */
const declarationsOf = (css: string, selector: string): string[] => {
  const normalise = (text: string): string => text.trim().replace(/\s+/g, " ");
  const found: string[] = [];
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, " ").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] as string).split(",").map(normalise);
    if (!selectors.includes(selector)) {
      continue;
    }
    found.push(
      ...(match[2] as string)
        .split(";")
        .map(normalise)
        .filter((one) => one !== ""),
    );
  }
  return found;
};

/**
 * Declarations the shell cannot lose. Every one of them is here because Pico's
 * own `nav` rules either win on specificity or fill in where we say nothing,
 * and the damage is only visible in a browser: the bottom bar came out with
 * 37px slots and the labels cut to "sum" and "Movim", and the status bar was
 * 15px wider than the phone, which scrolled the whole page sideways.
 *
 * A test with no DOM cannot measure a layout. What it can do is refuse to let
 * the line that fixes it disappear again without anybody noticing.
 */
const SHELL_RULES = [
  {
    selector: ".nav ul",
    declaration: "flex: 1 1 auto",
    reason: "Pico hace del <nav> un flex row: sin crecer, los cinco huecos salen a 37px",
  },
  {
    selector: ".nav li",
    declaration: "min-width: 0",
    reason: "un hueco tiene que poder encogerse por debajo de su palabra más larga",
  },
  {
    selector: ".nav a",
    declaration: "margin: 0",
    reason: "Pico da margen negativo a `nav li a` y cada destino se solapaba con el vecino",
  },
  {
    selector: ".nav .label",
    declaration: "font-size: var(--t-nav)",
    reason: "«Movimientos» a 12px pide 76px de un hueco de 72",
  },
  {
    selector: ".statusbar .actions",
    declaration: "flex: 0 0 auto",
    reason: "los interruptores y el engranaje no encogen: lo que cede es el chip",
  },
  {
    selector: ".ledger-chip",
    declaration: "min-width: 0",
    reason: "sin esto el chip empuja la barra de estado fuera de la pantalla",
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
    // Both vendored stylesheets count as declarations: the `.u-*` classes are
    // uPlot's own, written by it at runtime and styled by it.
    const vendored = [
      join(webRoot, "vendor", "pico", "pico.css"),
      join(webRoot, "vendor", "uplot", "uPlot.css"),
    ].flatMap((path) => [...cssClassesOf(readFileSync(path, "utf8"))]);
    const declared = new Set([...ourClasses(), ...vendored]);
    const violations = [...markupClasses().literal].filter((name) => !declared.has(name)).sort();
    expect(violations).toEqual([]);
  });
  /**
   * The six declarations of `layout.css` that keep the shell inside a 360px
   * screen with its labels readable. See `SHELL_RULES` for why each one exists.
   */
  it("keeps the declarations that hold the shell together", () => {
    const layout = readFileSync(join(webSrc, "styles", "layout.css"), "utf8");
    const missing = SHELL_RULES.filter(
      (rule) => !declarationsOf(layout, rule.selector).includes(rule.declaration),
    ).map((rule) => `${rule.selector} { ${rule.declaration} } — ${rule.reason}`);
    expect(missing).toEqual([]);
  });

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

  /** And the step of the scale that the bar's label uses has to exist. */
  it("declares the type token of the bottom bar", () => {
    const tokens = readFileSync(join(webSrc, "styles", "tokens.css"), "utf8");
    expect(declarationsOf(tokens, ":root")).toContain("--t-nav: 0.625rem");
  });
});
