// The colour of a result, recognised by identity. `apps/web/test/result-colour.test.ts` reads the
// markup as text: a `class="positive"` written by hand, or `signOf(` by name. Two detours walked
// past it, `import { signOf as toneOf }` and `const tone = "positive"` used in a class. Here the
// web is **parsed** with the parser every static guardian shares (`support/source-graph.ts`), so
// the import is recognised by what it imports and the word by being a string of the code.

import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { listSources, nodesOf, parse, webSrc } from "./support/source-graph.js";

// Parsing and walking every file of the web twice took ~6 s. A file that does not contain the word
// as text cannot contain it as an identifier or a string, so only those are parsed.
const sources = (word: RegExp): (readonly [string, string])[] =>
  listSources(webSrc)
    .filter((path) => readFileSync(path, "utf8").match(word) !== null)
    .map((path) => [relative(webSrc, path), path] as const);

describe("architecture: the colour of a result, by identity", () => {
  it("imports the sign of a value, under any name, only where a figure is painted by it", () => {
    // `format/number.ts` defines it and `format/index.ts` re-exports it.
    const allowed = new Set(["components/Figure.tsx", "format/index.ts", "format/number.ts"]);
    const using = sources(/signOf/)
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
    const written = sources(/positive|negative/)
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
