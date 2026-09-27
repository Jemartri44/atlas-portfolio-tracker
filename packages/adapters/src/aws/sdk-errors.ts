// What an error of the AWS SDK says, read without its message (which may copy
// what it was given, and never reaches a log): its name, its HTTP status and
// whether it is transient. Used only by the two thin adapters `sdk-*.ts`.

import { DependencyUnavailable } from "./errors.js";

export interface SdkErrorFacts {
  readonly name: string;
  readonly status: number | undefined;
}

export const factsOf = (error: unknown): SdkErrorFacts => {
  const value = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const status = value?.$metadata?.httpStatusCode;
  return {
    name: typeof value?.name === "string" ? value.name : "unknown",
    status: typeof status === "number" ? status : undefined,
  };
};

/** Errors of the network or of the client's own timeout: nothing reached AWS, or its answer did not come back. */
const NETWORK = new Set(["TimeoutError", "RequestTimeout", "ECONNRESET", "ETIMEDOUT", "EPIPE"]);

/**
 * A transient failure is a `DependencyUnavailable` (ADR-0034, row 13): a 5xx,
 * a throttling, the network. Everything else is thrown as it came: never
 * taken for «does not exist» nor for «written».
 */
export const transient = (
  dependency: "s3" | "ssm",
  error: unknown,
  /** The names that are a limit of the service, with the reason each one logs. */
  throttles: ReadonlyMap<string, string>,
): DependencyUnavailable | undefined => {
  const { name, status } = factsOf(error);
  const throttled = throttles.get(name);
  if (throttled !== undefined) {
    return new DependencyUnavailable(dependency, throttled);
  }
  if (status !== undefined && status >= 500) {
    return new DependencyUnavailable(dependency, `status_${status}`);
  }
  const code = (error as { code?: unknown })?.code;
  if (NETWORK.has(name) || (typeof code === "string" && NETWORK.has(code))) {
    return new DependencyUnavailable(dependency, "network");
  }
  return undefined;
};
