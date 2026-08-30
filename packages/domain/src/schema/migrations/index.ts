// Migration chain (data-schema.md §5): pure functions raising one line from
// version v to v+1, applied in memory at load time. Empty while the schema is
// at version 1; the mechanism is exercised by tests with a synthetic chain.

import { DomainError, SchemaTooNewError, ValidationError } from "../../errors.js";
import type { UnknownRecord } from "../../guards.js";
import { CURRENT_SCHEMA_VERSION } from "../envelope.js";

export type Migration = (line: UnknownRecord) => UnknownRecord;

export interface MigrationChain {
  /** Version the chain migrates to. */
  readonly target: number;
  /** Step from version v to v+1, keyed by v. */
  readonly steps: ReadonlyMap<number, Migration>;
}

export const MIGRATIONS: MigrationChain = { target: CURRENT_SCHEMA_VERSION, steps: new Map() };

export const migrate = (line: UnknownRecord, chain: MigrationChain = MIGRATIONS): UnknownRecord => {
  const version = line.schema_version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new ValidationError("invalid_envelope", "schema_version must be a positive integer", {
      field: "schema_version",
      value: version,
    });
  }
  if (version > chain.target) {
    throw new SchemaTooNewError(version, chain.target);
  }
  let current = line;
  for (let from = version; from < chain.target; from += 1) {
    const step = chain.steps.get(from);
    if (step === undefined) {
      throw new DomainError("missing_migration", `no migration from schema_version ${from}`, {
        from,
      });
    }
    current = { ...step(current), schema_version: from + 1 };
  }
  return current;
};
