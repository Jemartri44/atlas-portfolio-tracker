// One event = one JSON line (data-schema.md §2). `decodeLine` parses, rejects
// newer schema versions before anything else, migrates in memory and validates
// the shape. `canonicalLine` writes the envelope keys first, in a fixed order,
// and the rest in their own order: the form every client is expected to write.

import { ValidationError } from "../errors.js";
import { isRecord, type UnknownRecord } from "../guards.js";
import type { LedgerEvent } from "./events.js";
import { CURRENT_LEDGER_SCHEMA, type LedgerSchema, migrate } from "./migrations/index.js";
import { validateShape } from "./validate.js";

export interface DecodedLine {
  readonly event: LedgerEvent;
  /** The line exactly as read, without the trailing newline. Stores keep it to never re-serialise. */
  readonly raw: string;
}

const ENVELOPE_ORDER = ["schema_version", "id", "recorded_at", "type", "corrects_id"] as const;

/** JSON object of one line, before any migration or validation. */
export const parseLine = (text: string): UnknownRecord => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ValidationError("invalid_json", "ledger line is not valid JSON", {
      reason: (error as Error).message,
    });
  }
  if (!isRecord(parsed)) {
    throw new ValidationError("invalid_line", "ledger line must be a JSON object", {
      value: parsed,
    });
  }
  return parsed;
};

export const decodeLine = (
  text: string,
  schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
): DecodedLine => ({ event: validateShape(migrate(parseLine(text), schema), schema), raw: text });

/** Canonical text of a record as written: envelope keys first, then the rest in their order, no spaces. */
export const canonicalLine = (record: UnknownRecord): string => {
  const ordered: Record<string, unknown> = {};
  for (const key of ENVELOPE_ORDER) {
    if (record[key] !== undefined) {
      ordered[key] = record[key];
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (!(key in ordered)) {
      ordered[key] = value;
    }
  }
  return JSON.stringify(ordered);
};

export const encodeLine = (event: LedgerEvent): string =>
  canonicalLine(event as unknown as UnknownRecord);
