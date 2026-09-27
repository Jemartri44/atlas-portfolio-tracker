// The colour of a result, recognised by identity (feature 020, E1; round 2 of
// the review of PR #105). `apps/web/test/result-colour.test.ts` reads the
// markup as text: a `class="positive"` written by hand, or `signOf(` by name.
// Two detours walked past it, `import { signOf as toneOf }` and `const tone =
// "positive"` used in a class. Here the web is **parsed** with the parser
// every static guardian shares (`support/source-graph.ts`), so the import is
// recognised by what it imports and the word by being a string of the code.

import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { listSources, nodesOf, parse, webSrc } from "./support/source-graph.js";

const sources = (): (readonly [string, string])[] =>
  listSources(webSrc).map((path) => [relative(webSrc, path), path] as const);

describe("architecture: the colour of a result, by identity", () => {
  it("imports the sign of a value, under any name, only where a figure is painted by it", () => {
    // `format/number.ts` defines it and `format/index.ts` re-exports it.
    const allowed = new Set(["components/Figure.tsx", "format/index.ts", "format/number.ts"]);
    const using = sources()
      .filter(([name]) => !allowed.has(name))
      .filter(([, path]) =>
        [...nodesOf(parse(path).program())].some(
          (node) =>
            (node.type === "ImportSpecifier" &&
              (node.imported as { name?: string }).name === "signOf") ||
            (node.type === "Identifier" && node.name === "signOf"),
        ),
      )
      .map(([name]) => name);
    expect(using).toEqual([]);
  });

  it("writes the words of a sign class only where the sign is decided", () => {
    // `Amount` decides the sign of an amount, `signOf` the sign of a figure:
    // anywhere else the word can only reach a class by the back door.
    const allowed = new Set(["components/Amount.tsx", "format/number.ts"]);
    const written = sources()
      .filter(([name]) => !allowed.has(name))
      .flatMap(([name, path]) =>
        [...nodesOf(parse(path).program())]
          .map((node) =>
            node.type === "Literal" && typeof node.value === "string"
              ? node.value
              : node.type === "TemplateElement"
                ? ((node.value as { cooked?: string }).cooked ?? "")
                : undefined,
          )
          .filter(
            (text): text is string =>
              text !== undefined && /(^|\s)(positive|negative)(\s|$)/.test(text),
          )
          .map((text) => `${name}: ${text}`),
      );
    expect(written).toEqual([]);
  });
});
