import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanEnv, pluginCacheDir } from "./env.js";
import type { Plan } from "./plan.js";

export const infraRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const repoRoot = resolve(infraRoot, "..");
export const lockFile = join(infraRoot, "test", "fixtures", ".terraform.lock.hcl");

/** The provider is configured so that nothing can reach AWS (specs/017, research b0.1). */
export const OFFLINE_OVERRIDE = `# Written by the harness into a scratch copy, never into a real root.
# The remote backend of a stack root becomes a local one: nothing reaches S3.
terraform {
  backend "local" {
    path = "render.tfstate"
  }
}

provider "aws" {
  access_key                  = "AKIAFAKEFAKEFAKEFAKE"
  secret_key                  = "fake-fake-fake-fake-fake-fake-fake-fake"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
  allowed_account_ids         = []
}

provider "aws" {
  alias                       = "us_east_1"
  access_key                  = "AKIAFAKEFAKEFAKEFAKE"
  secret_key                  = "fake-fake-fake-fake-fake-fake-fake-fake"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
  allowed_account_ids         = []
}
`;

export interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

/** `terraform` is a hard requirement: without it nothing is verified (P-1). */
export const terraformBinary = (): string => {
  const probe = spawnSync("terraform", ["version"], { env: cleanEnv(), encoding: "utf8" });
  if (probe.status !== 0) {
    throw new Error("terraform is not on the PATH: the infra suite cannot verify anything");
  }
  return "terraform";
};

/** MemAvailable in MB; the heavy steps refuse to start below the threshold. */
export const availableMemoryMb = (): number => {
  const text = readFileSync("/proc/meminfo", "utf8");
  const kb = /MemAvailable:\s+(\d+) kB/.exec(text)?.[1];
  return kb === undefined ? Number.POSITIVE_INFINITY : Math.floor(Number(kb) / 1024);
};

export const assertEnoughMemory = (minimumMb = 1500): void => {
  const available = availableMemoryMb();
  if (available < minimumMb) {
    throw new Error(
      `only ${available} MB available (< ${minimumMb}): the machine is shared, run this again later`,
    );
  }
};

export const terraform = (
  dir: string,
  args: string[],
  options: { network?: boolean; extra?: Record<string, string> } = {},
): Run => {
  mkdirSync(pluginCacheDir, { recursive: true });
  const result = spawnSync(terraformBinary(), [`-chdir=${dir}`, ...args], {
    env: cleanEnv(options),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
};

const SKIPPED = new Set([".terraform", "node_modules"]);

const skipEntry = (path: string): boolean => {
  const name = path.split("/").pop() ?? "";
  return SKIPPED.has(name) || /\.tfstate/.test(name) || /\.tfplan$/.test(name);
};

/** Every file of a tree, relative, sorted: the input of a content hash. */
export const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (skipEntry(path)) {
        return [];
      }
      return entry.isDirectory() ? listFiles(path) : [path];
    })
    .sort();

const hashTree = (dir: string, hash: ReturnType<typeof createHash>): void => {
  for (const file of listFiles(dir)) {
    hash.update(relative(dir, file));
    hash.update(readFileSync(file));
  }
};

/** A copy of `infra/` (without its test suite and without state) in a scratch folder. */
export const scratchCopy = (): string => {
  const dest = mkdtempSync(join(tmpdir(), "atlas-infra-run-"));
  cpSync(infraRoot, dest, {
    recursive: true,
    filter: (source) => !skipEntry(source) && source !== join(infraRoot, "test"),
  });
  return dest;
};

export interface PlanRequest {
  /** The root, relative to `infra/` (`bootstrap/account`) or absolute (a fixture). */
  root: string;
  /** Contents of a `.tfvars` file: the variables of this render. */
  vars: string;
}

const cacheDir = join(tmpdir(), "atlas-infra-plan-cache");

/** Scratch folders already initialised in this process, by root. */
const prepared = new Map<string, { scratch: string; rootDir: string }>();

/** Writes the current files of a root (and of `modules/`) into its scratch folder. */
const refresh = (absolute: string, rootDir: string, fixture: boolean, scratch: string): void => {
  if (fixture) {
    cpSync(absolute, rootDir, { recursive: true, filter: (source) => !skipEntry(source) });
    writeFileSync(join(rootDir, ".terraform.lock.hcl"), readFileSync(lockFile));
  } else {
    cpSync(infraRoot, scratch, {
      recursive: true,
      filter: (source) => !skipEntry(source) && source !== join(infraRoot, "test"),
    });
  }
  writeFileSync(join(rootDir, "zz_offline_override.tf"), OFFLINE_OVERRIDE);
};

/**
 * The rendered `plan` of a root, as `terraform show -json` prints it, with no
 * AWS: the provider gets fake credentials, `-refresh=false`, no state and a
 * dead proxy. The result is cached on disk by the content of everything that
 * can change it, so a mutant of a `.tf` file always renders again.
 */
export const renderPlan = (request: PlanRequest): Plan => {
  const absolute = resolve(infraRoot, request.root);
  const hash = createHash("sha256");
  hash.update(request.vars);
  hash.update(OFFLINE_OVERRIDE);
  const fixture = absolute.startsWith(join(infraRoot, "test"));
  if (fixture) {
    hash.update(readFileSync(lockFile));
    hashTree(absolute, hash);
  } else {
    if (isDirectory(join(infraRoot, "modules"))) {
      hashTree(join(infraRoot, "modules"), hash);
    }
    hashTree(absolute, hash);
  }
  const cached = join(cacheDir, `${hash.digest("hex")}.json`);
  if (existsSync(cached)) {
    return JSON.parse(readFileSync(cached, "utf8")) as Plan;
  }
  assertEnoughMemory();
  // `init` verifies the whole provider against the lock file: 15 seconds. A root is
  // initialised once per process, and later renders (other variables, a mutant of a
  // `.tf` file) only refresh its files in the same scratch folder.
  let entry = prepared.get(absolute);
  if (entry === undefined) {
    const scratch = mkdtempSync(join(tmpdir(), "atlas-infra-run-"));
    entry = { scratch, rootDir: fixture ? scratch : join(scratch, relative(infraRoot, absolute)) };
    refresh(absolute, entry.rootDir, fixture, scratch);
    const init = terraform(
      entry.rootDir,
      ["init", "-input=false", "-no-color", "-lockfile=readonly"],
      { network: true },
    );
    if (init.status !== 0) {
      throw new Error(`terraform init failed in ${request.root}:\n${init.stderr}${init.stdout}`);
    }
    prepared.set(absolute, entry);
  } else {
    refresh(absolute, entry.rootDir, fixture, entry.scratch);
  }
  const rootDir = entry.rootDir;
  writeFileSync(join(rootDir, "render.tfvars"), request.vars);
  const plan = terraform(rootDir, [
    "plan",
    "-refresh=false",
    "-input=false",
    "-no-color",
    "-lock=false",
    "-var-file=render.tfvars",
    "-out=render.tfplan",
  ]);
  if (plan.status !== 0) {
    throw new Error(`terraform plan failed in ${request.root}:\n${plan.stderr}${plan.stdout}`);
  }
  const shown = terraform(rootDir, ["show", "-json", "render.tfplan"]);
  if (shown.status !== 0) {
    throw new Error(`terraform show failed in ${request.root}:\n${shown.stderr}`);
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cached, shown.stdout);
  return JSON.parse(shown.stdout) as Plan;
};

export const isDirectory = (path: string): boolean =>
  existsSync(path) && statSync(path).isDirectory();
