// The configuration of the Lambda that is **not a secret** (`docs/api.md` §9):
// environment variables, read strictly. **No secret ever goes in an
// environment variable** (`docs/specification.md` §11.8): an unknown `ATLAS_*`
// variable — a key, a secret — stops the Lambda from starting instead of being
// read or ignored.

import { ValidationError } from "../errors.js";

/**
 * The ceiling of a console token's life, **fixed in the code** (ADR-0033,
 * point 7): a safety cap, not a setting. The configured lifetime can never go
 * above it, and changing the configuration never lengthens an issued token.
 */
export const TOKEN_CEILING_DAYS = 120;

export interface ApiConfig {
  readonly env: "dev" | "prod";
  /** `/atlas/<env>/`, where every parameter of this environment lives (ADR-0034, row 3). */
  readonly ssmPrefix: string;
  /** Our own origin: what `Origin` is compared against and where a sign-in returns. */
  readonly origin: string;
  readonly dataBucket: string;
  readonly sessionTtlSeconds: number;
  readonly loginTtlSeconds: number;
  readonly consoleCodeTtlSeconds: number;
  readonly tokenLifetimeDays: number;
  readonly recentIssueDays: number;
  readonly clockToleranceSeconds: number;
  readonly allowListCacheSeconds: number;
  readonly secretsCacheSeconds: number;
}

const NUMBERS = {
  ATLAS_SESSION_TTL_SECONDS: "sessionTtlSeconds",
  ATLAS_LOGIN_TTL_SECONDS: "loginTtlSeconds",
  ATLAS_CONSOLE_CODE_TTL_SECONDS: "consoleCodeTtlSeconds",
  ATLAS_TOKEN_LIFETIME_DAYS: "tokenLifetimeDays",
  ATLAS_RECENT_ISSUE_DAYS: "recentIssueDays",
  ATLAS_CLOCK_TOLERANCE_SECONDS: "clockToleranceSeconds",
  ATLAS_ALLOW_LIST_CACHE_SECONDS: "allowListCacheSeconds",
  ATLAS_SECRETS_CACHE_SECONDS: "secretsCacheSeconds",
} as const;

export const API_CONFIG_VARIABLES = [
  "ATLAS_ENV",
  "ATLAS_ORIGIN",
  "ATLAS_DATA_BUCKET",
  ...Object.keys(NUMBERS),
] as readonly string[];

const invalid = (variable: string, reason: string): ValidationError =>
  new ValidationError("api_config_invalid", `${variable}: ${reason}`, { variable, reason });

const required = (env: Readonly<Record<string, string | undefined>>, variable: string): string => {
  const value = env[variable];
  if (value === undefined || value === "") {
    throw invalid(variable, "missing");
  }
  return value;
};

export const parseApiConfig = (env: Readonly<Record<string, string | undefined>>): ApiConfig => {
  const unknown = Object.keys(env).find(
    (name) => name.startsWith("ATLAS_") && !API_CONFIG_VARIABLES.includes(name),
  );
  if (unknown !== undefined) {
    throw invalid(unknown, "unknown");
  }
  const environment = required(env, "ATLAS_ENV");
  if (environment !== "dev" && environment !== "prod") {
    throw invalid("ATLAS_ENV", "not_dev_or_prod");
  }
  const origin = required(env, "ATLAS_ORIGIN");
  if (!/^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(origin)) {
    throw invalid("ATLAS_ORIGIN", "not_an_https_origin");
  }
  const dataBucket = required(env, "ATLAS_DATA_BUCKET");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(dataBucket)) {
    throw invalid("ATLAS_DATA_BUCKET", "not_a_bucket_name");
  }
  const number = (variable: keyof typeof NUMBERS): number => {
    const text = required(env, variable);
    if (!/^[1-9]\d{0,8}$/.test(text)) {
      throw invalid(variable, "not_a_positive_integer");
    }
    return Number(text);
  };
  const tokenLifetimeDays = number("ATLAS_TOKEN_LIFETIME_DAYS");
  if (tokenLifetimeDays > TOKEN_CEILING_DAYS) {
    throw invalid("ATLAS_TOKEN_LIFETIME_DAYS", "above_ceiling");
  }
  return {
    env: environment,
    ssmPrefix: `/atlas/${environment}/`,
    origin,
    dataBucket,
    sessionTtlSeconds: number("ATLAS_SESSION_TTL_SECONDS"),
    loginTtlSeconds: number("ATLAS_LOGIN_TTL_SECONDS"),
    consoleCodeTtlSeconds: number("ATLAS_CONSOLE_CODE_TTL_SECONDS"),
    tokenLifetimeDays,
    recentIssueDays: number("ATLAS_RECENT_ISSUE_DAYS"),
    clockToleranceSeconds: number("ATLAS_CLOCK_TOLERANCE_SECONDS"),
    allowListCacheSeconds: number("ATLAS_ALLOW_LIST_CACHE_SECONDS"),
    secretsCacheSeconds: number("ATLAS_SECRETS_CACHE_SECONDS"),
  };
};
