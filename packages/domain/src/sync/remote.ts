// What the remote accepts (`docs/api.md` §5.2, §5.3 and §5.5; ADR-0026, Part A
// and its notes of 2026-09-25). Pure: the simulated remotes of feature 014
// call it, and the Lambda of feature 015 will call it, over the same use case
// the client re-applies with (`reapplyUnits` + `evaluateUnit`). The remote
// only ever **appends**; the validation is here, in the backend, whatever the
// client did.

import type { DomainError } from "../errors.js";
import { isRecord, type UnknownRecord } from "../guards.js";
import type { AppendEntry, DeviceQueueState, LineRejection } from "../ports/remote-ledger.js";
import { RemoteError } from "../ports/remote-ledger.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { LedgerEvent, ReversalEvent, TaxReturnFiledEvent } from "../schema/events.js";
import { holdsLoneSurrogate, repeatsKey } from "../schema/json-keys.js";
import { decodeLine } from "../schema/line.js";
import type { LedgerSchema } from "../schema/migrations/index.js";
import { duplicatesOf } from "../usecases/record-event.js";
import { evaluateUnit } from "./evaluate.js";
import { linesOfText } from "./lines.js";
import { type ReapplyBase, reapplyUnits } from "./reapply.js";
import { sealHolds } from "./seal.js";

/** What the remote needs to judge a line besides the line: its schema and its clock. */
export interface RemoteRules {
  readonly schema: LedgerSchema;
  readonly now: Date;
  /** How far ahead of the remote's clock a `recorded_at` may be (case 8; the value is feature 015's). */
  readonly clockToleranceMs: number;
}

const bodyInvalid = (reason: string): RemoteError =>
  new RemoteError("body_invalid", 400, { reason });

const ENTRY_KEYS = new Set(["line", "confirm_duplicate", "has_correction", "chain_continues"]);

/**
 * The body of `POST /api/ledger/lines`, by its **shape only** (`docs/api.md`
 * §5.2): never by the content of a line, which is judged line by line inside
 * a successful answer. A `device_id` anywhere is refused: the device comes
 * from the credential (§2.3).
 */
export const parseAppendBody = (body: unknown): AppendEntry[] => {
  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => key !== "lines") ||
    !Array.isArray(body.lines)
  ) {
    throw bodyInvalid("shape");
  }
  return body.lines.map((entry: unknown) => {
    if (!isRecord(entry) || Object.keys(entry).some((key) => !ENTRY_KEYS.has(key))) {
      throw bodyInvalid("entry");
    }
    if (typeof entry.line !== "string" || /[\n\r]/.test(entry.line)) {
      throw bodyInvalid("line");
    }
    const refused = textRefusal(entry.line);
    if (refused !== undefined) {
      throw bodyInvalid(refused);
    }
    for (const flag of ["confirm_duplicate", "has_correction", "chain_continues"]) {
      if (entry[flag] !== undefined && typeof entry[flag] !== "boolean") {
        throw bodyInvalid(flag);
      }
    }
    return {
      line: entry.line,
      ...(entry.confirm_duplicate === true ? { confirm_duplicate: true as const } : {}),
      ...(entry.has_correction === true ? { has_correction: true as const } : {}),
      ...(entry.chain_continues === true ? { chain_continues: true as const } : {}),
    };
  });
};

/**
 * What makes a line unacceptable **before it is judged** (review of PR #96,
 * security B1 and N3): a lone surrogate, whose bytes would not be UTF-8 and
 * would leave the remote unreadable for every device; or, in a line that is
 * JSON, a key repeated inside one object, which two readers read two ways.
 * A line that is not JSON is left to its judgement (`line_unreadable`).
 */
const textRefusal = (line: string): "lone_surrogate" | "duplicate_key" | undefined => {
  if (holdsLoneSurrogate(line)) {
    return "lone_surrogate";
  }
  try {
    JSON.parse(line);
  } catch {
    return undefined;
  }
  return repeatsKey(line) ? "duplicate_key" : undefined;
};

/** The body of `PUT /api/sync/devices/self` (§5.3): two counts and a date; never a device. */
export const parsePublishBody = (body: unknown): DeviceQueueState => {
  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => !["pending", "held", "last_sync_at"].includes(key)) ||
    !Number.isSafeInteger(body.pending) ||
    (body.pending as number) < 0 ||
    !Number.isSafeInteger(body.held) ||
    (body.held as number) < 0 ||
    typeof body.last_sync_at !== "string"
  ) {
    throw bodyInvalid("publish");
  }
  return body as unknown as DeviceQueueState;
};

/** The body of `PUT /api/ledger` (§5.5). */
export const parseInitBody = (
  body: unknown,
): { content: string; confirm_duplicate_ids: string[] } => {
  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => !["content", "confirm_duplicate_ids"].includes(key)) ||
    typeof body.content !== "string" ||
    !Array.isArray(body.confirm_duplicate_ids) ||
    !body.confirm_duplicate_ids.every((id: unknown) => typeof id === "string")
  ) {
    throw bodyInvalid("init");
  }
  return body as unknown as { content: string; confirm_duplicate_ids: string[] };
};

interface Rejection {
  readonly code: string;
  readonly details: Record<string, unknown>;
}

const correctsOf = (raw: UnknownRecord): unknown => raw.corrects_id;

/** Rows 1, 2, 4 and 5 of the table of §5.2 for one line: what can be said of it alone. */
const readLine = (
  line: string,
  rules: RemoteRules,
  entry?: AppendEntry,
): { event: LedgerEvent; raw: UnknownRecord } | Rejection => {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { code: "line_unreadable", details: {} };
  }
  if (!isRecord(raw) || typeof raw.schema_version !== "number") {
    return { code: "line_unreadable", details: {} };
  }
  if (raw.schema_version > rules.schema.version) {
    return {
      code: "schema_version_unsupported",
      details: { found: raw.schema_version, supported: rules.schema.version },
    };
  }
  // Row 3, **before** the line is decoded (`docs/api.md` §5.2; review of PR
  // #83, non-blocking 7): a declaration the line does not admit is said as
  // such, whatever else is wrong with the line.
  if (
    (entry?.has_correction === true && raw.type !== "reversal") ||
    (entry?.chain_continues === true && raw.corrects_id === undefined)
  ) {
    return { code: "pair_declaration_invalid", details: {} };
  }
  let event: LedgerEvent;
  try {
    event = decodeLine(line, rules.schema).event;
  } catch (error) {
    return { code: "line_invalid", details: { domain_code: (error as DomainError).code } };
  }
  if (Date.parse(event.recorded_at) > rules.now.getTime() + rules.clockToleranceMs) {
    return { code: "recorded_at_in_future", details: { recorded_at: event.recorded_at } };
  }
  return { event, raw };
};

/** A unit of a request, formed from the declarations of the client. */
interface RequestUnit {
  readonly start: number;
  readonly entries: readonly AppendEntry[];
  readonly lines: readonly string[];
  readonly events: readonly LedgerEvent[];
}

interface FormingProblem {
  readonly index: number;
  readonly id?: string;
  readonly rejection: Rejection;
}

const correctsIn = (line: string): unknown => {
  try {
    return (JSON.parse(line) as UnknownRecord | null)?.corrects_id;
  } catch {
    return undefined;
  }
};

/**
 * Forms the units of a request from the declarations of the client, and runs
 * on each member the checks of one line (rows 1, 2, 4 and 5) and of the
 * declarations (row 3, `pair_incomplete`, `pair_not_contiguous`). Stops at the
 * first problem, reported at the index of **the first line of its unit**:
 * nothing of a unit is ever written alone.
 */
const formUnits = (
  entries: readonly AppendEntry[],
  rules: RemoteRules,
): { units: RequestUnit[]; problem?: FormingProblem } => {
  const units: RequestUnit[] = [];
  let index = 0;
  while (index < entries.length) {
    const start = index;
    const members: { entry: AppendEntry; event: LedgerEvent }[] = [];
    const stop = (rejection: Rejection, id?: unknown) => {
      const paired = index > start || entries[start]?.has_correction === true;
      return {
        units,
        problem: {
          index: start,
          ...(typeof id === "string" ? { id } : {}),
          rejection: {
            code: rejection.code,
            details: { ...rejection.details, ...(paired ? { member_index: index - start } : {}) },
          },
        },
      };
    };
    for (;;) {
      const entry = entries[index] as AppendEntry;
      const read = readLine(entry.line, rules, entry);
      const firstId = members[0]?.event.id;
      if ("code" in read) {
        return stop(read, firstId);
      }
      const id = firstId ?? read.event.id;
      const position = members.length;
      if (position === 0 && correctsOf(read.raw) !== undefined) {
        // A correction with no declared reversal right before it (P7).
        return stop({ code: "pair_not_contiguous", details: {} }, id);
      }
      if (position % 2 === 1) {
        const target = ((members[position - 1] as { event: LedgerEvent }).event as ReversalEvent)
          .reverses_id;
        if (correctsOf(read.raw) !== target) {
          const later = entries.slice(index + 1).some((next) => correctsIn(next.line) === target);
          return stop({ code: later ? "pair_not_contiguous" : "pair_incomplete", details: {} }, id);
        }
      } else if (position > 0 && entry.has_correction !== true) {
        // The correction before said the chain continues, and this is not a
        // reversal that declares its correction.
        return stop({ code: "pair_incomplete", details: {} }, id);
      }
      members.push({ entry, event: read.event });
      index += 1;
      const open =
        entry.has_correction === true || (position % 2 === 1 && entry.chain_continues === true);
      if (!open) {
        break;
      }
      if (index >= entries.length) {
        index -= 1;
        return stop({ code: "pair_incomplete", details: {} }, id);
      }
    }
    units.push({
      start,
      entries: members.map((member) => member.entry),
      lines: members.map((member) => member.entry.line),
      events: members.map((member) => member.event),
    });
  }
  return { units };
};

/** Rows 6 to 9 of the table of §5.2, on a whole unit over the base it lands on. */
const judgeUnit = (
  unit: RequestUnit,
  base: ReapplyBase,
  rules: RemoteRules,
): Rejection | undefined => {
  const paired = unit.events.length > 1;
  const checked = evaluateUnit(base.events, unit.events);
  if (!checked.ok) {
    const { member, member_index, domain_code, affected } = checked.failure;
    const extra = affected === undefined ? {} : { affected };
    return paired
      ? {
          code: "pair_rejected",
          details: {
            member,
            member_code: domain_code,
            ...(member_index === undefined ? {} : { member_index }),
            ...extra,
          },
        }
      : { code: "domain_rejected", details: { domain_code, ...extra } };
  }
  for (const [index, event] of unit.events.entries()) {
    const existing = duplicatesOf(checked.state.fingerprints, event);
    if (existing.length > 0 && unit.entries[index]?.confirm_duplicate !== true) {
      return {
        code: "duplicate_unconfirmed",
        details: { existing, ...(paired ? { member_index: index } : {}) },
      };
    }
  }
  for (const [index, event] of unit.events.entries()) {
    if (
      event.type === "tax_return_filed" &&
      !sealHolds(
        [...base.lines, ...unit.lines.slice(0, index)],
        event as TaxReturnFiledEvent,
        rules.schema,
      )
    ) {
      return { code: "seal_mismatch", details: paired ? { member_index: index } : {} };
    }
    // A waiver is never a member of a pair: it cannot be reversed
    // (`waiver_not_reversible`), so row 6 refuses any pair around it first.
    if (event.type === "filing_fingerprint_waived") {
      return { code: "waiver_not_appendable", details: {} };
    }
  }
  return undefined;
};

export interface AppendAcceptance {
  /** Entries to write, from the first: the valid stretch up to the first rejected unit. */
  readonly accepted: number;
  /** The exact lines to append (`accepted` of them). */
  readonly lines: readonly string[];
  readonly rejected?: LineRejection;
}

/**
 * Judges a request over the remote as it is (`remoteLines`): the valid
 * stretch up to the first rejected unit, and the reason of that one. Nothing
 * behind it is written, even if valid.
 */
export const acceptAppend = (
  remoteLines: readonly string[],
  entries: readonly AppendEntry[],
  rules: RemoteRules,
): AppendAcceptance => {
  const remoteEvents = remoteLines.map((line) => decodeLine(line, rules.schema).event);
  const { units, problem } = formUnits(entries, rules);
  const invalid = projectLedger(remoteEvents, { collectErrors: true }).invalid;
  if (invalid.length > 0) {
    // The remote never receives an invalid ledger; one that is (a rule
    // hardened later) accepts nothing more until it is repaired.
    return {
      accepted: 0,
      lines: [],
      rejected: {
        index: 0,
        code: "domain_rejected",
        details: { domain_code: "ledger_has_invalid_events", invalid_count: invalid.length },
      },
    };
  }
  const outcome = reapplyUnits({ lines: remoteLines, events: remoteEvents }, units, (unit, base) =>
    judgeUnit(unit, base, rules),
  );
  const accepted = outcome.accepted.reduce((sum, unit) => sum + unit.entries.length, 0);
  const lines = outcome.accepted.flatMap((unit) => unit.lines);
  if (outcome.failed !== undefined) {
    const { unit, reason } = outcome.failed;
    // A unit is never empty: its first event names it.
    const id = (unit.events[0] as LedgerEvent).id;
    return { accepted, lines, rejected: { index: unit.start, id, ...reason } };
  }
  if (problem !== undefined) {
    return {
      accepted,
      lines,
      rejected: {
        index: problem.index,
        ...(problem.id === undefined ? {} : { id: problem.id }),
        ...problem.rejection,
      },
    };
  }
  return { accepted, lines };
};

/**
 * The ids a first device confirms when it initialises the remote (§6.3 (V17),
 * decision D-Q16): every event whose fingerprint repeats that of an **earlier
 * event in the file**, reversed or not. Everything in the local ledger was
 * accepted locally, so the client derives them without asking again.
 */
export const initDuplicateIds = (events: readonly LedgerEvent[]): string[] => {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const event of events) {
    const fingerprint = (event as { fingerprint?: string }).fingerprint;
    if (fingerprint === undefined) {
      continue;
    }
    if (seen.has(fingerprint)) {
      ids.push(event.id);
    }
    seen.add(fingerprint);
  }
  return ids;
};

const initRejected = (code: string, details: Record<string, unknown>): RemoteError =>
  new RemoteError("init_rejected", 422, { code, ...details });

/**
 * Judges the initialisation of an **empty** remote with the whole bytes of a
 * ledger (§5.5; §6.3 (V6) and (V17)): it loads with the schema, projects valid,
 * no `recorded_at` beyond the clock, and every repeated fingerprint confirmed.
 * The declarations of pairs and chains do not apply: there is no queue to
 * split. Returns the lines to write; throws `init_rejected` otherwise.
 */
export const acceptInit = (
  content: string,
  confirmDuplicateIds: readonly string[],
  rules: RemoteRules,
): string[] => {
  const lines = linesOfText(content);
  const events: LedgerEvent[] = [];
  for (const [index, line] of lines.entries()) {
    if (/\r/.test(line)) {
      throw initRejected("raw_line_break", { line: index + 1 });
    }
    const refused = textRefusal(line);
    if (refused !== undefined) {
      throw initRejected(refused, { line: index + 1 });
    }
    const read = readLine(line, rules);
    if ("code" in read) {
      throw initRejected(read.code, { ...read.details, line: index + 1 });
    }
    events.push(read.event);
  }
  let state: ReturnType<typeof projectLedger>;
  try {
    state = projectLedger(events, { collectErrors: true });
  } catch (error) {
    throw initRejected("domain_rejected", {
      domain_code: (error as DomainError).code,
      id: (error as DomainError).details.event_id,
    });
  }
  const first = state.invalid[0];
  if (first !== undefined) {
    throw initRejected("domain_rejected", { domain_code: first.error.code, id: first.event.id });
  }
  const confirmed = new Set(confirmDuplicateIds);
  const unconfirmed = initDuplicateIds(events).find((id) => !confirmed.has(id));
  if (unconfirmed !== undefined) {
    throw initRejected("duplicate_unconfirmed", { id: unconfirmed });
  }
  return lines;
};
