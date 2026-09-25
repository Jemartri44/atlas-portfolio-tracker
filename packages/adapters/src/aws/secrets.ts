// The parameters of SSM the API reads (`docs/api.md` §9), each with its cache
// in the instance: the allow list for a few minutes (ADR-0027, amendment),
// the client of Google and the session key for longer (rotating the key
// closes every session once that cache expires). A missing or unreadable
// parameter is a failure of the dependency — nobody passes — and is never
// cached: the next request asks again.

import { type AllowEntry, parseAllowList } from "@atlas/domain/access";
import { DependencyUnavailable } from "./errors.js";
import type { ParameterStore } from "./parameter-store.js";

export interface SecretsOptions {
  readonly ssmPrefix: string;
  readonly allowListCacheSeconds: number;
  readonly secretsCacheSeconds: number;
}

export const parameterNames = (prefix: string) =>
  ({
    allowList: `${prefix}auth/allow-list`,
    clientId: `${prefix}auth/google-client-id`,
    clientSecret: `${prefix}auth/google-client-secret`,
    sessionKey: `${prefix}auth/session-key`,
  }) as const;

export class AccessSecrets {
  private readonly cache = new Map<string, { value: unknown; until: number }>();
  private readonly names: ReturnType<typeof parameterNames>;

  constructor(
    private readonly parameters: ParameterStore,
    private readonly now: () => Date,
    private readonly options: SecretsOptions,
  ) {
    this.names = parameterNames(options.ssmPrefix);
  }

  private async cached<T>(name: string, seconds: number, read: (text: string) => T): Promise<T> {
    const at = this.now().getTime();
    const hit = this.cache.get(name);
    if (hit !== undefined && hit.until > at) {
      return hit.value as T;
    }
    const text = await this.parameters.get(name);
    if (text === undefined) {
      throw new DependencyUnavailable("ssm", "parameter_missing");
    }
    let value: T;
    try {
      value = read(text);
    } catch {
      throw new DependencyUnavailable("ssm", "parameter_unreadable");
    }
    this.cache.set(name, { value, until: at + seconds * 1000 });
    return value;
  }

  allowList(): Promise<readonly AllowEntry[]> {
    return this.cached(this.names.allowList, this.options.allowListCacheSeconds, parseAllowList);
  }

  clientId(): Promise<string> {
    return this.cached(this.names.clientId, this.options.secretsCacheSeconds, (text) => text);
  }

  clientSecret(): Promise<string> {
    return this.cached(this.names.clientSecret, this.options.secretsCacheSeconds, (text) => text);
  }

  sessionKey(): Promise<string> {
    return this.cached(this.names.sessionKey, this.options.secretsCacheSeconds, (text) => text);
  }
}
