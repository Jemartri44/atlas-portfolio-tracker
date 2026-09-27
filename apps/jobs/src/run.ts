// How the handler runs one job for one period (feature 016, plan §5.3). The
// domain decides what a retry does (`nextStep`); this only reads the record,
// writes it conditionally and calls the task. A conflict means another run
// has the period: this one stops, writes nothing more and says so. **A
// foreseen failure is closed in the record with its code and the invocation
// ends normally**, so Lambda never retries it by itself (`questions.md` §1.4);
// only a record that cannot even be written escapes as an error.

import type { ObjectStore, ParameterStore } from "@atlas/adapters/aws";
import { JobsStore, JobsWriteConflict } from "@atlas/adapters/aws-jobs";
import type { CivilDate } from "@atlas/domain";
import {
  claimRecord,
  type Finding,
  JOB_TASKS,
  type JobFrequencies,
  type JobsConfig,
  type JobTask,
  type Notifier,
  nextStep,
  type Outcome,
  type RunRecord,
  recordIn,
} from "@atlas/domain/jobs";
import type { JobLedger } from "./ledger.js";
import { errorName, logLine } from "./log.js";

export interface JobsDeps {
  readonly config: JobsConfig;
  readonly objects: ObjectStore;
  readonly parameters: ParameterStore;
  /** Only the mail family has one (§8.2 B2). */
  readonly notifier?: Notifier;
  readonly now: () => Date;
  readonly log: (line: string) => void;
}

export interface TaskContext {
  readonly deps: JobsDeps;
  readonly store: JobsStore;
  readonly task: JobTask;
  readonly period: string;
  readonly today: CivilDate;
  readonly ledger: () => Promise<JobLedger>;
  readonly frequencies: JobFrequencies;
  /** Marks the record `sending` right before a warning goes out: the step that makes it at most once. */
  readonly markSending: () => Promise<void>;
}

export interface TaskResult {
  readonly state: "done" | "failed" | "send_failed" | "send_unknown";
  readonly outcome: Outcome;
  readonly findings?: readonly Finding[];
}

export type TaskRunner = (context: TaskContext) => Promise<TaskResult>;

const level = (state: TaskResult["state"]): "INFO" | "WARN" | "ERROR" =>
  state === "done" ? "INFO" : state === "send_unknown" ? "WARN" : "ERROR";

export interface RunInput {
  readonly deps: JobsDeps;
  readonly requestId: string;
  readonly task: JobTask;
  readonly period: string;
  readonly today: CivilDate;
  readonly ledger: () => Promise<JobLedger>;
  readonly frequencies: JobFrequencies;
  readonly runner: TaskRunner;
  /** A period before today's: only taken up if it was left open, never started. */
  readonly onlyUnfinished?: boolean;
}

/** Runs `task` for `period`, once, whatever came before. */
export const runPeriod = async (input: RunInput): Promise<void> => {
  const { deps, task, period } = input;
  const store = new JobsStore(deps.objects, JOB_TASKS[task].family);
  const say = (
    entry: { level: "INFO" | "WARN" | "ERROR"; code: string } & Partial<{
      reason: string;
      error_name: string;
      counts: Readonly<Record<string, number>>;
    }>,
  ) => deps.log(logLine({ request_id: input.requestId, job: task, period, ...entry }));
  const at = () => deps.now().toISOString();

  const read = await store.readRecord(task, period);
  const delivery = JOB_TASKS[task].delivery;
  // A record that does not read is never taken for a free period. Only the
  // reminder, which must arrive, claims it back over its own ETag — never one
  // of a newer format, which an old run must not rewrite — and says so
  // (review of PR #104, idempotence N4): the month is not lost.
  const reclaim =
    read.kind === "unreadable" &&
    delivery === "at_least_once" &&
    read.code !== "job_record_newer_format";
  if (read.kind === "unreadable") {
    say({ level: "ERROR", code: "job_record_unreadable", reason: read.code });
    if (!reclaim) {
      return;
    }
  }
  if (read.kind === "absent" && input.onlyUnfinished === true) {
    return;
  }
  const found = read.kind === "read" ? read.value : undefined;
  const step = reclaim
    ? ({ kind: "resume" } as const)
    : nextStep(found, delivery, deps.now().getTime(), deps.config.maxRunMs);
  if (step.kind === "skip") {
    if (input.onlyUnfinished !== true) {
      say({ level: "INFO", code: step.code });
    }
    return;
  }
  try {
    let etag = read.kind === "absent" ? undefined : read.etag;
    if (step.kind === "close_unknown") {
      await store.writeRecord(recordIn(found as RunRecord, "send_unknown", at()), etag);
      say({ level: "WARN", code: "job_send_unknown" });
      return;
    }
    let record = claimRecord(task, period, at(), found);
    etag = await store.writeRecord(record, etag);
    // Whether the mail may have gone: once `sending` is written, a run that
    // throws closes as `send_unknown`, never as `failed`, or the next run would
    // send an at-most-once warning again (review of PR #104, idempotence B1).
    let sending = false;
    const markSending = async () => {
      record = recordIn(record, "sending", at());
      etag = await store.writeRecord(record, etag);
      sending = true;
    };
    const ignored = input.frequencies.ignored;
    let result: TaskResult;
    try {
      result = await input.runner({
        deps,
        store,
        task,
        period,
        today: input.today,
        ledger: input.ledger,
        frequencies: input.frequencies,
        markSending,
      });
    } catch (error) {
      if (error instanceof JobsWriteConflict) {
        throw error;
      }
      result = { state: sending ? "send_unknown" : "failed", outcome: { code: "task_error" } };
      say({ level: "ERROR", code: "task_error", error_name: errorName(error) });
    }
    await store.writeRecord(
      recordIn(record, result.state, at(), {
        outcome: result.outcome,
        ...(result.findings === undefined || result.findings.length === 0
          ? {}
          : { findings: result.findings }),
        ...(ignored.length === 0 ? {} : { frequencies: { ignored } }),
      }),
      etag,
    );
    say({
      level: level(result.state),
      code: result.outcome.code,
      ...(result.outcome.counts === undefined ? {} : { counts: result.outcome.counts }),
    });
  } catch (error) {
    if (error instanceof JobsWriteConflict) {
      say({ level: "WARN", code: "job_record_conflict" });
      return;
    }
    throw error;
  }
};
