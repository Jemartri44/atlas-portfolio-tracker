// The composition of production of the jobs (feature 016, E1): the
// configuration of the function (`ATLAS_*`, `contracts/ssm-and-config.md`),
// the stores of AWS and, **only for the mail family**, the `Notifier` of SES
// (§8.2 B2) — put together once, before any event. It refuses to start —
// nothing runs — with a configuration it does not understand or a task that
// has no runner yet, and says only the **name** of what failed: an error of
// the SDK carries ARNs and account ids in its message (015, §26.1 N2).

import type { ObjectStore, ParameterStore } from "@atlas/adapters/aws";
import { type MailSender, sesNotifier } from "@atlas/adapters/aws-jobs";
import { type Clock, ValidationError } from "@atlas/domain";
import { parseJobsConfig } from "@atlas/domain/jobs";
import { createJobsHandler, type JobsHandler } from "./handler.js";
import { errorName, logLine } from "./log.js";
import { RUNNERS } from "./tasks/index.js";

/** What production plugs in: the SDK stores, the sender of SES, the clock and the log. Simulated in the tests. */
export interface ProductionParts {
  readonly objects: (bucket: string) => ObjectStore;
  readonly parameters: () => ParameterStore;
  /** Called only when the function is the mail's. */
  readonly mail: () => MailSender;
  readonly clock: Clock;
  readonly log: (line: string) => void;
}

export const compose = (
  env: Readonly<Record<string, string | undefined>>,
  parts: ProductionParts,
): JobsHandler => {
  const config = parseJobsConfig(env);
  const missing = config.jobs.find((task) => RUNNERS[task] === undefined);
  if (missing !== undefined) {
    throw new ValidationError("jobs_config_invalid", "ATLAS_JOBS: task_not_available", {
      variable: "ATLAS_JOBS",
      reason: "task_not_available",
    });
  }
  const parameters = parts.parameters();
  return createJobsHandler(
    {
      config,
      objects: parts.objects(config.dataBucket),
      parameters,
      ...(config.mail === undefined
        ? {}
        : {
            notifier: sesNotifier({
              sender: parts.mail(),
              parameters,
              ssmPrefix: config.ssmPrefix,
              from: config.mail.from,
            }),
          }),
      now: () => parts.clock.now(),
      log: parts.log,
    },
    RUNNERS,
  );
};

/** The composition, saying only the name of what failed; the runtime gets an error that says nothing. */
export const composeOrFail = (
  env: Readonly<Record<string, string | undefined>>,
  parts: ProductionParts,
): JobsHandler => {
  try {
    return compose(env, parts);
  } catch (error) {
    parts.log(
      logLine({
        level: "ERROR",
        request_id: "startup",
        job: "startup",
        code: "compose_failed",
        error_name: errorName(error),
        ...(error instanceof ValidationError &&
        typeof (error.details as { reason?: unknown }).reason === "string"
          ? { reason: (error.details as { reason: string }).reason }
          : {}),
      }),
    );
    throw new Error("compose_failed");
  }
};
