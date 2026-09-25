// What a device keeps back when it downloads a rewritten remote again, or
// when it joins starting from the remote (ADR-0026, Part A, third amendment
// and note of 2026-09-25; ADR-0032, step 6; decision D-Q5).
//
// Two comparisons with two purposes. **Detecting** a rewrite is by the hash of
// the bytes of the synced prefix (`inspect`): a compaction that keeps the ids
// and changes the content is caught. **Classifying** what the device had is by
// `event_id` and canonical form: `compact` rewrites the bytes of every line
// and, by definition, the seal of the filings, so two events are the same
// when their ids match and their canonical lines match **ignoring exactly the
// closed list of fields `compact` rewrites** — today one field.

import type { UnknownRecord } from "../guards.js";
import type { LedgerEvent } from "../schema/events.js";
import { canonicalLine } from "../schema/line.js";

/**
 * The fields `compact` rewrites by definition, by type (`docs/api.md` §5.6).
 * Closed: a new field goes here, in the note of ADR-0026 and in the test at
 * the same time.
 */
export const REWRITTEN_BY_COMPACT: Readonly<Record<string, readonly string[]>> = {
  tax_return_filed: ["ledger_fingerprint"],
};

/** The canonical line of a migrated event without the fields `compact` rewrites. */
export const canonicalForRewrite = (event: LedgerEvent): string => {
  const copy: UnknownRecord = { ...event };
  for (const field of REWRITTEN_BY_COMPACT[event.type] ?? []) {
    delete copy[field];
  }
  return canonicalLine(copy);
};

export interface RewriteClassification {
  /** Lines the new remote does not have by id: held back. */
  readonly absent: readonly string[];
  /** Lines whose id the new remote has with other content: a real conflict, held back. */
  readonly differs: readonly string[];
}

/**
 * Everything the device had —synced or pending— that the new remote does not
 * have, or has with other content. Local lines and events come migrated by the
 * loader, so both sides are compared at the current schema version.
 */
export const classifyAgainst = (
  local: { readonly lines: readonly string[]; readonly events: readonly LedgerEvent[] },
  remote: readonly LedgerEvent[],
): RewriteClassification => {
  const byId = new Map(remote.map((event) => [event.id, canonicalForRewrite(event)]));
  const absent: string[] = [];
  const differs: string[] = [];
  local.events.forEach((event, index) => {
    const theirs = byId.get(event.id);
    const line = local.lines[index] as string;
    if (theirs === undefined) {
      absent.push(line);
    } else if (theirs !== canonicalForRewrite(event)) {
      differs.push(line);
    }
  });
  return { absent, differs };
};
