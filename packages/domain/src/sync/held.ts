// What a device holds back and what it discards (`sync/held.jsonl` and
// `sync/discarded.jsonl`, and the keys `sync:held` and `sync:discarded` of the
// browser; ADR-0026, Part B; plan §5.2). **Append-only**, kept for ever
// (`docs/data-schema.md` §1): resolving a held line adds a record, it never
// rewrites one. The line of the ledger travels inside a record **as a JSON
// string**, so it is separated from its reason without touching its bytes
// (verified in block 0, point 4).

import { ValidationError } from "../errors.js";
import { isRecord } from "../guards.js";
import { lineSha256, linesOfText } from "./lines.js";

export const HELD_FORMAT = 1;
export const DISCARDED_FORMAT = 1;

/** Where a hold came from: step 3, a rejection of the remote, a rewrite, joining. */
export type HeldOrigin = "client" | "remote" | "rewrite" | "join";

export interface HeldReason {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export type HeldRecord =
  | {
      readonly held_format: 1;
      readonly kind: "held";
      readonly at: string;
      /** SHA-256 of the first line of its unit: the members of a pair share it. */
      readonly unit: string;
      readonly member: number;
      readonly members: number;
      readonly origin: HeldOrigin;
      readonly reason: HeldReason;
      readonly line: string;
    }
  | {
      readonly held_format: 1;
      readonly kind: "redo_started";
      readonly at: string;
      readonly line_sha256: string;
      /** The id the event that redoes it is recorded with, chosen before writing. */
      readonly event_id: string;
    }
  | {
      readonly held_format: 1;
      readonly kind: "resolved";
      readonly at: string;
      readonly line_sha256: string;
      readonly resolution: "confirmed" | "redone" | "discarded";
      readonly event_id?: string;
    };

export interface DiscardedRecord {
  readonly discarded_format: 1;
  readonly at: string;
  readonly reason: { readonly code: "discarded_by_user" | "redone" };
  readonly replaced_by?: string;
  readonly line: string;
}

const unreadable = (file: string, line: number): ValidationError =>
  new ValidationError("sync_held_unreadable", `${file} cannot be read at line ${line}`, {
    file,
    line,
  });

const HELD_KINDS = new Set(["held", "redo_started", "resolved"]);

/** Reads `held.jsonl` strictly: a record that is not one is an error, never skipped. */
export const parseHeld = (text: string): HeldRecord[] =>
  linesOfText(text).map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw unreadable("held", index + 1);
    }
    if (
      !isRecord(value) ||
      value.held_format !== HELD_FORMAT ||
      !HELD_KINDS.has(value.kind as string) ||
      typeof value.at !== "string" ||
      (value.kind === "held" && typeof value.line !== "string") ||
      (value.kind !== "held" && typeof value.line_sha256 !== "string")
    ) {
      throw unreadable("held", index + 1);
    }
    return value as unknown as HeldRecord;
  });

/** Reads `discarded.jsonl` strictly. */
export const parseDiscarded = (text: string): DiscardedRecord[] =>
  linesOfText(text).map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw unreadable("discarded", index + 1);
    }
    if (
      !isRecord(value) ||
      value.discarded_format !== DISCARDED_FORMAT ||
      typeof value.line !== "string"
    ) {
      throw unreadable("discarded", index + 1);
    }
    return value as unknown as DiscardedRecord;
  });

/** Records as the text appended to the file: one JSON per line. */
export const recordsText = (records: readonly (HeldRecord | DiscardedRecord)[]): string =>
  records.map((record) => `${JSON.stringify(record)}\n`).join("");

/** The records that hold a unit back, one per member. */
export const holdRecords = (
  lines: readonly string[],
  origin: HeldOrigin,
  reason: HeldReason,
  at: string,
): HeldRecord[] => {
  const unit = lineSha256(lines[0] as string);
  return lines.map((line, member) => ({
    held_format: HELD_FORMAT,
    kind: "held",
    at,
    unit,
    member,
    members: lines.length,
    origin,
    reason,
    line,
  }));
};

/** A unit held back and not resolved, as the records say it is now. */
export interface HeldUnit {
  readonly unit: string;
  readonly origin: HeldOrigin;
  readonly reason: HeldReason;
  /** Its lines, in the order of the unit. */
  readonly lines: readonly string[];
  /** The id a redo started with, when one did and did not finish. */
  readonly redo?: string;
}

/**
 * The units held back and not resolved, in the order they were first held.
 * The last record of a line decides its state: `held` holds it (again, with
 * its latest reason), `resolved` releases it, `redo_started` annotates it.
 */
export const unresolvedHeld = (records: readonly HeldRecord[]): HeldUnit[] => {
  const current = new Map<string, Extract<HeldRecord, { kind: "held" }>>();
  const redo = new Map<string, string>();
  for (const record of records) {
    if (record.kind === "held") {
      current.set(lineSha256(record.line), record);
    } else if (record.kind === "redo_started") {
      redo.set(record.line_sha256, record.event_id);
    } else {
      current.delete(record.line_sha256);
      redo.delete(record.line_sha256);
    }
  }
  const units = new Map<string, Extract<HeldRecord, { kind: "held" }>[]>();
  for (const record of current.values()) {
    units.set(record.unit, [...(units.get(record.unit) ?? []), record]);
  }
  return [...units.values()].map((members) => {
    const sorted = [...members].sort((left, right) => left.member - right.member);
    const first = sorted[0] as Extract<HeldRecord, { kind: "held" }>;
    const redone = sorted
      .map((member) => redo.get(lineSha256(member.line)))
      .find((id) => id !== undefined);
    return {
      unit: first.unit,
      origin: first.origin,
      reason: first.reason,
      lines: sorted.map((member) => member.line),
      ...(redone === undefined ? {} : { redo: redone }),
    };
  });
};
