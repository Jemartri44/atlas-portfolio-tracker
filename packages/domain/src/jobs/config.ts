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

/**
 * The ceiling of the longest run of a function, **fixed in the code**: the
 * timeout of a Lambda can never be above 900 s (`questions.md` §1.7). A record
 * claimed less than this ago may belong to a run still going on (review of
 * PR #104, idempotence N3), so it is left alone.
 */
export const JOB_MAX_RUN_CEILING_SECONDS = 900;

const COMMON = [
  "ATLAS_ENV",
  "ATLAS_DATA_BUCKET",
  "ATLAS_JOBS",
  "ATLAS_JOB_MAX_RUN_SECONDS",
] as const;

/** The variables of each family, besides the common ones. */
export const JOBS_CONFIG_VARIABLES: Readonly<Record<JobFamily, readonly string[]>> = {
  ecb: [],
  prices: [
    "ATLAS_PRICE_SOURCES",
    "ATLAS_PRICES_EODHD_DAILY_CALLS",
    "ATLAS_PRICES_ALPHA_VANTAGE_DAILY_CALLS",
    "ATLAS_PRICES_FAILURE_THRESHOLD",
  ],
  mail: ["ATLAS_MAIL_FROM", "ATLAS_ORIGIN", "ATLAS_OAUTH_IDLE_WARNING_DAYS"],
  backup: [],
  integrity: [],
};

export interface MailConfig {
  readonly from: string;
  readonly origin: string;
  readonly idleWarningDays: number;
}

/**
 * The download of the cloud (§8.2 M5): **not** a `prices/config.json` of the
 * bucket, which does not exist, but variables of the function that Terraform
 * writes. `simulated` is the fixed source of `dev` (§8.1 P14, §8.2 m3): it
 * replaces the real ones, never mixes with them, and **stops the function in
 * `prod`**.
 */
export interface PricesConfig {
  readonly sources: readonly ("eodhd" | "alpha_vantage")[] | "simulated";
  readonly dailyCalls: { readonly eodhd: number; readonly alpha_vantage: number };
  readonly failureThreshold: number;
}

/** The ceilings of the budgets, **fixed in the code**: the quotas of the free plans (ADR-0031). */
export const PRICE_BUDGET_CEILINGS = { eodhd: 20, alpha_vantage: 25 } as const;

/** The ceiling of the threshold of consecutive failures. */
export const FAILURE_THRESHOLD_CEILING = 30;

export interface JobsConfig {
  readonly env: "dev" | "prod";
  /** `/atlas/<env>/` (ADR-0034, row 3). */
  readonly ssmPrefix: string;
  readonly dataBucket: string;
  readonly family: JobFamily;
  readonly jobs: readonly JobTask[];
  /** The timeout of the Lambda, in milliseconds (`ATLAS_JOB_MAX_RUN_SECONDS`). */
  readonly maxRunMs: number;
  readonly mail?: MailConfig;
  readonly prices?: PricesConfig;
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

const wholeNumber = (
  env: Readonly<Record<string, string | undefined>>,
  variable: string,
  minimum: number,
  ceiling: number,
): number => {
  const text = required(env, variable);
  if (!/^(0|[1-9]\d{0,8})$/.test(text) || Number(text) < minimum) {
    throw invalid(variable, "not_a_whole_number");
  }
  if (Number(text) > ceiling) {
    throw invalid(variable, "above_ceiling");
  }
  return Number(text);
};

const pricesConfig = (
  env: Readonly<Record<string, string | undefined>>,
  environment: "dev" | "prod",
): PricesConfig => {
  const names = required(env, "ATLAS_PRICE_SOURCES").split(",");
  let sources: PricesConfig["sources"];
  if (names.length === 1 && names[0] === "simulated") {
    if (environment === "prod") {
      throw invalid("ATLAS_PRICE_SOURCES", "simulated_in_prod");
    }
    sources = "simulated";
  } else {
    if (!names.every((name) => name === "eodhd" || name === "alpha_vantage")) {
      throw invalid("ATLAS_PRICE_SOURCES", "unknown_source");
    }
    if (new Set(names).size !== names.length) {
      throw invalid("ATLAS_PRICE_SOURCES", "repeated_source");
    }
    sources = names as ("eodhd" | "alpha_vantage")[];
  }
  return {
    sources,
    dailyCalls: {
      eodhd: wholeNumber(env, "ATLAS_PRICES_EODHD_DAILY_CALLS", 0, PRICE_BUDGET_CEILINGS.eodhd),
      alpha_vantage: wholeNumber(
        env,
        "ATLAS_PRICES_ALPHA_VANTAGE_DAILY_CALLS",
        0,
        PRICE_BUDGET_CEILINGS.alpha_vantage,
      ),
    },
    failureThreshold: wholeNumber(
      env,
      "ATLAS_PRICES_FAILURE_THRESHOLD",
      1,
      FAILURE_THRESHOLD_CEILING,
    ),
  };
};

/**
 * The text of a `prices/config.json` made of the configuration of the
 * function, for `parsePriceConfig` to read as always: the order of the
 * sources, their budgets and the threshold. The market days and the recent
 * days asked again by asset type keep their defaults (Q13). The simulated
 * source answers as `eodhd`, the only name the store knows.
 */
export const cloudPriceConfigText = (prices: PricesConfig): string =>
  JSON.stringify({
    source_order: prices.sources === "simulated" ? ["eodhd"] : prices.sources,
    daily_calls:
      prices.sources === "simulated"
        ? { eodhd: prices.dailyCalls.eodhd, alpha_vantage: 0 }
        : prices.dailyCalls,
    failure_threshold: prices.failureThreshold,
  });

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
  const maxRun = required(env, "ATLAS_JOB_MAX_RUN_SECONDS");
  if (!/^[1-9]\d{0,8}$/.test(maxRun)) {
    throw invalid("ATLAS_JOB_MAX_RUN_SECONDS", "not_a_positive_integer");
  }
  if (Number(maxRun) > JOB_MAX_RUN_CEILING_SECONDS) {
    throw invalid("ATLAS_JOB_MAX_RUN_SECONDS", "above_ceiling");
  }
  return {
    env: environment,
    ssmPrefix: `/atlas/${environment}/`,
    dataBucket,
    family,
    jobs,
    maxRunMs: Number(maxRun) * 1000,
    ...(family === "mail" ? { mail: mailConfig(env) } : {}),
    ...(family === "prices" ? { prices: pricesConfig(env, environment) } : {}),
  };
};
