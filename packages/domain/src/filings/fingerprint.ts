// The fingerprint of the ledger a filing was computed on (ADR-0020, prompt 010
// block 1).
//
// The prompt fixes three requirements and not the algorithm:
//
//   1. It covers every event that precedes the filing in the file.
//   2. It does **not** change with `compact` nor with a migration.
//   3. It allows the calculation of that day to be reproduced.
//
// A digest of the raw bytes fails the second one on the first compaction, and
// a digest of the events as the code reads them today fails it on the first
// real migration: no representation of an event is independent of its version,
// because migrating is precisely changing it.
//
// What can be guaranteed is narrower and enough: **no line before a filing can
// carry a version newer than the filing's**, because the loader refuses a
// version it does not know, so an old client never writes after a new one. So
// the digest is taken over the lines **migrated up to the version of the
// fingerprint and no further**, written canonically with their keys sorted. A
// new migration in the code does not break it: the raw lines stay in their own
// version and the chain knows how to stop.
//
// `compact` is the only thing that raises the lines above that version. It
// verifies every fingerprint before rewriting, refuses if any fails, and seals
// them again over the rewritten prefix: the guarantee is not lost, because it
// was checked immediately before the shape changed.

import { sha256Hex } from "../ids/sha256.js";
import { sortKeysDeep } from "../projections/snapshot.js";
import type { LedgerEvent, LedgerFingerprint, TaxReturnFiledEvent } from "../schema/events.js";
import { parseLine } from "../schema/line.js";
import { CURRENT_LEDGER_SCHEMA, type LedgerSchema, migrate } from "../schema/migrations/index.js";

/** One line as the digest sees it: keys sorted at every level, no spaces. */
const canonical = (record: unknown): string => JSON.stringify(sortKeysDeep(record));

const digest = (texts: readonly string[]): string => sha256Hex(texts.join("\n"));

/**
 * The fingerprint of the events that precede a filing, computed when it is
 * written. The events come from the loader, so they are already at the version
 * of the schema in force, which is the version recorded in the fingerprint.
 */
export const fingerprintOfEvents = (
  events: readonly LedgerEvent[],
  version: number = CURRENT_LEDGER_SCHEMA.version,
): LedgerFingerprint => ({
  schema_version: version,
  lines: events.length,
  sha256: digest(events.map(canonical)),
});

/**
 * The same digest from the raw lines, migrated **up to** `version` and no
 * further. It is what the verification compares with what the filing recorded.
 */
export const fingerprintOfLines = (
  lines: readonly string[],
  version: number,
  schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
): string =>
  digest(lines.map((line) => canonical(migrate(parseLine(line), { ...schema, version }))));

export interface FingerprintCheck {
  filing_id: string;
  /** Why it does not hold, or `undefined` when it does. */
  reason?: "lines" | "digest" | "unreadable";
  /** How many lines the fingerprint says it covers, and where the filing really sits. */
  declared_lines: number;
  position: number;
  /**
   * The schema version the fingerprint declares, which is the version the
   * lines before the filing have to be readable at. It is carried on **every**
   * check and not only on the one that fails: it is a fact about the
   * fingerprint, not a detail of its failure — and it is what the one message
   * of the project that says *from which version* the ledger has to be
   * migrated needs to print. That message used to print `declared_lines`,
   * which is a count of lines and not a version (feature 011, block 0).
   */
  declared_schema_version: number;
}

/**
 * Checks the fingerprint of every filing against the file it sits in.
 *
 * Two things can be wrong, and they are told apart because one is cheap and
 * the other is not. The **count** is a structural check: a fingerprint that
 * says it covers ten lines on a filing that is the twelfth covers the wrong
 * prefix, whatever its digest says, and that is caught by looking at one
 * number. The **digest** needs re-reading and re-migrating every line before
 * it, which is why it lives in the deep check.
 */
export const checkFilingFingerprints = (
  lines: readonly string[],
  events: readonly LedgerEvent[],
  schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
): FingerprintCheck[] => {
  const checks: FingerprintCheck[] = [];
  events.forEach((event, position) => {
    if (event.type !== "tax_return_filed") {
      return;
    }
    const filing = event as TaxReturnFiledEvent;
    const declared = filing.ledger_fingerprint;
    const check: FingerprintCheck = {
      filing_id: filing.id,
      declared_lines: declared.lines,
      position,
      declared_schema_version: declared.schema_version,
    };
    if (declared.lines !== position) {
      checks.push({ ...check, reason: "lines" });
      return;
    }
    let recomputed: string;
    try {
      recomputed = fingerprintOfLines(
        lines.slice(0, declared.lines),
        declared.schema_version,
        schema,
      );
    } catch {
      // A line before it cannot be read at the version the fingerprint claims:
      // the fingerprint cannot be verified, which is not the same as wrong.
      checks.push({ ...check, reason: "unreadable" });
      return;
    }
    checks.push(recomputed === declared.sha256 ? check : { ...check, reason: "digest" });
  });
  return checks;
};

/**
 * Seals every filing again over the rewritten prefix, at the new version. Used
 * by `compact`, which verifies first and only then changes the shape of the
 * lines.
 */
export const resealFilings = (events: readonly LedgerEvent[], version: number): LedgerEvent[] => {
  // Sealed in order, over the prefix **already rewritten**: a filing earlier in
  // the file changes the prefix of every filing after it.
  const sealed: LedgerEvent[] = [];
  for (const event of events) {
    sealed.push(
      event.type === "tax_return_filed"
        ? {
            ...(event as TaxReturnFiledEvent),
            ledger_fingerprint: fingerprintOfEvents(sealed, version),
          }
        : event,
    );
  }
  return sealed;
};
