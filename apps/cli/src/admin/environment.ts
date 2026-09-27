// What the orders of administration need from outside the process, replaced
// in tests (feature 015, E5): the clients of the data bucket and of SSM of one
// environment, **with the role of administration** from the standard chain of
// the SDK, and the configuration of `~/.config/atlas/admin.json` that names
// where each environment lives (`data-model.md` §9). No credential is read or
// written here: the chain of the SDK takes them from a session of
// `atlas-<env>-admin` already opened with MFA (`aws sso login`, or `aws
// configure export-credentials`; block 0 of E5), and the console never keeps
// them.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AdminObjectStore, ParameterStore } from "@atlas/adapters/aws";
import { DomainError } from "@atlas/domain";
import { type AdminEnvironment, parseAdminConfig } from "@atlas/domain/admin";

export interface AdminClients {
  readonly objects: AdminObjectStore;
  readonly parameters: ParameterStore;
  /** `/atlas/<env>/`, where the records of the tokens live. */
  readonly ssmPrefix: string;
}

export interface AdminAccess {
  /** The clients of one environment of `admin.json`, or a refusal said as such. */
  clientsFor(environment: string): Promise<AdminClients>;
}

/** `~/.config/atlas/admin.json`, or under `$XDG_CONFIG_HOME/atlas/`. */
export const adminConfigPath = (env: NodeJS.ProcessEnv, home: string): string =>
  join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "atlas", "admin.json");

/** The environment named in `admin.json`, strictly; a missing or unreadable file is said. */
export const environmentOf = async (path: string, name: string): Promise<AdminEnvironment> => {
  const text = await readFile(path, "utf8").catch(() => undefined);
  if (text === undefined) {
    throw new DomainError("admin_config_missing", `there is no ${path}`, { path });
  }
  const config = parseAdminConfig(text);
  if (config === "unreadable") {
    throw new DomainError("admin_config_unreadable", `${path} cannot be read`, { path });
  }
  // Its own key only: never `toString`, `constructor` or `__proto__` of the
  // prototype (review of PR #98, N6).
  const environment = Object.hasOwn(config.environments, name)
    ? config.environments[name]
    : undefined;
  if (environment === undefined) {
    throw new DomainError("admin_environment_unknown", `no environment ${name} in ${path}`, {
      environment: name,
      path,
    });
  }
  return environment;
};

/** The system's: `admin.json` and the SDK with its standard chain, loaded only when asked. */
export const systemAdminAccess = (): AdminAccess => ({
  clientsFor: async (name) => {
    const environment = await environmentOf(adminConfigPath(process.env, homedir()), name);
    const { adminClients } = await import("@atlas/adapters/aws-admin");
    return { ...adminClients(environment), ssmPrefix: environment.ssm_prefix };
  },
});
