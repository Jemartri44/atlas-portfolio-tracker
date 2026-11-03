import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { listSourceFiles, repoRoot, specifiersOf, webSrc } from "./support.js";

// ---------------------------------------------------------------------------
// The web. Three rules that cannot be left to memory: the privacy gate, the isolation of the bundle
// and the ban on `use:` directives.
// ---------------------------------------------------------------------------

/**
 * Every stylesheet of `src/styles` except the one that only imports the rest:
 * read from the folder, so a new layer of the design system cannot be left
 * out of the check by forgetting to add it to a list.
 */
const STYLESHEETS = readdirSync(join(webSrc, "styles")).filter(
  (name) => name.endsWith(".css") && name !== "index.css",
);

describe("architecture: apps/web", () => {
  /**
   * **Every** amount and **every** quantity is painted by one component, so the privacy mode cannot
   * be bypassed by a screen written in two years by someone who never read the prompt.
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
     * - `Amount.tsx` is the gate of the interface: every figure a screen paints goes through it.
     * - `chart/axis.ts` exists because uPlot asks for functions that take numbers and return the
     *   labels of an axis and of a tooltip, where there is no component to go through. Authorised
     *   on the condition that a rendered test proves the mask applies there too: **the axis of a
     *   chart is an amount for every purpose**.
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
   * `Amount` covers every figure a screen paints, and none of the warnings and errors the domain
   * writes as prose goes through it — they are strings. So the mask on, the table said `••••` and
   * the warning right under it said "el aporte bruto al cubo (5000 EUR) supera el tope de 6000
   * EUR". The fix is that a template asks `format/privacy.ts` for its figures instead of writing
   * them, and this is what keeps the next template from forgetting: it reads the catalogues and
   * refuses a detail that is an amount or a quantity by name and goes in with `text()`.
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
    // What is held of an asset: a quantity, masked like any other.
    "sale_exceeds_holding.held",
    // The configured figures of the informative returns: amounts in euros the
    // user set, said back to him when one contradicts the other.
    "alert_above_threshold.alert",
    "alert_above_threshold.threshold",
  ]);

  /** Each entry of a catalogue with its body, from its key to the next one. */
  const templatesOf = (source: string): Map<string, string> => {
    const keys = [...source.matchAll(/^ {2}([a-z_0-9]+):\s*[({]/gm)];
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
    // The one catalogue of messages: both surfaces say these sentences, and the figures go through
    // the voice, which is where the web applies its mask.
    const dir = join(repoRoot, "packages", "domain", "src", "messages");
    const catalogues = readdirSync(dir)
      .filter((name) => /^(errors|warnings)-.*\.ts$/.test(name) || name === "remote-failures.ts")
      .map((name) => join(dir, name));
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
            // `v.titles` is `v.quantity` with its word, «título» or «títulos».
            const wrapped = call === "v.money" || call === "v.quantity" || call === "v.titles";
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
   * Importing the browser store must not drag `node:fs` into the bundle. The barrel of
   * `@atlas/adapters` exports `FileLedgerStore`, so the web imports subpaths only.
   * `scripts/check-bundle.mjs` verifies the same thing on the built output; this one says it in the
   * source, where the fix is.
   */
  /**
   * **The browser never writes in a folder of the disk.** The File System Access API cannot create
   * a file exclusively, so the web cannot take the lock of the console's folder; without the lock,
   * a write of the web there could overwrite a line of the console in silence. So the web keeps its
   * ledger in its own storage and only **reads** from the folder, and every writing primitive of
   * the API is forbidden here, in the web and in the browser adapters. IndexedDB's own
   * `"readwrite"` transactions are not this: they are positional, never a `mode:` option.
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
  /*
   * The shell used to be guarded here by declarations that had to exist in
   * `layout.css`, each one there to beat a default of Pico. Pico is gone
   * (ADR-0023), and what those rules protected — a navigation that fits, a
   * screen whose content is shown at every width — is now checked on what the
   * browser **applies**, in `apps/web/test/shell.test.tsx`.
   */

  /**
   * A `catch` that does nothing is a defect. It is how a failure becomes a screen that does not
   * react — the user presses, nothing happens, and nothing anywhere says why.
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
   * No file of `apps/web/src` above ~250 lines without a written reason. The user asked for this in
   * so many words — that the frontend must not turn into a large amount of code that is hard to
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
   * The ceiling itself applies to code, not to the cascade — but the exemption holds **on condition
   * that each stylesheet over the ceiling carries its reason**, and a condition nobody checks is a
   * wish too.
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
   * Nothing that is read goes below 13px: the bottom bar used to carry its labels at 10px, and a
   * test demanded that token. Now the scale itself is checked — every `--text-*` step, at every
   * width — and every `font-size` of our stylesheets has to come from it, or be relative to a
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
