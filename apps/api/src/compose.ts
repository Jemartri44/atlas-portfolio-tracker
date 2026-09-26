// The composition of production (feature 015, E3): the configuration of the
// Lambda (`ATLAS_*`, `docs/api.md` §9), the stores of AWS and Google, put
// together **once, before any request**. It refuses to start — the Lambda
// does not come up, and nothing is served — with a configuration it does not
// understand or a session key that is not 32 bytes: a key of the wrong size
// would otherwise fail on each request, or sign with less than it should.

import { randomBytes } from "node:crypto";
import { Signer } from "@atlas/adapters/access";
import { type ObjectStore, type ParameterStore, parameterNames } from "@atlas/adapters/aws";
import { GoogleIdentity } from "@atlas/adapters/identity";
import { parseApiConfig } from "@atlas/domain/access";
import { createHandler, type Handler } from "./handler.js";

/** What production plugs in: the SDK stores, `fetch` and the log. Simulated in the tests. */
export interface ProductionParts {
  readonly objects: (bucket: string) => ObjectStore;
  readonly parameters: () => ParameterStore;
  readonly fetch: typeof fetch;
  readonly log: (line: string) => void;
}

export const compose = async (
  env: Readonly<Record<string, string | undefined>>,
  parts: ProductionParts,
): Promise<Handler> => {
  const config = parseApiConfig(env);
  const parameters = parts.parameters();
  const key = await parameters.get(parameterNames(config.ssmPrefix).sessionKey);
  if (key === undefined) {
    throw new Error("the session key is not in SSM");
  }
  // Throws SessionKeyInvalid unless it is 32 bytes of base64url.
  Signer.fromSessionKey(key);
  return createHandler({
    config,
    objects: parts.objects(config.dataBucket),
    parameters,
    identity: new GoogleIdentity({ fetch: parts.fetch, now: () => Date.now() }),
    now: () => new Date(),
    random: (bytes) => new Uint8Array(randomBytes(bytes)),
    log: parts.log,
  });
};
