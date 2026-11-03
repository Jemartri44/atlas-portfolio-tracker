// The thin adapter of the narrow `ParameterStore` over `@aws-sdk/client-ssm`. **The only file
// with the SSM client** (architecture test). It sends exactly one command, `GetParameter`, always
// decrypted and **never with a selector** (the name is built by the caller): `ParameterNotFound` →
// nothing; `ThrottlingException`, a 5xx or the network → `DependencyUnavailable`, never a
// credential that passes.

import {
  GetParameterCommand,
  type GetParameterCommandOutput,
  SSMClient,
} from "@aws-sdk/client-ssm";
import type { ParameterStore } from "./parameter-store.js";
import { factsOf, SDK_MAX_ATTEMPTS, SDK_TIMEOUTS, transient } from "./sdk-errors.js";

/** What the adapter sends: the client of the SDK, or a simulated one with the same calls. */
export interface SsmSender {
  send(command: GetParameterCommand): Promise<unknown>;
}

const THROTTLES = new Map([["ThrottlingException", "throttling"]]);

export class SdkParameterStore implements ParameterStore {
  constructor(private readonly client: SsmSender) {}

  async get(name: string): Promise<string | undefined> {
    let output: GetParameterCommandOutput;
    try {
      output = (await this.client.send(
        new GetParameterCommand({ Name: name, WithDecryption: true }),
      )) as GetParameterCommandOutput;
    } catch (error) {
      if (factsOf(error).name === "ParameterNotFound") {
        return undefined;
      }
      throw transient("ssm", error, THROTTLES) ?? error;
    }
    const value = output.Parameter?.Value;
    if (value === undefined) {
      throw new Error("ssm answered a parameter without a value");
    }
    return value;
  }
}

/** The parameters of production, with the default chain of credentials of the Lambda. */
export const productionParameterStore = (): SdkParameterStore =>
  new SdkParameterStore(
    new SSMClient({ requestHandler: SDK_TIMEOUTS, maxAttempts: SDK_MAX_ATTEMPTS }),
  );
