// The handler of the scheduled jobs (feature 016, E1): it **composes and
// decides nothing** (§2 bis). EventBridge Scheduler wakes each function once a
// day with its event; for each task the event names, the domain says its
// frequency (`job_frequencies`, read tolerantly), whether it may run today
// and its period in `Europe/Madrid`; the record of that period says what a
// retry does. A period left open before — a reminder claimed and never sent
// at the turn of a month — is finished first (Q6), for the tasks that send.

import type { CivilDate } from "@atlas/domain";
import { madridDateOf } from "@atlas/domain";
import {
  frequencyOf,
  inWindow,
  JOB_TASKS,
  type JobFrequencies,
  type JobTask,
  parseJobEvent,
  periodOf,
  previousPeriod,
  readJobFrequencies,
} from "@atlas/domain/jobs";
import { type JobLedger, loadLedger } from "./ledger.js";
import { errorName, logLine } from "./log.js";
import { type JobsDeps, runPeriod, type TaskRunner } from "./run.js";

export interface LambdaContext {
  readonly awsRequestId?: string;
}

export type JobsHandler = (event: unknown, context?: LambdaContext) => Promise<void>;

const requestIdOf = (context: LambdaContext | undefined): string => {
  const id = context?.awsRequestId;
  return typeof id === "string" && /^[A-Za-z0-9-]{1,64}$/.test(id) ? id : "none";
};

export const createJobsHandler = (
  deps: JobsDeps,
  runners: Readonly<Partial<Record<JobTask, TaskRunner>>>,
): JobsHandler => {
  return async (event, context) => {
    const requestId = requestIdOf(context);
    const parsed = parseJobEvent(event, deps.config.jobs);
    if (!parsed.ok) {
      deps.log(
        logLine({
          level: "WARN",
          request_id: requestId,
          job: "event",
          code: parsed.code,
          reason: parsed.reason,
        }),
      );
      return;
    }
    const today: CivilDate = madridDateOf(deps.now());
    let loaded: Promise<JobLedger> | undefined;
    const ledger = (): Promise<JobLedger> => {
      loaded ??= loadLedger(deps.objects, today);
      return loaded;
    };
    const read = await ledger();
    const frequencies: JobFrequencies = readJobFrequencies(
      read.ok ? read.settings.job_frequencies : undefined,
    );
    for (const task of parsed.tasks) {
      const runner = runners[task] as TaskRunner;
      const frequency = frequencyOf(task, frequencies.frequencies);
      if (!inWindow(frequency, today)) {
        deps.log(logLine({ level: "INFO", request_id: requestId, job: task, code: "job_not_due" }));
        continue;
      }
      const periods =
        JOB_TASKS[task].delivery === "repeatable"
          ? [periodOf(frequency, today)]
          : [previousPeriod(frequency, today), periodOf(frequency, today)];
      for (const period of periods) {
        const finishing = period !== periodOf(frequency, today);
        try {
          await runPeriod({
            deps,
            requestId,
            task,
            period,
            today,
            ledger,
            frequencies,
            runner,
            ...(finishing ? { onlyUnfinished: true } : {}),
          });
        } catch (error) {
          deps.log(
            logLine({
              level: "ERROR",
              request_id: requestId,
              job: task,
              period,
              code: "job_record_unavailable",
              error_name: errorName(error),
            }),
          );
        }
      }
    }
  };
};
