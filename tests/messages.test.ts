// Exhaustiveness of the one catalogue of messages (`@atlas/domain/messages`).
//
// The domain speaks English by contract and the catalogue says each code in Spanish for both
// surfaces. A new code needs ONE entry, and this test fails until it has one: every code that the
// domain, the adapters, the API or the console can raise has to be in the catalogue, or be listed
// here with the reason it never reaches a person through a message of its own.
//
// It works on the sources, for the same reason the architecture test does: it has to see what a
// future author writes, not what today's exports happen to be.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ERRORS, FINDINGS, REMOTE_FAILURES, WARNINGS } from "@atlas/domain/messages";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const domainSrc = join(repoRoot, "packages", "domain", "src");
// Where a code can be born: the domain, the adapters that translate the outside world into
// errors, the API and the console.
const SOURCES = [
  domainSrc,
  join(repoRoot, "packages", "adapters", "src"),
  join(repoRoot, "apps", "api", "src"),
  join(repoRoot, "apps", "cli", "src"),
];
const integrityFiles = [
  join(domainSrc, "projections", "integrity.ts"),
  join(domainSrc, "projections", "deep-check.ts"),
  join(domainSrc, "ecb", "check.ts"),
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
 * Codes that can be put in front of a person. Every way the sources name one, with the helper that
 * carries it: a constructor, the `invalid`/`fail` helpers, the warning helpers and the `once`
 * deduplicator of the bucket.
 */
const CODE_PATTERNS = [
  /new (?:ValidationError|ProjectionError|DomainError|CompactRejectedError)\(\s*"([a-z_0-9]+)"/gs,
  /\b(?:invalid|fail|finding|warn|note|eventNote)\(\s*"([a-z_0-9]+)"/gs,
  /addWarning\(\s*[^,]+,\s*"([a-z_0-9]+)"/gs,
  /\bwarn\(\s*[^,]+,\s*"([a-z_0-9]+)"/gs,
  /\bonce\(\s*[^,]+,\s*"([a-z_0-9]+)"/gs,
  /\bsuper\(\s*"([a-z_0-9]+)"/gs,
  /\bcode:\s*"([a-z_0-9]+)"/gs,
];

// Outside the domain only a constructor names a code: `code:` and the helpers there are log lines,
// outcomes and fields of other things.
const CONSTRUCTORS = CODE_PATTERNS.slice(0, 1);

const raisedCodes = (): Set<string> => {
  const codes = new Set<string>();
  for (const root of SOURCES) {
    for (const file of listTsFiles(root)) {
      const source = readFileSync(file, "utf8");
      for (const pattern of root === domainSrc ? CODE_PATTERNS : CONSTRUCTORS) {
        for (const match of source.matchAll(pattern)) {
          codes.add(match[1] as string);
        }
      }
    }
  }
  return codes;
};

/**
 * Codes that do **not** reach a person through a message of their own, with the
 * reason. Anything not listed here has to be translated by both interfaces.
 */
const NOT_SHOWN: Record<string, string> = {
  invalid_archive_name: "guarda interna de los adaptadores: el nombre lo construye el programa",
  operation_not_supported: "guarda interna: la administración no pasa por el almacén de la API",
  // Internal guards of the value objects: they can only fire on a bug, and the
  // wrapper that catches them reports the field that was wrong.
  // Raised while validating a line and re-raised with `line N:` by the store;
  // the reader sees the wrapped one.
  // Raised only inside the Lambda of the API, which answers with a code of docs/api.md §7
  // (remote_unavailable, device_forgotten) or refuses to start; neither interface ever holds one of
  // these errors.
  allow_list_unreadable: "solo en la Lambda: responde remote_unavailable",
  api_config_invalid: "solo en la Lambda: no arranca",
  device_id_invalid: "solo en la Lambda: nunca construye la clave de un id que no vale",
  // Guards of the names and the tokens the API and the console build from values they validated
  // first; they can only fire on a bug.
  token_id_invalid: "solo en la Lambda: nunca construye el nombre de un token_id que no vale",
  device_token_malformed: "nunca se da formato a un token con partes que no valen",
};

/**
 * Codes only the **scheduled jobs** raise: they end in the run record of a job, its log line or its
 * mail, never in front of the console or the web. The mail says each warning with its own sentence
 * (`jobs/mail/`); the rest are codes of a record. `job_frequency_*` and `job_not_available` will be
 * said in Ajustes once it shows what a line of `job_frequencies` carries that the jobs ignore, and
 * leave this list then.
 */
const JOBS_ONLY: Record<string, string> = {
  job_already_done: "solo en el registro de una tarea",
  job_event_invalid: "solo en el registro de la función: el evento de la programación",
  job_frequencies_invalid: "solo en el registro de una tarea hasta E3",
  job_in_progress: "solo en el registro de una tarea: otra ejecución puede seguir en marcha",
  job_frequency_invalid_value: "solo en el registro de una tarea hasta E3",
  job_frequency_unknown_key: "solo en el registro de una tarea hasta E3",
  job_not_available: "solo en el registro de una tarea hasta E3",
  job_record_newer_format: "solo en el registro de una tarea",
  job_record_unreadable: "solo en el registro de una tarea",
  job_send_unknown: "solo en el registro de una tarea",
  job_expired: "solo en el registro de una tarea: un aviso de un periodo pasado, nunca enviado",
  jobs_config_invalid: "solo en las tareas: la función no arranca",
  notice_unreadable: "solo en el registro de la función de correo",
  task_failed: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  // The findings of the ECB and the prices, said by the mail only.
  currency_unchecked: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  ecb_calendar_mismatch: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  ecb_history_damaged: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  ecb_history_rebuilt: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  ecb_rebuilt_unverified: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  ecb_update_rejected: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  ecb_update_undone: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  source_failing: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  thesis_horizon_exceeded: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  prices_file_unreadable: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  // The findings of the dump and the integrity, said by the mail only.
  backup_object_differs: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  backup_ecb_inconsistent: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  backup_positions_missing: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  backup_ecb_missing: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  integrity_errors: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  restore_rehearsal_differs: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  ledger_size_above_threshold: "el correo lo dice con su frase (jobs/mail/notice.ts)",
  core_weights_partial:
    "el correo de la revisión semanal lo dice con su frase (jobs/mail/periodic.ts)",
};

/**
 * Codes of the catalogue that no source names with one of the patterns above, with the reason: they
 * are raised by a path the scanner cannot see.
 */
const OWN = new Set<string>([
  // The third code of DependentEventsError and the codes the store and the loader put on a line.
  "accept_invalid_while_synced",
  "newly_invalid_events",
  "invalid_currency",
  "duplicate_fingerprint",
]);

/** Codes the catalogue says, of any kind. */
const said = (): Set<string> =>
  new Set([...Object.keys(ERRORS), ...Object.keys(WARNINGS), ...Object.keys(REMOTE_FAILURES)]);

/** Codes of an integrity finding: they come out of `integrity()` and `deepCheck()`. */
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

describe("the catalogue of messages is exhaustive", () => {
  it("finds the codes, so the checks below cannot pass by looking at nothing", () => {
    expect(raisedCodes().size).toBeGreaterThan(150);
    expect(said().size).toBeGreaterThan(200);
  });

  it("has an entry for every code that can be raised", () => {
    const entries = said();
    const missing = [...raisedCodes()]
      .filter((code) => !entries.has(code))
      .filter((code) => NOT_SHOWN[code] === undefined && !Object.hasOwn(JOBS_ONLY, code))
      .sort();
    expect(missing.join(" ")).toBe("");
  });

  it("keeps no code in the lists of exceptions that has an entry or is no longer raised", () => {
    const raised = raisedCodes();
    const entries = said();
    expect(
      Object.keys(NOT_SHOWN)
        .filter((code) => !raised.has(code))
        .join(" "),
    ).toBe("");
    expect(
      Object.keys(JOBS_ONLY)
        .filter((code) => !raised.has(code))
        .join(" "),
    ).toBe("");
    expect(
      [...Object.keys(NOT_SHOWN), ...Object.keys(JOBS_ONLY)]
        .filter((code) => entries.has(code))
        .join(" "),
    ).toBe("");
  });

  it("has no dead entry: every code of the catalogue is raised somewhere", () => {
    const raised = raisedCodes();
    const dead = [...Object.keys(ERRORS), ...Object.keys(WARNINGS)].filter(
      (code) => !raised.has(code) && !OWN.has(code),
    );
    expect(dead.join(" ")).toBe("");
  });

  it("says every integrity finding the domain can raise, and nothing else", () => {
    const codes = findingCodes();
    expect(codes.size).toBeGreaterThan(5);
    const entries = Object.keys(FINDINGS);
    expect([...codes].filter((code) => !entries.includes(code)).sort()).toEqual([]);
    expect(entries.filter((code) => !codes.has(code)).sort()).toEqual([]);
  });

  it("says every failure of the remote, and nothing else", () => {
    const source = readFileSync(join(domainSrc, "ports", "remote-ledger.ts"), "utf8");
    const block = /REMOTE_FAILURE_CODES = \[([^\]]*)\]/.exec(source)?.[1] ?? "";
    const listed = [...block.matchAll(/"([a-z_0-9]+)"/g)].map((match) => match[1] as string).sort();
    expect(listed.length).toBeGreaterThanOrEqual(18);
    expect(Object.keys(REMOTE_FAILURES).sort()).toEqual(listed);
  });
});
