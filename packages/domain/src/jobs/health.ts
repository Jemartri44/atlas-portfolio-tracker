// What the API reads of the records of a task for `GET /api/jobs/status` (`docs/api.md` §6.3): the
// periods worth opening, and what of a record may leave. Which tasks are late is said in
// `settings/job-health.ts`, which the web reads and these rules never reach.

import type { JobLastRun } from "../settings/job-health.js";
import { JOB_TASKS } from "./catalog.js";
import { PERIOD_SHAPE } from "./periods.js";
import type { RunRecord } from "./run-record.js";

export const lastRunOf = (record: RunRecord): JobLastRun => ({
  task: record.task,
  schedule: JOB_TASKS[record.task].frequency,
  period: record.period,
  state: record.state,
  at: record.closed_at ?? record.claimed_at,
});

/** The period of a key of a task's folder, or nothing when it is not a record. */
const periodOfKey = (key: string): string | undefined => {
  const name = key.slice(key.lastIndexOf("/") + 1);
  const period = name.endsWith(".json") ? name.slice(0, -5) : "";
  return PERIOD_SHAPE.test(period) ? period : undefined;
};

/** Which kind of period it is: a task that changes its frequency leaves both kinds in its folder. */
const shapeOf = (period: string): string => period.replace(/\d/g, "9");

/**
 * The periods worth reading of a task: the latest and the earliest of each kind. Periods of one
 * kind sort by their text, those of two kinds do not, so the records themselves say which is which.
 */
export const runPeriods = (
  keys: readonly string[],
): { readonly latest: string[]; readonly earliest: string[] } => {
  const latest = new Map<string, string>();
  const earliest = new Map<string, string>();
  for (const key of keys) {
    const period = periodOfKey(key);
    if (period !== undefined) {
      const shape = shapeOf(period);
      const last = latest.get(shape);
      const first = earliest.get(shape);
      if (last === undefined || period > last) {
        latest.set(shape, period);
      }
      if (first === undefined || period < first) {
        earliest.set(shape, period);
      }
    }
  }
  return { latest: [...latest.values()], earliest: [...earliest.values()] };
};
