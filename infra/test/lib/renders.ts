import type { Plan } from "./plan.js";
import { renderPlan } from "./terraform.js";

/** Evident placeholders: nothing real ever enters a test (family 17). */
export const ACCOUNT = "111122223333";
export const SUFFIX = "abc123def456";
export const ADMIN = `arn:aws:iam::${ACCOUNT}:user/example-admin`;
export const SENDER = "atlas@example.invalid";
export const RECIPIENT = "user@example.invalid";
export const BUDGET_EMAIL = "alerts@example.invalid";
export const REPOSITORY = "Jemartri44/atlas-portfolio-tracker";

export type Value = string | boolean | number | string[];

/** The text of a `.tfvars` file. */
export const tfvars = (values: Record<string, Value>): string =>
  Object.entries(values)
    .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
    .join("\n");

const accountBase: Record<string, Value> = {
  account_id: ACCOUNT,
  bucket_suffix: SUFFIX,
  admin_principal_arn: ADMIN,
  mail_sender: SENDER,
  mail_recipient: RECIPIENT,
  budget_alert_email: BUDGET_EMAIL,
};

const envBase: Record<string, Value> = {
  account_id: ACCOUNT,
  bucket_suffix: SUFFIX,
  admin_principal_arn: ADMIN,
  mail_sender: SENDER,
};

const memo = new Map<string, Plan>();

const render = (root: string, values: Record<string, Value>): Plan => {
  const vars = tfvars(values);
  const key = `${root}\n${vars}`;
  let plan = memo.get(key);
  if (plan === undefined) {
    plan = renderPlan({ root, vars });
    memo.set(key, plan);
  }
  return plan;
};

/** The plan of `bootstrap/account` with the given variables over the defaults. */
export const renderAccount = (over: Record<string, Value> = {}): Plan =>
  render("bootstrap/account", { ...accountBase, ...over });

/** The plan of `bootstrap/env` for one environment. */
export const renderEnv = (env: "dev" | "prod", over: Record<string, Value> = {}): Plan =>
  render("bootstrap/env", { ...envBase, env, ...over });

const stackBase: Record<string, Value> = {
  account_id: ACCOUNT,
  bucket_suffix: SUFFIX,
  domain: "atlas.example.invalid",
  mail_recipient: RECIPIENT,
  edge_mode: "free_plan",
  oac_spa_id: "E2EXAMPLESPA000",
  oac_api_id: "E2EXAMPLEAPI000",
  artifact_key: "builds/0000000000000000000000000000000000000000/lambda.zip",
  artifact_sha256_base64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  mail_sender: SENDER,
  jobs_artifact_key: "builds/0000000000000000000000000000000000000000/jobs.zip",
  jobs_artifact_sha256_base64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

/** The plan of the stack of one environment (`envs/<env>`). */
export const renderStack = (env: "dev" | "prod", over: Record<string, Value> = {}): Plan =>
  render(`envs/${env}`, { ...stackBase, ...over });
