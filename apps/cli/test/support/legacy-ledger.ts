// A legacy ledger with a filing sealed over it and a line edited afterwards, to test `compact`.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS, type LedgerSchema, type Migration } from "@atlas/domain";
import { LEDGER_FIXTURES } from "./fixtures.js";

export const legacyLines = readFileSync(
  join(LEDGER_FIXTURES, "legacy-v1-for-test-schema.jsonl"),
  "utf8",
)
  .split("\n")
  .filter((line) => line !== "");

const renameNote: Migration = (line) => {
  if (line.note === undefined) {
    return line;
  }
  const { note, ...rest } = line;
  return { ...rest, notes: note };
};
export const TEST_SCHEMA_V2: LedgerSchema = { version: 2, migrations: new Map([[1, renameNote]]) };

/** The legacy ledger plus a filing sealed over it, with a line edited afterwards. */
export const tampered = () => {
  const before = legacyLines.map((line) => JSON.parse(line) as Record<string, unknown>);
  const filing = {
    schema_version: 1,
    id: "01ARYZ6S41TSV4RRFFQ69G5FKM",
    recorded_at: "2028-01-10T10:00:00.000Z",
    type: "tax_return_filed",
    model: "renta",
    tax_year: 2027,
    filed_at: "2028-01-10",
    receipt_reference: "100-2027-ABCDEFGHIJKL",
    declared: { savings_base_eur: "0", pending_losses: [], deferred_losses_eur: "0" },
    computed: {
      as_of: "2028-01-10",
      settings_origin: "default",
      settings: DEFAULT_SETTINGS,
      savings_base_eur: "0",
      pending_losses: [],
      deferred_losses_eur: "0",
    },
    // Sealed over a prefix whose digest will not hold: the point of the case.
    ledger_fingerprint: {
      schema_version: 1,
      lines: before.length,
      sha256: "0".repeat(64),
    },
    fingerprint: "sha256:filing",
  };
  return [...legacyLines, JSON.stringify(filing)];
};
