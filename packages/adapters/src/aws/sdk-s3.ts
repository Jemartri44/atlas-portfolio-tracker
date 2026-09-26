// The thin adapter of the narrow `ObjectStore` over `@aws-sdk/client-s3`
// (feature 015, E3; authorised by the user, questions.md §12). **The only
// file with the S3 client** (architecture test). It sends exactly four
// commands — `GetObject`, `PutObject` with `If-None-Match: *`, `PutObject`
// with `If-Match` and `ListObjectsV2` — and never a delete.
//
// What each answer means comes from block 0 of E3 (questions.md §23.1):
// - `GetObject` of a key that does not exist is `404 NoSuchKey` → nothing.
//   A `403` (no `s3:ListBucket`) is **not** «does not exist»: it is thrown.
// - `If-None-Match: *`: `412` (it exists) and `409` (a concurrent request)
//   are `exists`.
// - `If-Match`: `412` (another ETag), `409` (concurrent) and `404` (no
//   object) are `precondition_failed`.
// - a 5xx, `SlowDown` or the network are `DependencyUnavailable`: the API
//   answers `503 remote_unavailable`, never a write that did not happen.

import {
  GetObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ListedObject, ObjectStore, StoredObject } from "./object-store.js";
import { factsOf, transient } from "./sdk-errors.js";

/** What the adapter sends: the client of the SDK, or a simulated one with the same calls. */
export interface S3Sender {
  send(command: GetObjectCommand | PutObjectCommand | ListObjectsV2Command): Promise<unknown>;
}

const THROTTLES = new Map([
  ["SlowDown", "throttling"],
  ["ServiceUnavailable", "throttling"],
  ["InternalError", "internal_error"],
]);

const rethrow = (error: unknown): never => {
  throw transient("s3", error, THROTTLES) ?? error;
};

export class SdkObjectStore implements ObjectStore {
  constructor(
    private readonly client: S3Sender,
    private readonly bucket: string,
  ) {}

  async get(key: string): Promise<StoredObject | undefined> {
    let output: { Body?: { transformToByteArray(): Promise<Uint8Array> }; ETag?: string };
    try {
      output = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )) as typeof output;
    } catch (error) {
      const { name, status } = factsOf(error);
      if (name === "NoSuchKey" || status === 404) {
        return undefined;
      }
      return rethrow(error);
    }
    if (output.Body === undefined || output.ETag === undefined) {
      throw new Error("s3 answered an object without a body or an etag");
    }
    return { body: await output.Body.transformToByteArray(), etag: output.ETag };
  }

  async putIfNoneMatch(key: string, body: Uint8Array): Promise<"created" | "exists"> {
    try {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, IfNoneMatch: "*" }),
      );
      return "created";
    } catch (error) {
      const { status } = factsOf(error);
      if (status === 412 || status === 409) {
        return "exists";
      }
      return rethrow(error);
    }
  }

  async putIfMatch(
    key: string,
    body: Uint8Array,
    etag: string,
  ): Promise<"written" | "precondition_failed"> {
    try {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, IfMatch: etag }),
      );
      return "written";
    } catch (error) {
      const { status } = factsOf(error);
      if (status === 412 || status === 409 || status === 404) {
        return "precondition_failed";
      }
      return rethrow(error);
    }
  }

  async list(prefix: string): Promise<readonly ListedObject[]> {
    const listed: ListedObject[] = [];
    let token: string | undefined;
    do {
      let page: ListObjectsV2CommandOutput;
      try {
        page = (await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            Delimiter: "/",
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

/** The store of the data bucket in production, with the default chain of credentials of the Lambda. */
export const productionObjectStore = (bucket: string): SdkObjectStore =>
  new SdkObjectStore(new S3Client({}), bucket);
