// The thin adapter of the narrow `ParameterStore` over `@aws-sdk/client-ssm`
// (feature 015, E3; authorised by the user, questions.md §12). **The only
// file with the SSM client** (architecture test). It sends exactly three
// commands — `GetParameter`, `PutParameter` and `GetParametersByPath` — and
// never `DeleteParameter` nor `LabelParameterVersion` (T26).
//
// What each answer means comes from block 0 of E2 (questions.md §18):
// - `GetParameter`, always decrypted and **never with a selector** (the name
//   is built by the caller from a checked id): `ParameterNotFound` → nothing;
// - `PutParameter` without `Overwrite` and with its tags: `ParameterAlreadyExists`
//   → `exists`; `TooManyUpdates` → a transient failure;
// - `PutParameter` with `Overwrite`: only to revoke; no tags (SSM refuses
//   tags with `Overwrite`);
// - `ThrottlingException`, a 5xx or the network → `DependencyUnavailable`:
//   never a credential that passes.

import {
  GetParameterCommand,
  type GetParameterCommandOutput,
  GetParametersByPathCommand,
  type GetParametersByPathCommandOutput,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import type { ParameterEntry, ParameterStore } from "./parameter-store.js";
import { factsOf, transient } from "./sdk-errors.js";

/** What the adapter sends: the client of the SDK, or a simulated one with the same calls. */
export interface SsmSender {
  send(
    command: GetParameterCommand | PutParameterCommand | GetParametersByPathCommand,
  ): Promise<unknown>;
}

const THROTTLES = new Map([
  ["ThrottlingException", "throttling"],
  ["TooManyUpdates", "too_many_updates"],
]);

const rethrow = (error: unknown): never => {
  throw transient("ssm", error, THROTTLES) ?? error;
};

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
      return rethrow(error);
    }
    const value = output.Parameter?.Value;
    if (value === undefined) {
      throw new Error("ssm answered a parameter without a value");
    }
    return value;
  }

  async putNew(
    name: string,
    value: string,
    tags: Readonly<Record<string, string>>,
  ): Promise<"created" | "exists"> {
    try {
      await this.client.send(
        new PutParameterCommand({
          Name: name,
          Value: value,
          Type: "SecureString",
          Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
        }),
      );
      return "created";
    } catch (error) {
      if (factsOf(error).name === "ParameterAlreadyExists") {
        return "exists";
      }
      return rethrow(error);
    }
  }

  async overwrite(name: string, value: string): Promise<void> {
    try {
      await this.client.send(
        new PutParameterCommand({
          Name: name,
          Value: value,
          Type: "SecureString",
          Overwrite: true,
        }),
      );
    } catch (error) {
      rethrow(error);
    }
  }

  async listByPath(path: string): Promise<readonly ParameterEntry[]> {
    const entries: ParameterEntry[] = [];
    let token: string | undefined;
    do {
      let page: GetParametersByPathCommandOutput;
      try {
        page = (await this.client.send(
          new GetParametersByPathCommand({
            Path: path,
            Recursive: false,
            WithDecryption: true,
            ...(token === undefined ? {} : { NextToken: token }),
          }),
        )) as GetParametersByPathCommandOutput;
      } catch (error) {
        return rethrow(error);
      }
      for (const parameter of page.Parameters ?? []) {
        if (parameter.Name !== undefined && parameter.Value !== undefined) {
          entries.push({ name: parameter.Name, value: parameter.Value });
        }
      }
      token = page.NextToken;
    } while (token !== undefined);
    return entries;
  }
}

/** The parameters of production, with the default chain of credentials of the Lambda. */
export const productionParameterStore = (): SdkParameterStore =>
  new SdkParameterStore(new SSMClient({}));
