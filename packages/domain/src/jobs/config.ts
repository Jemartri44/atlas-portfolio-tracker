// The configuration of each function of the jobs that is **not a secret**
// (feature 016; `specs/016-scheduled-jobs/contracts/ssm-and-config.md` §2):
// environment variables, read with the rule of the API (`parseApiConfig`). An
// `ATLAS_*` variable nobody knows, one of another family, or a value that is
// not understood **stops the function from starting** (`jobs_config_invalid`).
// No secret ever goes in a variable: the keys of the sources and the recipient
// of the mail are read from SSM, never from here.

import { ValidationError } from "../errors.js";
import { isMailAddress } from "./address.js";
import { isJobTask, JOB_TASKS, type JobFamily, type JobTask } from "./catalog.js";

/**
 * The ceiling of the warning of the unused OAuth client, **fixed in the code**:
 * Google deletes a client after six months without use (ADR-0027, «Riesgo»),
 * so the warning has to come before 180 days whatever the configuration says.
 */
export const OAUTH_IDLE_WARNING_CEILING_DAYS = 179;

const COMMON = ["ATLAS_ENV", "ATLAS_DATA_BUCKET", "ATLAS_JOBS"] as const;

/** The variables of each family, besides the common ones. */
export const JOBS_CONFIG_VARIABLES: Readonly<Record<JobFamily, readonly string[]>> = {
  ecb: [],
  prices: [],
  mail: ["ATLAS_MAIL_FROM", "ATLAS_ORIGIN", "ATLAS_OAUTH_IDLE_WARNING_DAYS"],
  backup: [],
  integrity: [],
};

export interface MailConfig {
  readonly from: string;
  readonly origin: string;
  readonly idleWarningDays: number;
}

export interface JobsConfig {
  readonly env: "dev" | "prod";
  /** `/atlas/<env>/` (ADR-0034, row 3). */
  readonly ssmPrefix: string;
  readonly dataBucket: string;
  readonly family: JobFamily;
  readonly jobs: readonly JobTask[];
  readonly mail?: MailConfig;
}

const invalid = (variable: string, reason: string): ValidationError =>
  new ValidationError("jobs_config_invalid", `${variable}: ${reason}`, { variable, reason });

const required = (env: Readonly<Record<string, string | undefined>>, variable: string): string => {
  const value = env[variable];
  if (value === undefined || value === "") {
    throw invalid(variable, "missing");
  }
  return value;
};

const jobsOf = (text: string): { family: JobFamily; jobs: JobTask[] } => {
  const names = text.split(",");
  if (!names.every(isJobTask)) {
    throw invalid("ATLAS_JOBS", "unknown_task");
  }
  if (new Set(names).size !== names.length) {
    throw invalid("ATLAS_JOBS", "repeated_task");
  }
  const families = new Set(names.map((name) => JOB_TASKS[name].family));
  if (families.size !== 1) {
    throw invalid("ATLAS_JOBS", "mixed_families");
  }
  return { family: [...families][0] as JobFamily, jobs: names };
};

const mailConfig = (env: Readonly<Record<string, string | undefined>>): MailConfig => {
  const from = required(env, "ATLAS_MAIL_FROM");
  if (!isMailAddress(from)) {
    throw invalid("ATLAS_MAIL_FROM", "not_a_mail_address");
  }
  const origin = required(env, "ATLAS_ORIGIN");
  if (!/^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(origin)) {
    throw invalid("ATLAS_ORIGIN", "not_an_https_origin");
  }
  const days = required(env, "ATLAS_OAUTH_IDLE_WARNING_DAYS");
  if (!/^[1-9]\d{0,8}$/.test(days)) {
    throw invalid("ATLAS_OAUTH_IDLE_WARNING_DAYS", "not_a_positive_integer");
  }
  if (Number(days) > OAUTH_IDLE_WARNING_CEILING_DAYS) {
    throw invalid("ATLAS_OAUTH_IDLE_WARNING_DAYS", "above_ceiling");
  }
  return { from, origin, idleWarningDays: Number(days) };
};

export const parseJobsConfig = (env: Readonly<Record<string, string | undefined>>): JobsConfig => {
  const { family, jobs } = jobsOf(required(env, "ATLAS_JOBS"));
  const mine: readonly string[] = [...COMMON, ...JOBS_CONFIG_VARIABLES[family]];
  const everyKnown = Object.values(JOBS_CONFIG_VARIABLES).flat();
  for (const name of Object.keys(env).filter((key) => key.startsWith("ATLAS_"))) {
    if (!mine.includes(name)) {
      throw invalid(name, everyKnown.includes(name) ? "other_family" : "unknown");
    }
  }
  const environment = required(env, "ATLAS_ENV");
  if (environment !== "dev" && environment !== "prod") {
    throw invalid("ATLAS_ENV", "not_dev_or_prod");
  }
  const dataBucket = required(env, "ATLAS_DATA_BUCKET");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(dataBucket)) {
    throw invalid("ATLAS_DATA_BUCKET", "not_a_bucket_name");
  }
  return {
    env: environment,
    ssmPrefix: `/atlas/${environment}/`,
    dataBucket,
    family,
    jobs,
    ...(family === "mail" ? { mail: mailConfig(env) } : {}),
  };
};
