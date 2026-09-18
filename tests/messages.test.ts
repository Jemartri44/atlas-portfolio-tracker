// Anti-drift test of the Spanish messages (decision (i) of prompt 006).
//
// The domain speaks English by contract (`errors.ts`) and **each interface
// translates**: the CLI sends you to a command, the web to the screen where it
// is fixed. That means the same code is written twice, and the price of that is
// this test: every code the domain can raise has to be covered by **both**
// catalogues, and it fails if either of them leaves one untranslated.
//
// It works on the sources rather than by importing the modules, for the same
// reason the architecture test does: it has to see what a future author writes,
// not what today's exports happen to be.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const domainSrc = join(repoRoot, "packages", "domain", "src");
const cliMessages = join(repoRoot, "apps", "cli", "src", "output", "messages.ts");
const webErrors = join(repoRoot, "apps", "web", "src", "format", "messages", "errors.ts");
const webWarnings = join(repoRoot, "apps", "web", "src", "format", "messages", "warnings.ts");
const webFindings = join(repoRoot, "apps", "web", "src", "format", "messages", "findings.ts");
const integrityFiles = [
  join(domainSrc, "projections", "integrity.ts"),
  join(domainSrc, "projections", "deep-check.ts"),
];

const listTsFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return listTsFiles(path);
    }
    return path.endsWith(".ts") ? [path] : [];
  });

/**
 * Codes the domain can put in front of a person. Every way it names one, with
 * the helper that carries it: a constructor, the `invalid`/`fail` helpers, the
 * warning helpers and the `once` deduplicator of the bucket.
 */
const CODE_PATTERNS = [
  /new (?:ValidationError|ProjectionError|DomainError|CompactRejectedError)\(\s*"([a-z_0-9]+)"/gs,
  /\b(?:invalid|fail|finding|warn|note)\(\s*"([a-z_0-9]+)"/gs,
  /addWarning\(\s*[^,]+,\s*"([a-z_0-9]+)"/gs,
  /\bwarn\(\s*[^,]+,\s*"([a-z_0-9]+)"/gs,
  /\bonce\(\s*[^,]+,\s*"([a-z_0-9]+)"/gs,
  /\bsuper\(\s*"([a-z_0-9]+)"/gs,
  /\bcode:\s*"([a-z_0-9]+)"/gs,
];

const domainCodes = (): Set<string> => {
  const codes = new Set<string>();
  for (const file of listTsFiles(domainSrc)) {
    const source = readFileSync(file, "utf8");
    for (const pattern of CODE_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        codes.add(match[1] as string);
      }
    }
  }
  return codes;
};

/**
 * Codes the CLI translates: the labels of its two `switch` statements, plus the
 * one it translates in a function of its own.
 */
const CLI_ELSEWHERE = new Set(["duplicate_fingerprint"]); // describeDuplicate

const cliCodes = (): Set<string> => {
  const source = readFileSync(cliMessages, "utf8");
  return new Set([
    ...[...source.matchAll(/case "([a-z_0-9]+)":/g)].map((match) => match[1] as string),
    ...CLI_ELSEWHERE,
  ]);
};

/** Codes the web translates: the keys of its two catalogues. */
const webCodes = (): Set<string> => {
  const codes = new Set<string>();
  for (const file of [webErrors, webWarnings]) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/^ {2}([a-z_0-9]+):\s*\(/gm)) {
      codes.add(match[1] as string);
    }
  }
  return codes;
};

/**
 * Codes that do **not** reach a person through a message of their own, with the
 * reason. Anything not listed here has to be translated by both interfaces.
 */
const NOT_SHOWN: Record<string, string> = {
  // Internal guards of the value objects: they can only fire on a bug, and the
  // wrapper that catches them reports the field that was wrong.
  invalid_decimal_digits: "guarda interna de Decimal",
  division_by_zero: "solo salta ante un fallo interno; el mensaje del dominio ya lo dice",
  // Raised while validating a line and re-raised with `line N:` by the store;
  // the reader sees the wrapped one.
  unknown_event_type: "el cargador lo reetiqueta con la línea",
  invalid_json: "el cargador lo reetiqueta con la línea",
  // Only reachable through `compact`, which is a CLI-only command.
  invalid_events: "solo lo levanta compact (comando de CLI)",
  projection_changed: "solo lo levanta compact (comando de CLI)",
  archive_exists: "solo lo levanta compact (comando de CLI)",
  missing_migration: "solo ocurre con un libro de una versión sin migración escrita",
  ulid_overflow: "agotar los ids de un milisegundo: prácticamente imposible",
};

/**
 * The codes of an integrity finding, which are not errors and not warnings: they
 * come out of `integrity()` and `deepCheck()` with their own vocabulary. Only
 * the web has a catalogue for them — the CLI prints the English message of the
 * domain and that is a known gap, noted for a later feature.
 */
const findingCodes = (): Set<string> => {
  const codes = new Set<string>();
  for (const file of integrityFiles) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:error|warning|finding)\(\s*"([a-z_0-9]+)"/g)) {
      codes.add(match[1] as string);
    }
    for (const match of source.matchAll(/code:\s*"([a-z_0-9]+)"/g)) {
      codes.add(match[1] as string);
    }
  }
  return codes;
};

describe("Spanish messages: the integrity findings", () => {
  it("translates every finding the domain can raise", () => {
    const source = readFileSync(webFindings, "utf8");
    const translated = new Set(
      [...source.matchAll(/^ {2}([a-z_0-9]+): \{/gm)].map((match) => match[1] as string),
    );
    const codes = findingCodes();
    expect(codes.size).toBeGreaterThan(5);
    expect([...codes].filter((code) => !translated.has(code)).sort()).toEqual([]);
  });

  it("has no dead entry either", () => {
    const source = readFileSync(webFindings, "utf8");
    const translated = [...source.matchAll(/^ {2}([a-z_0-9]+): \{/gm)].map(
      (match) => match[1] as string,
    );
    const codes = findingCodes();
    expect(translated.filter((code) => !codes.has(code)).sort()).toEqual([]);
  });
});

describe("Spanish messages: the two interfaces stay level", () => {
  it("finds the codes of the domain", () => {
    // A sanity check on the scanner itself: if it stops finding codes, the test
    // below would pass vacuously.
    expect(domainCodes().size).toBeGreaterThan(80);
  });

  it("is translated by the CLI **and** by the web, code by code", () => {
    const cli = cliCodes();
    const web = webCodes();
    const missing: string[] = [];
    for (const code of [...domainCodes()].sort()) {
      if (NOT_SHOWN[code] !== undefined) {
        continue;
      }
      if (!cli.has(code)) {
        missing.push(`${code}: sin traducir en la CLI`);
      }
      if (!web.has(code)) {
        missing.push(`${code}: sin traducir en la web`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("has no dead entry in the web catalogue", () => {
    const domain = domainCodes();
    // Codes the web adds on its own (the store and the ledger file), with their
    // own text: they are not domain codes and that is fine.
    const own = new Set([
      "duplicate_fingerprint",
      "newly_invalid_events",
      "not_found",
      "invalid_line",
      "invalid_envelope",
      "invalid_field",
      "missing_field",
      "invalid_date",
      "invalid_decimal",
      "invalid_currency",
      "invalid_fx_rate",
      "invalid_instant",
      "invalid_json",
      "unknown_event_type",
      "invalid_events",
      "projection_changed",
      "archive_exists",
      "missing_migration",
      "ulid_overflow",
      "division_by_zero",
      "dangling_reference",
      "negative_position",
      "lots_mismatch",
      "duplicate_id",
      "conflict",
      "schema_too_new",
    ]);
    const dead = [...webCodes()].filter((code) => !domain.has(code) && !own.has(code));
    expect(dead).toEqual([]);
  });

  it("keeps every catalogue inside its own interface", () => {
    // The web does not import the CLI (`apps/*` never import each other:
    // ADR-0007), which is the other half of decision (i).
    expect(readFileSync(webErrors, "utf8")).not.toContain("@atlas/cli");
    expect(readFileSync(webWarnings, "utf8")).not.toContain("@atlas/cli");
    expect(relative(repoRoot, webErrors)).toBe(
      join("apps", "web", "src", "format", "messages", "errors.ts"),
    );
  });
});
