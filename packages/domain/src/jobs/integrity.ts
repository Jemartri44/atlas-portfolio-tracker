// What the quarterly integrity leaves for the mail (feature 016, E4; plan
// §9; Q7). «Recompute everything from scratch and compare» is the deep check
// of `atlas check --deep` on the live ledger — its **errors** are a finding —
// and the rehearsal of a restore with the last dump (`rehearsal.ts`). And the
// size of the ledger (ADR-0028, «Revisión del plazo de las versiones»): above
// its threshold the lifetime of the non-current versions of ADR-0006 has to
// be looked at again.
//
// **Each by code and by count, from closed lists** (review of PR #104,
// privacy B1): a code the lists do not know is counted as `other`, never
// written as it came. The size and its threshold are bytes, not amounts.

import type { Rehearsal } from "./rehearsal.js";
import type { Finding } from "./run-record.js";

/** The error codes of `integrity` and `deepCheck`; the test reads them back from the sources. */
export const INTEGRITY_ERROR_CODES = [
  "dangling_reference",
  "duplicate_id",
  "duplicate_isin",
  "filing_fingerprint_lines",
  "filing_fingerprint_mismatch",
  "filing_fingerprint_unreadable",
  "fingerprint_mismatch",
  "lots_mismatch",
  "negative_position",
  "projection_not_reproducible",
] as const;

/** What the rehearsal can say, and why it could not be done. */
export const REHEARSAL_CODES = [
  "event_missing_in_live",
  "event_differs",
  "order_differs",
  "dump_invalid",
  "positions_differ",
  "cash_differ",
  "lots_differ",
  "gains_differ",
  "income_differ",
  /** No dump closed with its ledger: nothing to rehearse with. */
  "dump_missing",
  /** The ledger of the dump is not the one its record says, or does not load. */
  "dump_unreadable",
  /** The live ledger repeats an id: its cut is not projected (review of PR #109, copias B1). */
  "rehearsal_skipped_invalid",
] as const;

const known = (codes: readonly string[], code: string): boolean => codes.includes(code);

export const integrityFindings = (input: {
  /** The findings of severity `error` of the check, by their code. */
  readonly errors: readonly { readonly code: string }[];
  readonly rehearsal: Rehearsal;
  readonly size: { readonly bytes: number; readonly threshold: number };
}): Finding[] => {
  const findings: Finding[] = [];
  if (input.errors.length > 0) {
    const counts: Record<string, number> = { errors: input.errors.length };
    for (const { code } of input.errors) {
      const name = known(INTEGRITY_ERROR_CODES, code) ? code : "other";
      counts[name] = (counts[name] ?? 0) + 1;
    }
    findings.push({ code: "integrity_errors", subject: "integrity", counts });
  }
  if (!input.rehearsal.ok) {
    const counts: Record<string, number> = {};
    for (const [code, count] of Object.entries(input.rehearsal.differs)) {
      const name = known(REHEARSAL_CODES, code) ? code : "other";
      counts[name] = (counts[name] ?? 0) + count;
    }
    findings.push({ code: "restore_rehearsal_differs", subject: "integrity", counts });
  }
  if (input.size.bytes > input.size.threshold) {
    findings.push({
      code: "ledger_size_above_threshold",
      subject: "integrity",
      counts: { bytes: input.size.bytes, threshold: input.size.threshold },
    });
  }
  return findings;
};
