// Migration chain (data-schema.md §5): pure functions raising one line from
// version v to v+1, applied in memory at load time. The schema is injectable
// (feature 003) so tests can exercise the loader with a future version; the
// real one is `CURRENT_LEDGER_SCHEMA`, at version 1 with an empty chain.

import { DomainError, SchemaTooNewError, ValidationError } from "../../errors.js";
import type { UnknownRecord } from "../../guards.js";
import { CURRENT_SCHEMA_VERSION } from "../envelope.js";

export type Migration = (line: UnknownRecord) => UnknownRecord;

/** Version the loader targets and the steps `v → v+1` (keyed by `v`) that raise a line to it. */
export interface LedgerSchema {
  readonly version: number;
  readonly migrations: ReadonlyMap<number, Migration>;
}

export const CURRENT_LEDGER_SCHEMA: LedgerSchema = {
  version: CURRENT_SCHEMA_VERSION,
  migrations: new Map(),
};

export const migrate = (
  line: UnknownRecord,
  schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
): UnknownRecord => {
  const version = line.schema_version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new ValidationError("invalid_envelope", "schema_version must be a positive integer", {
      field: "schema_version",
      value: version,
    });
  }
  if (version > schema.version) {
    throw new SchemaTooNewError(version, schema.version);
  }
  let current = line;
  for (let from = version; from < schema.version; from += 1) {
    const step = schema.migrations.get(from);
    if (step === undefined) {
      throw new DomainError("missing_migration", `no migration from schema_version ${from}`, {
        from,
      });
    }
    current = { ...step(current), schema_version: from + 1 };
  }
  return current;
};
