// The scheduled jobs (feature 016; `docs/specification.md` §9.5), each with
// its family — the Lambda and the role it runs under (§8.1 P4) — the key of
// `job_frequencies` that says how often it runs, and how its mail may be
// delivered when a retry comes (§8.1 P10):
//
// - `at_least_once`: the monthly reminder, which must always arrive; a
//   duplicate carries the period in its subject and is recognised as such;
// - `at_most_once`: the warnings, which must not make noise; a cut after
//   `sending` leaves the mail as unknown, never sent twice;
// - `repeatable`: the jobs that send nothing, each step of which is idempotent.
//
// **Only the mail family sends** (§8.2 B2): the others leave their findings in
// their run record, under `jobs/`, and `dispatch_findings` sends them.

import type { JobFrequency, JobFrequencyKey } from "../settings/job-frequencies.js";

export const JOB_FAMILIES = ["ecb", "prices", "mail", "backup", "integrity"] as const;
export type JobFamily = (typeof JOB_FAMILIES)[number];

export type Delivery = "at_least_once" | "at_most_once" | "repeatable";

export interface JobDefinition {
  readonly family: JobFamily;
  /** The key of `job_frequencies`, or a fixed frequency for the internal jobs. */
  readonly frequency: JobFrequencyKey | { readonly fixed: JobFrequency };
  readonly delivery: Delivery;
}

export const JOB_TASKS = {
  ecb_update: { family: "ecb", frequency: "ecb", delivery: "repeatable" },
  prices_update: { family: "prices", frequency: "prices", delivery: "repeatable" },
  dispatch_findings: { family: "mail", frequency: { fixed: "daily" }, delivery: "repeatable" },
  monthly_reminder: { family: "mail", frequency: "reminder", delivery: "at_least_once" },
  weekly_review: { family: "mail", frequency: "review", delivery: "at_most_once" },
  tax_return_ready: { family: "mail", frequency: "tax_return", delivery: "at_most_once" },
  informative_thresholds: {
    family: "mail",
    frequency: "informative_thresholds",
    delivery: "at_most_once",
  },
  monthly_backup: { family: "backup", frequency: "backup", delivery: "repeatable" },
  quarterly_integrity: { family: "integrity", frequency: "integrity", delivery: "repeatable" },
} as const satisfies Record<string, JobDefinition>;

export type JobTask = keyof typeof JOB_TASKS;

export const isJobTask = (name: unknown): name is JobTask =>
  typeof name === "string" && Object.hasOwn(JOB_TASKS, name);

/** The tasks that leave findings for the mail: every one outside the mail family. */
export const PRODUCER_TASKS: readonly JobTask[] = (Object.keys(JOB_TASKS) as JobTask[]).filter(
  (task) => JOB_TASKS[task].family !== "mail",
);

/** How often `task` runs with these frequencies. */
export const frequencyOf = (
  task: JobTask,
  frequencies: Readonly<Record<JobFrequencyKey, JobFrequency>>,
): JobFrequency => {
  const definition: JobDefinition = JOB_TASKS[task];
  return typeof definition.frequency === "string"
    ? frequencies[definition.frequency]
    : definition.frequency.fixed;
};
