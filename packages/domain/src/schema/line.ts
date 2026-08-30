// One event = one JSON line (data-schema.md §2). `decodeLine` rejects newer
// schema versions before anything else, migrates in memory and validates the
// shape. `encodeLine` writes the envelope keys first, in a fixed order.

import { ValidationError } from "../errors.js";
import { isRecord } from "../guards.js";
import type { LedgerEvent } from "./events.js";
import { migrate } from "./migrations/index.js";
import { validateShape } from "./validate.js";

export interface DecodedLine {
  readonly event: LedgerEvent;
  /** The line exactly as read, without the trailing newline. Stores keep it to never re-serialise. */
  readonly raw: string;
}

const ENVELOPE_ORDER = ["schema_version", "id", "recorded_at", "type", "corrects_id"] as const;

export const decodeLine = (text: string): DecodedLine => {
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
  return { event: validateShape(migrate(parsed)), raw: text };
};

export const encodeLine = (event: LedgerEvent): string => {
  const source = event as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const key of ENVELOPE_ORDER) {
    if (source[key] !== undefined) {
      ordered[key] = source[key];
    }
  }
  for (const [key, value] of Object.entries(source)) {
    if (!(key in ordered)) {
      ordered[key] = value;
    }
  }
  return JSON.stringify(ordered);
};
