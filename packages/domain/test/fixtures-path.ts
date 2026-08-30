// Resolves shared fixtures under tests/fixtures/ledger/ for the domain tests.
// Only tests use node: the domain sources stay isomorphic (see tests/architecture.test.ts).

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/ledger",
);

export const fixturePath = (name: string): string => join(fixturesDir, name);

/** Whole fixture as text, exactly as stored (trailing newline included). */
export const fixtureText = (name: string): string => readFileSync(fixturePath(name), "utf8");

/** Fixture split into raw lines, without the trailing newline of the file. */
export const fixtureLines = (name: string): string[] => {
  const lines = fixtureText(name).split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
};
