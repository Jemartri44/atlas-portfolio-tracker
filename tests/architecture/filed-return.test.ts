import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { listSourceFiles, reachableFrom, repoRoot, specifiersOf } from "./support.js";

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
