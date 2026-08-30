// A schema one version ahead of the real one, only for tests (feature 003,
// decision (e)): version 2 renames a fictitious old field `note` to `notes`.
// It exercises the loader, `append` and `compact` with a real migration while
// CURRENT_SCHEMA_VERSION stays at 1.

import type { LedgerSchema, Migration } from "../../src/schema/migrations/index.js";

export const renameNoteToNotes: Migration = (line) => {
  if (line.note === undefined) {
    return line;
  }
  const { note, ...rest } = line;
  return { ...rest, notes: note };
};

export const TEST_SCHEMA_V2: LedgerSchema = {
  version: 2,
  migrations: new Map([[1, renameNoteToNotes]]),
};
