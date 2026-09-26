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
  // Feature 012: the findings of the ECB check, which both interfaces say.
  join(domainSrc, "ecb", "check.ts"),
];
const ecbCheck = join(domainSrc, "ecb", "check.ts");
const cliEcb = join(repoRoot, "apps", "cli", "src", "output", "ecb.ts");

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
  // Feature 015: raised only inside the Lambda of the API, which answers with
  // a code of docs/api.md §7 (remote_unavailable, device_forgotten) or refuses
  // to start; neither interface ever holds one of these errors.
  allow_list_unreadable: "solo en la Lambda: responde remote_unavailable",
  api_config_invalid: "solo en la Lambda: no arranca",
  device_id_invalid: "solo en la Lambda: nunca construye la clave de un id que no vale",
  // E2: guards of the names and the tokens the API and the console build
  // from values they validated first; they can only fire on a bug.
  token_id_invalid: "solo en la Lambda: nunca construye el nombre de un token_id que no vale",
  device_token_malformed: "nunca se da formato a un token con partes que no valen",
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

/**
 * **The findings of the ECB are said in Spanish in the console too**
 * (decision (z) of prompt 012). The console has no catalogue of findings — it
 * printed the domain's English, a gap noted for a later feature —, so it gets
 * one **limited to the codes of the ECB**, and this test holds it both ways:
 * every code the ECB check can raise is translated there, and nothing else.
 * With it, the blind spot of the `error(`/`warning(` helpers (E2 of feature
 * 011) no longer applies to these codes: `findingCodes` scans the module.
 */
describe("Spanish messages: the findings of the ECB in the console", () => {
  const ecbCodes = (): Set<string> => {
    const codes = new Set<string>();
    const source = readFileSync(ecbCheck, "utf8");
    for (const match of source.matchAll(/(?:warning|error)\(\s*"([a-z_0-9]+)"/g)) {
      codes.add(match[1] as string);
    }
    for (const match of source.matchAll(/code:\s*"([a-z_0-9]+)"/g)) {
      codes.add(match[1] as string);
    }
    return codes;
  };
  const cliEcbCodes = (): Set<string> =>
    new Set(
      [...readFileSync(cliEcb, "utf8").matchAll(/case "([a-z_0-9]+)":/g)].map(
        (match) => match[1] as string,
      ),
    );

  it("finds the codes, so the check below cannot pass by looking at nothing", () => {
    expect(ecbCodes().size).toBeGreaterThanOrEqual(7);
  });

  it("translates every one of them, and nothing that is not one", () => {
    const codes = ecbCodes();
    const cli = cliEcbCodes();
    expect([...codes].filter((code) => !cli.has(code)).sort()).toEqual([]);
    expect([...cli].filter((code) => !codes.has(code)).sort()).toEqual([]);
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
      // Feature 014 (V7): the third code of DependentEventsError, said by both
      // interfaces with its own sentence (apps/cli/test/sync/refusals.test.ts
      // and apps/web/test/actions.test.ts read it).
      "accept_invalid_while_synced",
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

/**
 * **The failures of the remote** (feature 014; `docs/api.md` §7): the client
 * stops with `remote_failed` and carries the code of the remote as it came, so
 * each interface says each one with its own sentence, never folded into a
 * generic one. Held level with the closed list of the domain, both ways.
 */
describe("Spanish messages: the failures of the remote, one by one", () => {
  const listed = (): string[] => {
    const source = readFileSync(join(domainSrc, "ports", "remote-ledger.ts"), "utf8");
    const block = /REMOTE_FAILURE_CODES = \[([^\]]*)\]/.exec(source)?.[1] ?? "";
    return [...block.matchAll(/"([a-z_0-9]+)"/g)].map((match) => match[1] as string).sort();
  };
  const cliFailures = (): string[] => {
    const source = readFileSync(cliMessages, "utf8");
    const start = source.indexOf("export const describeRemoteFailure");
    const body = source.slice(start, source.indexOf("export const describeError", start));
    return [...body.matchAll(/case "([a-z_0-9]+)":/g)].map((match) => match[1] as string).sort();
  };
  const webFailures = (): string[] => {
    const source = readFileSync(webErrors, "utf8");
    const start = source.indexOf("export const REMOTE_FAILURES");
    const body = source.slice(start, source.indexOf("};", start));
    return [...body.matchAll(/^ {2}([a-z_0-9]+):/gm)].map((match) => match[1] as string).sort();
  };

  it("finds the list, so the check cannot pass by looking at nothing", () => {
    expect(listed().length).toBeGreaterThanOrEqual(18);
  });

  it("translates every one of them in both interfaces, and nothing else", () => {
    expect(cliFailures()).toEqual(listed());
    expect(webFailures()).toEqual(listed());
  });
});
