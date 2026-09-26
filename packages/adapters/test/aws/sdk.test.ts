// The two thin adapters of the AWS SDK against **simulated clients of the
// same calls** (feature 015, E3): no test reaches AWS. Each answer of S3 and
// SSM is built as the SDK builds it (a `ServiceException` with its name and
// its HTTP status), and each translation is the one block 0 verified
// (questions.md §18 and §23.1).

import {
  GetObjectCommand,
  type ListObjectsV2Command,
  PutObjectCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import {
  type GetParameterCommand,
  type GetParametersByPathCommand,
  PutParameterCommand,
  SSMServiceException,
} from "@aws-sdk/client-ssm";
import { describe, expect, it } from "vitest";
import { DependencyUnavailable } from "../../src/aws/errors.js";
import { type S3Sender, SdkObjectStore } from "../../src/aws/sdk-s3.js";
import { SdkParameterStore, type SsmSender } from "../../src/aws/sdk-ssm.js";

const s3Error = (name: string, status: number) =>
  new S3ServiceException({
    name,
    $fault: status >= 500 ? "server" : "client",
    $metadata: { httpStatusCode: status },
    message: `SECRET ${name}`,
  });
const ssmError = (name: string, status: number) =>
  new SSMServiceException({
    name,
    $fault: status >= 500 ? "server" : "client",
    $metadata: { httpStatusCode: status },
    message: `SECRET ${name}`,
  });

/** A simulated S3 client: records every command it is sent and answers from a script. */
const s3Client = (answer: (command: unknown) => unknown) => {
  const sent: unknown[] = [];
  const client: S3Sender = {
    send: async (command) => {
      sent.push(command);
      const result = answer(command);
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
  };
  return { client, sent };
};

const body = (text: string) => ({
  transformToByteArray: async () => new TextEncoder().encode(text),
});

describe("SdkObjectStore", () => {
  it("gets the bytes and the ETag, and reads a missing key as nothing", async () => {
    const { client, sent } = s3Client((command) =>
      (command as GetObjectCommand).input.Key === "there"
        ? { Body: body("hola"), ETag: '"e1"' }
        : s3Error("NoSuchKey", 404),
    );
    const store = new SdkObjectStore(client, "atlas-dev-data");
    const got = await store.get("there");
    expect(new TextDecoder().decode(got?.body)).toBe("hola");
    expect(got?.etag).toBe('"e1"');
    expect(await store.get("missing")).toBeUndefined();
    expect(sent.every((command) => command instanceof GetObjectCommand)).toBe(true);
    expect((sent[0] as GetObjectCommand).input).toEqual({ Bucket: "atlas-dev-data", Key: "there" });
  });

  it("never takes a 403 (no s3:ListBucket) for a missing key (§23.1)", async () => {
    const { client } = s3Client(() => s3Error("AccessDenied", 403));
    await expect(new SdkObjectStore(client, "b").get("k")).rejects.toMatchObject({
      name: "AccessDenied",
    });
  });

  it("creates with If-None-Match: *, and reads a 412 or a 409 as exists", async () => {
    for (const [status, expected] of [
      [undefined, "created"],
      [412, "exists"],
      [409, "exists"],
    ] as const) {
      const { client, sent } = s3Client(() =>
        status === undefined
          ? {}
          : s3Error(status === 412 ? "PreconditionFailed" : "ConditionalRequestConflict", status),
      );
      expect(await new SdkObjectStore(client, "b").putIfNoneMatch("k", new Uint8Array([1]))).toBe(
        expected,
      );
      const command = sent[0] as PutObjectCommand;
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toEqual({
        Bucket: "b",
        Key: "k",
        Body: new Uint8Array([1]),
        IfNoneMatch: "*",
      });
    }
  });

  it("writes with If-Match, and reads a 412, a 409 or a 404 as a failed condition", async () => {
    for (const [status, expected] of [
      [undefined, "written"],
      [412, "precondition_failed"],
      [409, "precondition_failed"],
      [404, "precondition_failed"],
    ] as const) {
      const { client, sent } = s3Client(() => (status === undefined ? {} : s3Error("X", status)));
      expect(
        await new SdkObjectStore(client, "b").putIfMatch("k", new Uint8Array([2]), '"e"'),
      ).toBe(expected);
      expect((sent[0] as PutObjectCommand).input).toEqual({
        Bucket: "b",
        Key: "k",
        Body: new Uint8Array([2]),
        IfMatch: '"e"',
      });
    }
  });

  it("turns a 5xx, a SlowDown and the network into a transient failure, and nothing else", async () => {
    for (const error of [
      s3Error("InternalError", 500),
      s3Error("SlowDown", 503),
      Object.assign(new Error("socket"), { code: "ECONNRESET" }),
      Object.assign(new Error("slow"), { name: "TimeoutError" }),
    ]) {
      const { client } = s3Client(() => error);
      const store = new SdkObjectStore(client, "b");
      for (const call of [
        () => store.get("k"),
        () => store.putIfNoneMatch("k", new Uint8Array()),
        () => store.putIfMatch("k", new Uint8Array(), '"e"'),
        () => store.list("p/"),
      ]) {
        await expect(call()).rejects.toBeInstanceOf(DependencyUnavailable);
      }
    }
    const { client } = s3Client(() => s3Error("InvalidRequest", 400));
    await expect(
      new SdkObjectStore(client, "b").putIfMatch("k", new Uint8Array(), '"e"'),
    ).rejects.toMatchObject({
      name: "InvalidRequest",
    });
  });

  it("never lets the message of the SDK into the failure it throws", async () => {
    const { client } = s3Client(() => s3Error("SlowDown", 503));
    const failure = await new SdkObjectStore(client, "b").get("k").catch((error: Error) => error);
    expect(failure).toBeInstanceOf(DependencyUnavailable);
    expect(String((failure as Error).message)).not.toContain("SECRET");
  });

  it("lists the first level under a prefix, every page, by key", async () => {
    const { client, sent } = s3Client((command) =>
      (command as ListObjectsV2Command).input.ContinuationToken === undefined
        ? {
            Contents: [{ Key: "p/b.csv", ETag: '"2"', Size: 20 }],
            IsTruncated: true,
            NextContinuationToken: "next",
          }
        : { Contents: [{ Key: "p/a.csv", ETag: '"1"', Size: 10 }], IsTruncated: false },
    );
    expect(await new SdkObjectStore(client, "b").list("p/")).toEqual([
      { key: "p/a.csv", etag: '"1"', size: 10 },
      { key: "p/b.csv", etag: '"2"', size: 20 },
    ]);
    expect(sent.map((command) => (command as ListObjectsV2Command).input)).toEqual([
      { Bucket: "b", Prefix: "p/", Delimiter: "/" },
      { Bucket: "b", Prefix: "p/", Delimiter: "/", ContinuationToken: "next" },
    ]);
  });
});

const ssmClient = (answer: (command: unknown) => unknown) => {
  const sent: unknown[] = [];
  const client: SsmSender = {
    send: async (command) => {
      sent.push(command);
      const result = answer(command);
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
  };
  return { client, sent };
};

describe("SdkParameterStore", () => {
  it("gets a parameter decrypted, by its name only, and a missing one as nothing", async () => {
    const { client, sent } = ssmClient((command) =>
      (command as GetParameterCommand).input.Name === "/atlas/dev/a"
        ? { Parameter: { Value: "v" } }
        : ssmError("ParameterNotFound", 400),
    );
    const store = new SdkParameterStore(client);
    expect(await store.get("/atlas/dev/a")).toBe("v");
    expect(await store.get("/atlas/dev/b")).toBeUndefined();
    expect((sent[0] as GetParameterCommand).input).toEqual({
      Name: "/atlas/dev/a",
      WithDecryption: true,
    });
  });

  it("creates without Overwrite and with its tags; an existing one is exists", async () => {
    const { client, sent } = ssmClient(() => ({}));
    const store = new SdkParameterStore(client);
    expect(await store.putNew("/n", "v", { project: "atlas", env: "dev" })).toBe("created");
    const command = sent[0] as PutParameterCommand;
    expect(command).toBeInstanceOf(PutParameterCommand);
    expect(command.input).toEqual({
      Name: "/n",
      Value: "v",
      Type: "SecureString",
      Tags: [
        { Key: "project", Value: "atlas" },
        { Key: "env", Value: "dev" },
      ],
    });
    const taken = ssmClient(() => ssmError("ParameterAlreadyExists", 400));
    expect(await new SdkParameterStore(taken.client).putNew("/n", "v", {})).toBe("exists");
  });

  it("overwrites only with Overwrite and no tags", async () => {
    const { client, sent } = ssmClient(() => ({}));
    await new SdkParameterStore(client).overwrite("/n", "w");
    expect((sent[0] as PutParameterCommand).input).toEqual({
      Name: "/n",
      Value: "w",
      Type: "SecureString",
      Overwrite: true,
    });
  });

  it("turns a throttling, TooManyUpdates, a 5xx and the network into a transient failure", async () => {
    for (const error of [
      ssmError("ThrottlingException", 400),
      ssmError("TooManyUpdates", 429),
      ssmError("InternalServerError", 500),
      Object.assign(new Error("socket"), { code: "ETIMEDOUT" }),
    ]) {
      const store = new SdkParameterStore(ssmClient(() => error).client);
      for (const call of [
        () => store.get("/n"),
        () => store.putNew("/n", "v", {}),
        () => store.overwrite("/n", "v"),
        () => store.listByPath("/p/"),
      ]) {
        await expect(call()).rejects.toBeInstanceOf(DependencyUnavailable);
      }
    }
    const store = new SdkParameterStore(
      ssmClient(() => ssmError("AccessDeniedException", 400)).client,
    );
    await expect(store.get("/n")).rejects.toMatchObject({ name: "AccessDeniedException" });
  });

  it("lists a path, not recursive, decrypted, every page", async () => {
    const { client, sent } = ssmClient((command) =>
      (command as GetParametersByPathCommand).input.NextToken === undefined
        ? { Parameters: [{ Name: "/p/a", Value: "1" }], NextToken: "t" }
        : { Parameters: [{ Name: "/p/b", Value: "2" }] },
    );
    expect(await new SdkParameterStore(client).listByPath("/p/")).toEqual([
      { name: "/p/a", value: "1" },
      { name: "/p/b", value: "2" },
    ]);
    expect(sent.map((command) => (command as GetParametersByPathCommand).input)).toEqual([
      { Path: "/p/", Recursive: false, WithDecryption: true },
      { Path: "/p/", Recursive: false, WithDecryption: true, NextToken: "t" },
    ]);
  });
});
