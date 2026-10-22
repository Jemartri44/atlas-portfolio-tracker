// The helpers every order of administration shares: the environment named by
// `--env`, the clients of its data bucket and SSM, and what AWS failures say.

import { DependencyUnavailable } from "@atlas/adapters/aws";
import { DomainError } from "@atlas/domain";
import { type Flags, requireFlag, UsageError } from "../args.js";
import type { Context } from "../context.js";
import type { AdminClients } from "./environment.js";

/** The name of an environment, as `admin.json` names it. */
const ENVIRONMENT = /^[a-z][a-z0-9-]*$/;

/** `--env`, required and with the shape of a name: never `toString` nor `__proto__`. */
export const environmentFlag = (flags: Flags): string => {
  const environment = requireFlag(flags, "env");
  if (!ENVIRONMENT.test(environment)) {
    throw new UsageError(`--env no es el nombre de un entorno: «${environment}»`);
  }
  return environment;
};

/** The clients of the environment `--env` names, with the role of administration. */
export const adminClientsOf = async (ctx: Context, flags: Flags): Promise<AdminClients> => {
  const environment = environmentFlag(flags);
  if (ctx.admin !== undefined) {
    return ctx.admin.clientsFor(environment);
  }
  const { systemAdminAccess } = await import("./environment.js");
  return systemAdminAccess().clientsFor(environment);
};

/**
 * What AWS answers, said without the message of the SDK: unavailable (a 5xx,
 * a throttle, the network) or refused (no credentials, access denied, an
 * expired session). Anything else is left as it is.
 */
export const translateAwsFailure = (error: unknown): unknown => {
  if (error instanceof DependencyUnavailable) {
    return new DomainError("admin_remote_unavailable", "aws is not answering", {});
  }
  if (
    error instanceof Error &&
    !(error instanceof DomainError) &&
    ("$metadata" in error || /^(CredentialsProviderError|TokenProviderError)$/.test(error.name))
  ) {
    return new DomainError("admin_aws_refused", "aws refused the order", { name: error.name });
  }
  return error;
};
