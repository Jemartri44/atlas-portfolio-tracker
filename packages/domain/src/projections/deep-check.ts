// Deep checks over the raw lines (data-schema.md §7, feature 003): what the
// projection cannot see because it only ever receives decoded events. Run by
// `atlas check --deep`; `integrity` stays the cheap projection-level check.

import { isSupportedEventType } from "../schema/envelope.js";
import type { LedgerEvent, SupportedEvent } from "../schema/events.js";
import { fingerprintOf } from "../schema/fingerprint.js";
import { canonicalLine, decodeLine, parseLine } from "../schema/line.js";
import { CURRENT_LEDGER_SCHEMA, type LedgerSchema } from "../schema/migrations/index.js";
import { knownFieldsOf } from "../schema/validate.js";
import type { IntegrityFinding } from "./integrity.js";
import { projectLedger } from "./project-ledger.js";
import { snapshotDiff, snapshotOf } from "./snapshot.js";
import type { LedgerState } from "./state.js";

const error = (code: string, message: string, ids: string[] = []): IntegrityFinding => ({
  severity: "error",
  code,
  message,
  event_ids: ids,
});

const warning = (code: string, message: string, ids: string[] = []): IntegrityFinding => ({
  severity: "warning",
  code,
  message,
  event_ids: ids,
});

const lineChecks = (
  lines: readonly string[],
  schema: LedgerSchema,
): { findings: IntegrityFinding[]; duplicates: boolean } => {
  const findings: IntegrityFinding[] = [];
  const positionsById = new Map<string, number[]>();
  const outdated = new Map<number, number>();
  lines.forEach((line, index) => {
    const record = parseLine(line);
    const id = String(record.id);
    positionsById.set(id, [...(positionsById.get(id) ?? []), index + 1]);
    const version = record.schema_version as number;
    if (version < schema.version) {
      outdated.set(version, (outdated.get(version) ?? 0) + 1);
    }
    if (canonicalLine(record) !== line) {
      findings.push(
        warning("non_canonical_line", `line ${index + 1} is not in canonical form`, [id]),
      );
    }
    // Fields of an outdated line belong to an older version: it is reported as outdated, not judged by today's rules.
    const type = record.type;
    if (version === schema.version && isSupportedEventType(type)) {
      const known = knownFieldsOf(type);
      const unknown = Object.keys(record).filter((key) => !known.includes(key));
      if (unknown.length > 0) {
        findings.push(
          warning(
            "unknown_field",
            `line ${index + 1} carries fields ${type} does not define: ${unknown.join(", ")}`,
            [id],
          ),
        );
      }
    }
  });
  let duplicates = false;
  for (const [id, positions] of positionsById) {
    if (positions.length > 1) {
      duplicates = true;
      findings.push(
        error(
          "duplicate_id",
          `id ${id} appears ${positions.length} times (lines ${positions.join(", ")})`,
          [id],
        ),
      );
    }
  }
  if (outdated.size > 0) {
    const total = [...outdated.values()].reduce((sum, count) => sum + count, 0);
    const detail = [...outdated.entries()]
      .sort(([a], [b]) => a - b)
      .map(([version, count]) => `v${version}: ${count}`)
      .join(", ");
    findings.push(
      warning(
        "outdated_lines",
        `${total} lines below schema_version ${schema.version} (${detail}); run atlas compact`,
      ),
    );
  }
  return { findings, duplicates };
};

const fingerprintChecks = (events: readonly LedgerEvent[]): IntegrityFinding[] => {
  const findings: IntegrityFinding[] = [];
  for (const event of events) {
    const stored = (event as { fingerprint?: string }).fingerprint;
    if (stored === undefined || !isSupportedEventType(event.type)) {
      continue;
    }
    const computed = fingerprintOf(event as SupportedEvent);
    if (computed !== undefined && computed !== stored) {
      findings.push(
        error(
          "fingerprint_mismatch",
          `stored fingerprint of ${event.id} does not match the event fields (edited by hand?)`,
          [event.id],
        ),
      );
    }
  }
  return findings;
};

/**
 * Checks the raw lines the store loaded (`duplicate_id`, `non_canonical_line`,
 * `outdated_lines`, `unknown_field`), the stored fingerprints against the event
 * fields (`fingerprint_mismatch`) and that re-reading the text projects to the
 * same snapshot as `state` (`projection_not_reproducible`).
 */
export const deepCheck = (
  lines: readonly string[],
  events: readonly LedgerEvent[],
  state: LedgerState,
  schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
): IntegrityFinding[] => {
  const { findings, duplicates } = lineChecks(lines, schema);
  findings.push(...fingerprintChecks(events));
  if (!duplicates) {
    const reread = lines.map((line) => decodeLine(line, schema).event);
    const again = projectLedger(reread, { collectErrors: true, settings: state.fiscalSettings });
    const keys = snapshotDiff(snapshotOf(state), snapshotOf(again));
    if (keys.length > 0) {
      findings.push(
        error(
          "projection_not_reproducible",
          `re-reading the text projects differently: ${keys.join(", ")}`,
        ),
      );
    }
  }
  return findings;
};
