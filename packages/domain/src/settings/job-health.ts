// «Who watches the watcher»: a task that does not even start sends no warning,
// so the web says it from the records the tasks leave. The API reads the last
// run of each task (`docs/api.md` §6.3), and this says which ones are late.
// Kept outside `jobs/`, like the frequencies: the web reads it, and the rules of
// the tasks never reach the browser, so an entry says its own frequency.
//
// **How late comes from the frequency**: the longest a period of it can last
// (31 days for a month, 92 for a quarter, 366 for a year) and two days of
// margin, since a run may come at any hour of its day and a retry the next one.
// A task with no record at all is late once Atlas has been running for longer
// than that: `since` is when the very first record of any task was claimed, and
// records are never deleted. A task that never started is the case this exists
// for, so the last run of the others says nothing: a daily task always ran
// yesterday. When nothing has ever run, all of them are late.
//
// A run left open from an earlier day is late too, whatever the margin: it died
// halfway, closed nothing and sent no mail. A run that closed as failed has a
// mail of its own, so it is judged by its date like any other.
//
// `reconciliation`, reserved in `job_frequencies`, is no task of the catalogue,
// so it is never here. The API says only the tasks active in its environment.
//
// Only dates, states and task names: nothing here carries a figure or an asset.

import { type CivilDate, daysBetween } from "../dates/civil-date.js";
import { madridDateOf } from "../dates/madrid.js";
import { isInstant } from "../guards.js";
import { JOB_FREQUENCY_KEYS, type JobFrequency, type JobFrequencyKey } from "./job-frequencies.js";

const LONGEST_PERIOD_DAYS: Readonly<Record<JobFrequency, number>> = {
  daily: 1,
  weekly: 7,
  monthly: 31,
  quarterly: 92,
  yearly: 366,
};

const MARGIN_DAYS = 2;

const OPEN_STATES: readonly string[] = ["claimed", "sending"];

/** How many days a task of this frequency may go without running. */
export const allowedDays = (frequency: JobFrequency): number =>
  LONGEST_PERIOD_DAYS[frequency] + MARGIN_DAYS;

/** Where a task reads how often it runs: a key of `job_frequencies`, or a fixed frequency. */
export type JobSchedule = JobFrequencyKey | { readonly fixed: JobFrequency };

interface JobEntry {
  readonly task: string;
  readonly schedule: JobSchedule;
}

/** What the API says of a task: its last run, that its record does not read, or nothing. */
export type JobLastRun =
  | (JobEntry & {
      readonly period: string;
      readonly state: string;
      /** When it closed or, still open, when it was claimed. */
      readonly at: string;
    })
  | (JobEntry & { readonly unreadable: true })
  | JobEntry;

/** What `GET /api/jobs/status` answers. */
export interface JobStatus {
  /** When the first record of the active tasks was claimed. Absent: nothing has ever run. */
  readonly since?: string;
  /** The tasks active in this environment. */
  readonly tasks: readonly JobLastRun[];
}

const NAME = /^[a-z][a-z0-9_]{0,63}$/;
const PERIOD = /^\d{4}(-[0-9WQ-]{2,6})?$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnly = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const isFrequency = (value: unknown): value is JobFrequency =>
  typeof value === "string" && Object.hasOwn(LONGEST_PERIOD_DAYS, value);

const isSchedule = (value: unknown): value is JobSchedule =>
  typeof value === "string"
    ? Object.hasOwn(JOB_FREQUENCY_KEYS, value)
    : isObject(value) && hasOnly(value, ["fixed"]) && isFrequency(value.fixed);

const isLastRun = (value: unknown): value is JobLastRun => {
  if (
    !isObject(value) ||
    typeof value.task !== "string" ||
    !NAME.test(value.task) ||
    !isSchedule(value.schedule)
  ) {
    return false;
  }
  return (
    hasOnly(value, ["task", "schedule"]) ||
    (hasOnly(value, ["task", "schedule", "unreadable"]) && value.unreadable === true) ||
    (hasOnly(value, ["task", "schedule", "period", "state", "at"]) &&
      typeof value.period === "string" &&
      PERIOD.test(value.period) &&
      typeof value.state === "string" &&
      NAME.test(value.state) &&
      isInstant(value.at))
  );
};

/** The answer of the API as it is promised, or nothing: a shape it does not know is no answer. */
export const parseJobStatus = (value: unknown): JobStatus | undefined => {
  if (
    !isObject(value) ||
    !(hasOnly(value, ["tasks"]) || hasOnly(value, ["tasks", "since"])) ||
    !Array.isArray(value.tasks) ||
    !value.tasks.every(isLastRun) ||
    (value.since !== undefined && !isInstant(value.since))
  ) {
    return undefined;
  }
  return {
    ...(typeof value.since === "string" ? { since: value.since } : {}),
    tasks: value.tasks,
  };
};

export interface JobHealth {
  readonly task: string;
  readonly frequency: JobFrequency;
  /** Absent: no record of this task. */
  readonly last?: { readonly day: CivilDate; readonly state: string };
  readonly unreadable: boolean;
  /** Days since it last ran, when it did. */
  readonly days?: number;
  readonly late: boolean;
}

/** Every active task, in the order it came, with what its last run says. */
export const jobHealth = (
  status: JobStatus,
  frequencies: Readonly<Record<JobFrequencyKey, JobFrequency>>,
  today: CivilDate,
): JobHealth[] => {
  const running = status.since === undefined ? undefined : madridDateOf(status.since);
  return status.tasks.map((run) => {
    const frequency =
      typeof run.schedule === "string" ? frequencies[run.schedule] : run.schedule.fixed;
    const unreadable = "unreadable" in run;
    if (!("at" in run)) {
      return {
        task: run.task,
        frequency,
        unreadable,
        late: running === undefined || daysBetween(running, today) > allowedDays(frequency),
      };
    }
    const day = madridDateOf(run.at);
    const since = daysBetween(day, today);
    return {
      task: run.task,
      frequency,
      last: { day, state: run.state },
      unreadable,
      days: since,
      late: since > allowedDays(frequency) || (since > 0 && OPEN_STATES.includes(run.state)),
    };
  });
};
