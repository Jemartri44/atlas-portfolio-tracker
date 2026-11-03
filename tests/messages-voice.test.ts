// The catalogue of messages never formats a figure or a name by itself: the voice of each surface is
// the only door, which is what keeps the privacy mask of the web on every sentence.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "domain",
  "src",
  "messages",
);

const FORBIDDEN: readonly [RegExp, string][] = [
  [/\.toFixed\(/, "toFixed"],
  [/\bIntl\./, "Intl"],
  [/toLocale\w*\(/, "toLocale*"],
  [/parseFloat|parseInt/, "parseFloat/parseInt"],
  [/Math\.(?:round|ceil|trunc)\(/, "Math rounding"],
  [/\.round\(|\.roundToCents\(|\.toNumber\(/, "decimal rounding"],
  [/formatDecimal|formatQuantity|formatDate|formatMoney/, "a formatter of a surface"],
  [/\bMASK\b|••••/, "the privacy mask"],
  [/[0-9]+[.,][0-9]+\s?€|€\s?[0-9]/, "a hard-coded amount"],
];

describe("messages: only the voice formats", () => {
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts") && name !== "voice.ts");

  it("finds the files, so the check cannot pass by looking at nothing", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files)("%s has no formatting of its own", (name) => {
    const source = readFileSync(join(dir, name), "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
      .join("\n");
    for (const [pattern, what] of FORBIDDEN) {
      expect(pattern.test(source), `${name} uses ${what}`).toBe(false);
    }
  });
});
