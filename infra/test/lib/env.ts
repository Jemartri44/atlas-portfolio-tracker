import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The variables that could give a test a way into an AWS account. The suite
 * runs with every one of them **unset**, and a guardian fails when any comes
 * set (`specs/017-infrastructure-as-code/spec.md`; prompt 017 §4): not even a
 * user with credentials in their machine can make a test reach AWS.
 */
export const FORBIDDEN_AWS_VARIABLES = [
  "AWS_PROFILE",
  "AWS_DEFAULT_PROFILE",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_SECURITY_TOKEN",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_ROLE_ARN",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN",
] as const;

/** The forbidden variables that are set (an empty value counts as unset). */
export const awsVariablesSet = (env: NodeJS.ProcessEnv): string[] =>
  FORBIDDEN_AWS_VARIABLES.filter((name) => (env[name] ?? "") !== "");

/** Throws, naming the variables (never their values), when any is set. */
export const assertNoAwsCredentials = (env: NodeJS.ProcessEnv): void => {
  const found = awsVariablesSet(env);
  if (found.length > 0) {
    throw new Error(
      `infra tests must never reach AWS: unset ${found.join(", ")} before running them`,
    );
  }
};

let neutralFiles: { config: string; credentials: string } | undefined;

/** Two empty files for `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE`. */
const emptyAwsFiles = (): { config: string; credentials: string } => {
  if (neutralFiles === undefined) {
    const dir = mkdtempSync(join(tmpdir(), "atlas-infra-aws-"));
    const config = join(dir, "config");
    const credentials = join(dir, "credentials");
    writeFileSync(config, "");
    writeFileSync(credentials, "");
    neutralFiles = { config, credentials };
  }
  return neutralFiles;
};

/** The real temporary folder: `TMPDIR` is per run (tests/support/tmp-per-run.ts). */
const cacheRoot = process.env.ATLAS_TEST_CACHE_ROOT ?? tmpdir();

/** Where Terraform keeps the providers it downloads, shared by every run. */
export const pluginCacheDir = join(cacheRoot, "atlas-infra-tf-plugin-cache");

/**
 * The environment of every child process the suite starts. It is **built from
 * nothing** and never copies `process.env`: only `PATH`, a throwaway `HOME`
 * and neutral AWS variables go in, so a credential the user has cannot reach
 * a child. `HTTPS_PROXY` points at a closed port unless `network` is asked
 * (only `init`, which downloads the provider from the HashiCorp registry): a
 * call that escapes fails without any network.
 */
export const cleanEnv = (
  options: { network?: boolean; extra?: Record<string, string> } = {},
): Record<string, string> => {
  assertNoAwsCredentials(process.env);
  const files = emptyAwsFiles();
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: tmpdir(),
    TMPDIR: tmpdir(),
    TF_IN_AUTOMATION: "1",
    TF_INPUT: "0",
    TF_PLUGIN_CACHE_DIR: pluginCacheDir,
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_CONFIG_FILE: files.config,
    AWS_SHARED_CREDENTIALS_FILE: files.credentials,
    AWS_PROFILE: "",
    AWS_ACCESS_KEY_ID: "",
    AWS_SECRET_ACCESS_KEY: "",
    AWS_SESSION_TOKEN: "",
    HTTPS_PROXY: "http://127.0.0.1:9",
    HTTP_PROXY: "http://127.0.0.1:9",
    ...options.extra,
  };
  if (options.network === true) {
    // Only `terraform init` may reach the network: to download the provider
    // from the HashiCorp registry, which is not AWS.
    env.HTTPS_PROXY = "";
    env.HTTP_PROXY = "";
  }
  return env;
};
