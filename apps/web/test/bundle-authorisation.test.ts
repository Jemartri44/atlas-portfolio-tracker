// A ceiling of `check-bundle.mjs` never passes what the direction authorised. The script refuses to
// build green with one over it; this reads the same constants, so the rule shows up in the suite
// too, before anyone waits for a build to find it.

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

/** The ceilings of the lazy areas, by name, read from the `LAZY_AREAS` table of the script. */
const areaBudgets = (): Map<string, number> => {
  const table = /const LAZY_AREAS = \[([\s\S]*?)\n\];/.exec(script)?.[1] ?? "";
  const found = new Map<string, number>();
  for (const match of table.matchAll(/name: "(\w+)"[\s\S]*?budget: ([\d_]+)/g)) {
    found.set(match[1] as string, Number((match[2] as string).replaceAll("_", "")));
  }
  return found;
};

describe("the ceilings of the bundle and what the direction authorised", () => {
  it("names the two authorisations of the direction, and nothing else moves them", () => {
    expect(constant("BOOT_AUTHORISED_GZIP_BYTES")).toBe(76_069);
    // 500.000 since 2026-10-04 (decisión de la persona, 04/10); before, 312.000.
    expect(constant("TOTAL_AUTHORISED_GZIP_BYTES")).toBe(500_000);
  });

  it("keeps the boot ceiling under its authorisation, and the sum of all the ceilings under the total one", () => {
    expect(constant("BOOT_BUDGET_GZIP_BYTES")).toBeLessThanOrEqual(
      constant("BOOT_AUTHORISED_GZIP_BYTES"),
    );
    const areas = areaBudgets();
    expect([...areas.keys()]).toEqual(["fiscal", "formularios", "resto"]);
    const sum = [...areas.values()].reduce((total, budget) => total + budget, 0);
    expect(constant("BOOT_BUDGET_GZIP_BYTES") + sum).toBeLessThanOrEqual(
      constant("TOTAL_AUTHORISED_GZIP_BYTES"),
    );
  });

  it("makes the build itself fail on a ceiling over its authorisation", () => {
    expect(script).toMatch(
      /if \(BOOT_BUDGET_GZIP_BYTES > BOOT_AUTHORISED_GZIP_BYTES\) \{\s*problems\.push\(/,
    );
    expect(script).toMatch(/if \(ceilings > TOTAL_AUTHORISED_GZIP_BYTES\) \{\s*problems\.push\(/);
  });
});
