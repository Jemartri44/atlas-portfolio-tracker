// Every figure of the schema is masked on the detail of a movement. The detail
// screen decides by the **name** of a field (`view-models/detail.ts`): a
// decimal field the schema gains and that list forgets is shown as plain text,
// in full, with the privacy mode on. That happened to `gross_eur` and
// `withholding_eur`; this keeps it from happening again.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES } from "@atlas/domain";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const detail = readFileSync(
  join(repoRoot, "apps", "web", "src", "view-models", "detail.ts"),
  "utf8",
);

/** The names inside `const <set> = new Set([...])` of the detail. */
const setOf = (name: string): Set<string> => {
  const body = new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]`).exec(detail)?.[1] ?? "";
  return new Set([...body.matchAll(/"([a-z_0-9]+)"/g)].map((match) => match[1] as string));
};

const DECIMAL_KINDS = new Set([
  "decimal",
  "signed_decimal",
  "positive_decimal",
  "negative_decimal",
  "non_positive_decimal",
]);

/** Decimals that are not an amount, a quantity or a rate, with the reason. */
const NOT_A_FIGURE: Record<string, string> = {
  ter: "un porcentaje público del folleto",
};

describe("the detail of a movement", () => {
  it("masks every decimal field of the schema as an amount, a quantity or a rate", () => {
    const figures = new Set([
      ...setOf("AMOUNT_FIELDS"),
      ...setOf("QUANTITY_FIELDS"),
      ...setOf("RATE_FIELDS"),
    ]);
    expect(figures.size).toBeGreaterThan(15);
    const bare = new Set<string>();
    for (const [type, rules] of Object.entries(RULES)) {
      for (const [field, rule] of Object.entries(rules)) {
        if (
          DECIMAL_KINDS.has(rule.kind) &&
          !figures.has(field) &&
          NOT_A_FIGURE[field] === undefined
        ) {
          bare.add(`${type}.${field}`);
        }
      }
    }
    expect([...bare].sort()).toEqual([]);
  });
});
