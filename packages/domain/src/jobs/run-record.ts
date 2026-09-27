// The run record of a job and a period (feature 016;
// `specs/016-scheduled-jobs/data-model.md` §1): `jobs/<family>/<task>/<period>.json`,
// written **only** by the function of its family. A job runs more than once:
// EventBridge Scheduler retries an invocation, Lambda retries an asynchronous
// one that fails and may deliver the same event twice (`questions.md` §1.4).
// So each job **claims** its period with `If-None-Match: *` before doing
// anything and **closes** it with `If-Match`, and what a retry does in each
// state is decided here, by the delivery of the job (plan §5.3):
//
//   none          claim, do
//   claimed       do again (nothing was sent, or it is the reminder)
//   sending       at most once: close as `send_unknown`, **never send again**;
//                 otherwise do again
//   send_failed   send again: the service said no
//   failed        do again: nothing was sent
//   done          nothing
//   send_unknown  nothing
//
// A finding is what a job leaves for the mail (§8.2 B2): a code and a subject
// that **never** is an asset, a symbol, an ISIN, an account nor an amount.

import { type CivilDate, isCivilDate } from "../dates/civil-date.js";
import type { IgnoredFrequency } from "../settings/job-frequencies.js";
import { type Delivery, JOB_TASKS, type JobTask } from "./catalog.js";
import {
  CODE_SHAPE,
  hasKeys,
  isCount,
  isInstantText,
  isPlainObject,
  strictJsonObject,
} from "./strict.js";

export const RUN_FORMAT = 1;

export const RUN_STATES = [
  "claimed",
  "sending",
  "send_failed",
  "done",
  "failed",
  "send_unknown",
] as const;
export type RunState = (typeof RUN_STATES)[number];

/** A subject of a finding or a notice: a source, a task, `ecb`… never free text. */
export const SUBJECT_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

export type Counts = Readonly<Record<string, number>>;

export interface Finding {
  readonly code: string;
  readonly subject: string;
  readonly counts?: Counts;
  readonly dates?: readonly CivilDate[];
}

export interface Outcome {
  readonly code: string;
  readonly counts?: Counts;
}

export interface RunRecord {
  readonly run_format: 1;
  readonly task: JobTask;
  readonly period: string;
  readonly state: RunState;
  readonly claimed_at: string;
  readonly attempts: number;
  readonly closed_at?: string;
  readonly outcome?: Outcome;
  readonly frequencies?: { readonly ignored: readonly IgnoredFrequency[] };
  readonly findings?: readonly Finding[];
}

/** Where the record of `task` and `period` lives. */
export const runRecordKey = (task: JobTask, period: string): string =>
  `jobs/${JOB_TASKS[task].family}/${task}/${period}.json`;

const isCounts = (value: unknown): value is Counts =>
  isPlainObject(value) &&
  Object.entries(value).every(([key, count]) => CODE_SHAPE.test(key) && isCount(count));

const isOutcome = (value: unknown): value is Outcome =>
  isPlainObject(value) &&
  hasKeys(value, ["code"], ["counts"]) &&
  typeof value.code === "string" &&
  CODE_SHAPE.test(value.code) &&
  (value.counts === undefined || isCounts(value.counts));

export const isFinding = (value: unknown): value is Finding =>
  isPlainObject(value) &&
  hasKeys(value, ["code", "subject"], ["counts", "dates"]) &&
  typeof value.code === "string" &&
  CODE_SHAPE.test(value.code) &&
  typeof value.subject === "string" &&
  SUBJECT_SHAPE.test(value.subject) &&
  (value.counts === undefined || isCounts(value.counts)) &&
  (value.dates === undefined || (Array.isArray(value.dates) && value.dates.every(isCivilDate)));

const isIgnored = (value: unknown): value is IgnoredFrequency =>
  isPlainObject(value) &&
  hasKeys(value, ["code"], ["key"]) &&
  typeof value.code === "string" &&
  CODE_SHAPE.test(value.code) &&
  (value.key === undefined || (typeof value.key === "string" && CODE_SHAPE.test(value.key)));

export type ReadRecord =
  | { readonly ok: true; readonly record: RunRecord }
  | { readonly ok: false; readonly code: "job_record_unreadable" | "job_record_newer_format" };

/** A record from its bytes, for `task` and `period`: anything else is unreadable, never free. */
export const parseRunRecord = (text: string, task: JobTask, period: string): ReadRecord => {
  const value = strictJsonObject(text);
  if (
    value !== undefined &&
    typeof value.run_format === "number" &&
    value.run_format > RUN_FORMAT
  ) {
    return { ok: false, code: "job_record_newer_format" };
  }
  const readable =
    value !== undefined &&
    hasKeys(
      value,
      ["run_format", "task", "period", "state", "claimed_at", "attempts"],
      ["closed_at", "outcome", "frequencies", "findings"],
    ) &&
    value.run_format === RUN_FORMAT &&
    value.task === task &&
    value.period === period &&
    (RUN_STATES as readonly unknown[]).includes(value.state) &&
    isInstantText(value.claimed_at) &&
    isCount(value.attempts) &&
    value.attempts >= 1 &&
    (value.closed_at === undefined || isInstantText(value.closed_at)) &&
    (value.outcome === undefined || isOutcome(value.outcome)) &&
    (value.frequencies === undefined ||
      (isPlainObject(value.frequencies) &&
        hasKeys(value.frequencies, ["ignored"]) &&
        Array.isArray(value.frequencies.ignored) &&
        value.frequencies.ignored.every(isIgnored))) &&
    (value.findings === undefined ||
      (Array.isArray(value.findings) && value.findings.every(isFinding)));
  return readable
    ? { ok: true, record: value as unknown as RunRecord }
    : { ok: false, code: "job_record_unreadable" };
};

export const serializeRunRecord = (record: RunRecord): string => `${JSON.stringify(record)}\n`;

export type RunStep =
  | { readonly kind: "start" }
  | { readonly kind: "resume" }
  | { readonly kind: "close_unknown" }
  | { readonly kind: "skip"; readonly code: "job_already_done" | "job_send_unknown" };

/** What a run does with the record it found for its period (plan §5.3). */
export const nextStep = (record: RunRecord | undefined, delivery: Delivery): RunStep => {
  if (record === undefined) {
    return { kind: "start" };
  }
  switch (record.state) {
    case "done":
      return { kind: "skip", code: "job_already_done" };
    case "send_unknown":
      return { kind: "skip", code: "job_send_unknown" };
    case "sending":
      return delivery === "at_most_once" ? { kind: "close_unknown" } : { kind: "resume" };
    default:
      return { kind: "resume" };
  }
};

/** Whether a record is closed: nothing more happens to its period. */
export const isClosed = (record: RunRecord): boolean =>
  record.state === "done" || record.state === "send_unknown";

/** The record a run writes when it claims its period, or takes it up again. */
export const claimRecord = (
  task: JobTask,
  period: string,
  at: string,
  previous?: RunRecord,
): RunRecord => ({
  run_format: RUN_FORMAT,
  task,
  period,
  state: "claimed",
  claimed_at: at,
  attempts: previous === undefined ? 1 : previous.attempts + 1,
});

/** The same record in another state; closing states carry the instant. */
export const recordIn = (
  record: RunRecord,
  state: RunState,
  at: string,
  extra: {
    readonly outcome?: Outcome;
    readonly findings?: readonly Finding[];
    readonly frequencies?: { readonly ignored: readonly IgnoredFrequency[] };
  } = {},
): RunRecord => {
  const { closed_at: _closed, ...rest } = record;
  return {
    ...rest,
    state,
    ...(state === "claimed" || state === "sending" ? {} : { closed_at: at }),
    ...extra,
  };
};
