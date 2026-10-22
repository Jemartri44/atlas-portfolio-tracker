import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { listSourceFiles, repoRoot } from "./support.js";

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
