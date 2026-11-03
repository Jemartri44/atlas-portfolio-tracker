// `GET /api/jobs/status` (`docs/api.md` §6.3): the last run of each scheduled task, from the records
// the tasks leave under `jobs/`, only of the families scheduled in this environment. It only reads
// and says what is there: which tasks are late is the domain's (`jobHealth`), in the web, which
// holds the frequencies. A record says a task, a period, a state and two instants; its findings and
// counts never leave this file.

import type { ObjectStore } from "@atlas/adapters/aws";
import {
  JOB_TASKS,
  type JobFamily,
  type JobLastRun,
  type JobStatus,
  type JobTask,
  lastRunOf,
  parseRunRecord,
  type RunRecord,
  runPeriods,
  runRecordKey,
} from "@atlas/domain/job-records";
import type { Outcome } from "./outcome.js";
import { json } from "./respond.js";

export interface JobStatusContext {
  readonly objects: ObjectStore;
  /** The families scheduled in this environment: a sleeping `dev` has none. */
  readonly activeFamilies: readonly JobFamily[];
}

const textOf = (body: Uint8Array): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return undefined;
  }
};

const readRecord = async (
  objects: ObjectStore,
  task: JobTask,
  period: string,
): Promise<RunRecord | "unreadable" | undefined> => {
  const stored = await objects.get(runRecordKey(task, period));
  if (stored === undefined) {
    return undefined;
  }
  const text = textOf(stored.body);
  const read = text === undefined ? undefined : parseRunRecord(text, task, period);
  return read?.ok === true ? read.record : "unreadable";
};

const isRecord = (read: RunRecord | "unreadable" | undefined): read is RunRecord =>
  read !== undefined && read !== "unreadable";

/** The last run of a task and when its first record was claimed. */
const statusOf = async (
  objects: ObjectStore,
  task: JobTask,
): Promise<{ readonly run: JobLastRun; readonly first?: string }> => {
  const listed = await objects.list(`jobs/${JOB_TASKS[task].family}/${task}/`);
  const { latest, earliest } = runPeriods(listed.map((object) => object.key));
  const readAll = (periods: readonly string[]) =>
    Promise.all(periods.map((period) => readRecord(objects, task, period)));
  const [last, first] = await Promise.all([readAll(latest), readAll(earliest)]);
  const runs = last
    .filter(isRecord)
    .map(lastRunOf)
    .filter((run) => "at" in run)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const claimed = first
    .filter(isRecord)
    .map((record) => record.claimed_at)
    .sort()[0];
  const schedule = JOB_TASKS[task].frequency;
  const run: JobLastRun =
    runs[0] ??
    (last.includes("unreadable") ? { task, schedule, unreadable: true } : { task, schedule });
  return { run, ...(claimed === undefined ? {} : { first: claimed }) };
};

export const jobStatusRoutes = ({ objects, activeFamilies }: JobStatusContext) => ({
  read: async (): Promise<Outcome> => {
    const active = (Object.keys(JOB_TASKS) as JobTask[]).filter((task) =>
      activeFamilies.includes(JOB_TASKS[task].family),
    );
    const statuses = await Promise.all(active.map((task) => statusOf(objects, task)));
    const since = statuses.flatMap((status) => status.first ?? []).sort()[0];
    const body: JobStatus = {
      ...(since === undefined ? {} : { since }),
      tasks: statuses.map((status) => status.run),
    };
    return { result: json(200, body), code: "job_status_read" };
  },
});
