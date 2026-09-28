// The quarterly integrity (feature 016, E4; `docs/specification.md` §9.5;
// ADR-0032; plan §9; Q7). Three things, and **it sends nothing** (§8.2 B2):
// what it finds is left in its record, for the mail function.
//
// 1. Recompute from scratch and compare: the checks of `atlas check --deep`
//    on the live ledger (`integrity`, `deepCheck`); their **errors** are a
//    finding, counted by code.
// 2. The rehearsal of a restore: the last dump that closed with its ledger
//    (the records of `monthly_backup`) is loaded **in memory**, checked
//    against the SHA-256 its record kept, projected, and compared with the
//    live ledger cut at the same events (`restoreRehearsal`). Nothing is
//    written anywhere but the record.
// 3. The size of the ledger: the bytes it read, against
//    `ATLAS_LEDGER_SIZE_WARNING_BYTES` (ADR-0028), never a number of the code.
//
// It does nothing different by environment: `dev` only has synthetic data.

import { createHash } from "node:crypto";
import { LEDGER_KEY } from "@atlas/adapters/aws";
import {
  CURRENT_LEDGER_SCHEMA,
  DomainError,
  decodeLines,
  integrity,
  type LedgerEvent,
  ProjectionError,
  projectLedger,
} from "@atlas/domain";
import {
  integrityFindings,
  latestDump,
  type Rehearsal,
  type RunRecord,
  restoreRehearsal,
} from "@atlas/domain/jobs";
import { linesOfText } from "@atlas/domain/sync";
import { deepCheck } from "@atlas/domain/tools";
import { textOf } from "../ecb-history.js";
import type { TaskContext, TaskResult, TaskRunner } from "../run.js";

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const DUMP_RECORDS = "jobs/backup/monthly_backup/";

/** The lines and the events of a ledger's bytes, or the code of why they do not decode. */
const decoded = (
  bytes: Uint8Array,
): { lines: string[]; events: LedgerEvent[] } | { code: string } => {
  const text = textOf(bytes);
  if (text === undefined) {
    return { code: "not_utf8" };
  }
  try {
    const lines = linesOfText(text);
    return { lines, events: decodeLines(lines, CURRENT_LEDGER_SCHEMA) };
  } catch (error) {
    return { code: error instanceof DomainError ? error.code : "ledger_unreadable" };
  }
};

/** The records of the dumps, every month that has one that reads. */
const dumpRecords = async (context: TaskContext): Promise<RunRecord[]> => {
  const records: RunRecord[] = [];
  for (const listed of await context.deps.objects.list(DUMP_RECORDS)) {
    const period = /^jobs\/backup\/monthly_backup\/(\d{4}-(?:0[1-9]|1[0-2]))\.json$/.exec(
      listed.key,
    )?.[1];
    if (period === undefined) {
      continue;
    }
    const read = await context.store.readRecord("monthly_backup", period);
    if (read.kind === "read") {
      records.push(read.value);
    }
  }
  return records;
};

const rehearse = async (context: TaskContext, live: LedgerEvent[]): Promise<Rehearsal> => {
  const dump = latestDump(await dumpRecords(context));
  if (dump === undefined) {
    return { ok: false, differs: { dump_missing: 1 } };
  }
  const stored = await context.deps.objects.get(dump.ledgerKey);
  if (stored === undefined || sha256(stored.body) !== dump.ledgerSha256) {
    return { ok: false, differs: { dump_unreadable: 1 } };
  }
  const events = decoded(stored.body);
  if ("code" in events) {
    return { ok: false, differs: { dump_unreadable: 1 } };
  }
  return restoreRehearsal({ dump: events.events, live, today: context.today });
};

export const quarterlyIntegrity: TaskRunner = async (context): Promise<TaskResult> => {
  const { deps } = context;
  const threshold = deps.config.integrity?.ledgerSizeWarningBytes;
  if (threshold === undefined) {
    throw new RangeError("the integrity task without its configuration");
  }
  const stored = await deps.objects.get(LEDGER_KEY);
  if (stored === undefined || stored.body.length === 0) {
    return { state: "failed", outcome: { code: "ledger_absent" } };
  }
  const live = decoded(stored.body);
  if ("code" in live) {
    return { state: "failed", outcome: { code: live.code } };
  }
  let errors: { code: string }[];
  try {
    const state = projectLedger(live.events, { collectErrors: true, asOf: context.today });
    errors = [...integrity(state), ...deepCheck(live.lines, live.events, state)].filter(
      (finding) => finding.severity === "error",
    );
  } catch (error) {
    // Duplicate ids stop the projection even when collecting errors, as in `atlas check`.
    if (!(error instanceof ProjectionError) || error.code !== "duplicate_id") {
      throw error;
    }
    errors = [{ code: "duplicate_id" }];
  }
  const rehearsal = await rehearse(context, live.events);
  const findings = integrityFindings({
    errors,
    rehearsal,
    size: { bytes: stored.body.length, threshold },
  });
  return {
    state: "done",
    outcome: {
      code: "integrity_checked",
      counts: {
        errors: errors.length,
        differences: rehearsal.ok
          ? 0
          : Object.values(rehearsal.differs).reduce((sum, count) => sum + count, 0),
        rehearsed_events: rehearsal.ok ? rehearsal.events : 0,
        bytes: stored.body.length,
      },
    },
    findings,
  };
};
