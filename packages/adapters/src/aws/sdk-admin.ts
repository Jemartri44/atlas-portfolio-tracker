// The clients of the administration (feature 015, E5; ADR-0026, Part A;
// ADR-0034, rows 6 and 16), the door `@atlas/adapters/aws-admin`: the data
// bucket and SSM **with the role of administration**, whose short-lived
// credentials come from the **standard chain of the SDK**: a session already
// opened — an IAM Identity Center profile after `aws sso login`, or the
// variables `aws configure export-credentials` writes once the AWS CLI asked
// for the MFA code. A profile with `mfa_serial` alone is refused by the chain,
// which has no way to ask for the code (block 0 of E5, `questions.md` §33).
// The console never stores them. Node only; never
// reached by the API nor by the web (architecture tests).
//
// What the administration needs and the API must not have: an old version of
// an object (restore from `s3-version:<id>`) and every object under a prefix,
// at any depth (`documents/<event_id>/<file>`, for `atlas backup`). Still no
// delete, never.

import {
  GetObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  AddTagsToResourceCommand,
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import type { AdminObjectStore, ListedObject, StoredObject } from "./object-store.js";
import { factsOf, transient } from "./sdk-errors.js";
import { rethrow, type S3Sender, SdkObjectStore } from "./sdk-s3.js";
import { SdkParameterStore } from "./sdk-ssm.js";
import type { SecretKind, SecretStore } from "./secret-store.js";

export class SdkAdminObjectStore extends SdkObjectStore implements AdminObjectStore {
  constructor(
    private readonly sender: S3Sender,
    private readonly name: string,
  ) {
    super(sender, name);
  }

  async getVersion(key: string, versionId: string): Promise<StoredObject | undefined> {
    let output: { Body?: { transformToByteArray(): Promise<Uint8Array> }; ETag?: string };
    try {
      output = (await this.sender.send(
        new GetObjectCommand({ Bucket: this.name, Key: key, VersionId: versionId }),
      )) as typeof output;
    } catch (error) {
      const { name, status } = factsOf(error);
      if (name === "NoSuchKey" || name === "NoSuchVersion" || status === 404) {
        return undefined;
      }
      return rethrow(error);
    }
    if (output.Body === undefined || output.ETag === undefined) {
      throw new Error("s3 answered a version without a body or an etag");
    }
    return { body: await output.Body.transformToByteArray(), etag: output.ETag };
  }

  async listAll(prefix: string): Promise<readonly ListedObject[]> {
    const listed: ListedObject[] = [];
    let token: string | undefined;
    do {
      let page: ListObjectsV2CommandOutput;
      try {
        page = (await this.sender.send(
          new ListObjectsV2Command({
            Bucket: this.name,
            Prefix: prefix,
            ...(token === undefined ? {} : { ContinuationToken: token }),
          }),
        )) as ListObjectsV2CommandOutput;
      } catch (error) {
        return rethrow(error);
      }
      for (const object of page.Contents ?? []) {
        if (object.Key !== undefined && object.ETag !== undefined && object.Size !== undefined) {
          listed.push({ key: object.Key, etag: object.ETag, size: object.Size });
        }
      }
      token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
    } while (token !== undefined);
    return listed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
}

/** What `SdkSecretStore` sends: the client of the SDK, or a simulated one with the same calls. */
export interface SecretSender {
  send(
    command: GetParameterCommand | PutParameterCommand | AddTagsToResourceCommand,
  ): Promise<unknown>;
}

const SECRET_THROTTLES = new Map([
  ["ThrottlingException", "throttling"],
  ["TooManyUpdates", "too_many_updates"],
]);

const rethrowSecret = (error: unknown): never => {
  throw transient("ssm", error, SECRET_THROTTLES) ?? error;
};

const tagList = (tags: Readonly<Record<string, string>>) =>
  Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));

/**
 * The parameters the secrets order writes (feature 017, E4). Three commands and
 * no more: `GetParameter` **never decrypting**, `PutParameter` and
 * `AddTagsToResource`. No delete and no label, never.
 */
export class SdkSecretStore implements SecretStore {
  constructor(private readonly client: SecretSender) {}

  async exists(name: string): Promise<boolean> {
    try {
      await this.client.send(new GetParameterCommand({ Name: name, WithDecryption: false }));
      return true;
    } catch (error) {
      if (factsOf(error).name === "ParameterNotFound") {
        return false;
      }
      return rethrowSecret(error);
    }
  }

  async create(
    name: string,
    value: string,
    kind: SecretKind,
    tags: Readonly<Record<string, string>>,
  ): Promise<"created" | "exists"> {
    try {
      await this.client.send(
        new PutParameterCommand({ Name: name, Value: value, Type: kind, Tags: tagList(tags) }),
      );
      return "created";
    } catch (error) {
      if (factsOf(error).name === "ParameterAlreadyExists") {
        return "exists";
      }
      return rethrowSecret(error);
    }
  }

  async rotate(
    name: string,
    value: string,
    kind: SecretKind,
    tags: Readonly<Record<string, string>>,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutParameterCommand({ Name: name, Value: value, Type: kind, Overwrite: true }),
      );
      await this.client.send(
        new AddTagsToResourceCommand({
          ResourceType: "Parameter",
          ResourceId: name,
          Tags: tagList(tags),
        }),
      );
    } catch (error) {
      rethrowSecret(error);
    }
  }
}

/**
 * The clients of one environment, with the standard chain of credentials: no
 * credential is passed here, and none is read or written by the console.
 */
export const adminClients = (environment: {
  readonly region: string;
  readonly data_bucket: string;
}) => ({
  objects: new SdkAdminObjectStore(
    new S3Client({ region: environment.region }),
    environment.data_bucket,
  ),
  parameters: new SdkParameterStore(new SSMClient({ region: environment.region })),
  secrets: new SdkSecretStore(new SSMClient({ region: environment.region })),
});
