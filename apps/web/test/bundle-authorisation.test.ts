// A ceiling of `check-bundle.mjs` never passes what the direction authorised
// (feature 020, E1, block 1). The script refuses to build green with one over
// it; this reads the same constants, so the rule shows up in the suite too,
// before anyone waits for a build to find it.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const script = readFileSync(join(here, "../scripts/check-bundle.mjs"), "utf8");

/** The value of a numeric constant of the script: digits, `_`, `*` and `+` only. */
const constant = (name: string): number => {
  const match = new RegExp(`^const ${name} = ([\\d_ *+]+);$`, "m").exec(script);
  if (match === null) {
    throw new Error(`check-bundle.mjs no define ${name} como una cifra`);
  }
  return (match[1] as string)
    .replaceAll("_", "")
    .split("+")
    .map((term) => term.split("*").reduce((product, factor) => product * Number(factor), 1))
    .reduce((sum, term) => sum + term, 0);
};

describe("the ceilings of the bundle and what the direction authorised", () => {
  it("names the two authorisations of the direction, and nothing else moves them", () => {
    expect(constant("BOOT_AUTHORISED_GZIP_BYTES")).toBe(76_069);
    // 312.000 since 2026-09-28 (feature 016, questions §18, Q19).
    expect(constant("TOTAL_AUTHORISED_GZIP_BYTES")).toBe(312_000);
  });

  it("keeps each ceiling at or under its authorisation", () => {
    expect(constant("BOOT_BUDGET_GZIP_BYTES")).toBeLessThanOrEqual(
      constant("BOOT_AUTHORISED_GZIP_BYTES"),
    );
    expect(constant("TOTAL_BUDGET_GZIP_BYTES")).toBeLessThanOrEqual(
      constant("TOTAL_AUTHORISED_GZIP_BYTES"),
    );
  });

  it("makes the build itself fail on a ceiling over its authorisation", () => {
    expect(script).toMatch(
      /if \(BOOT_BUDGET_GZIP_BYTES > BOOT_AUTHORISED_GZIP_BYTES\) \{\s*problems\.push\(/,
    );
    expect(script).toMatch(
      /if \(TOTAL_BUDGET_GZIP_BYTES > TOTAL_AUTHORISED_GZIP_BYTES\) \{\s*problems\.push\(/,
    );
  });
});
