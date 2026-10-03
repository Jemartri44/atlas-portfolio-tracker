// The adapter of the administration (feature 015, E5) against a **simulated
// client of the same calls**, like `sdk.test.ts`: no test reaches AWS. What
// the administration needs and the API must not have — an older version of an
// object, and every object under a prefix at any depth — and still no delete.

import {
  GetObjectCommand,
  type ListObjectsV2Command,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import type {
  AddTagsToResourceCommand,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import { describe, expect, it } from "vitest";
import { DependencyUnavailable } from "../../src/aws/errors.js";
import {
  adminClients,
  SdkAdminObjectStore,
  SdkSecretStore,
  type SecretSender,
} from "../../src/aws/sdk-admin.js";
import type { S3Sender } from "../../src/aws/sdk-s3.js";
import { SdkParameterStore } from "../../src/aws/sdk-ssm.js";

const s3Error = (name: string, status: number) =>
  new S3ServiceException({
    name,
    $fault: status >= 500 ? "server" : "client",
    $metadata: { httpStatusCode: status },
    message: `SECRET ${name}`,
  });

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

describe("SdkAdminObjectStore.getVersion", () => {
  it("gets one version by its id, and reads a missing version or key as nothing", async () => {
    const { client, sent } = s3Client((command) => {
      const input = (command as GetObjectCommand).input;
      if (input.VersionId === "v1") {
        return { Body: body("antes"), ETag: '"e0"' };
      }
      return input.VersionId === "gone" ? s3Error("NoSuchVersion", 404) : s3Error("NoSuchKey", 404);
    });
    const store = new SdkAdminObjectStore(client, "atlas-prod-data");
    const got = await store.getVersion("ledger/ledger.jsonl", "v1");
    expect(new TextDecoder().decode(got?.body)).toBe("antes");
    expect(got?.etag).toBe('"e0"');
    expect(await store.getVersion("ledger/ledger.jsonl", "gone")).toBeUndefined();
    expect(await store.getVersion("missing", "v9")).toBeUndefined();
    expect(sent.every((command) => command instanceof GetObjectCommand)).toBe(true);
    expect((sent[0] as GetObjectCommand).input).toEqual({
      Bucket: "atlas-prod-data",
      Key: "ledger/ledger.jsonl",
      VersionId: "v1",
    });
  });

  it("reads a bare 404 as nothing, and never a 403", async () => {
    const bare = s3Client(() => s3Error("NotFound", 404));
    expect(await new SdkAdminObjectStore(bare.client, "b").getVersion("k", "v")).toBeUndefined();
    const denied = s3Client(() => s3Error("AccessDenied", 403));
    await expect(
      new SdkAdminObjectStore(denied.client, "b").getVersion("k", "v"),
    ).rejects.toMatchObject({
      name: "AccessDenied",
    });
  });

  it("turns a SlowDown into a transient failure, and refuses an answer with no body", async () => {
    const slow = s3Client(() => s3Error("SlowDown", 503));
    await expect(
      new SdkAdminObjectStore(slow.client, "b").getVersion("k", "v"),
    ).rejects.toBeInstanceOf(DependencyUnavailable);
    const empty = s3Client(() => ({ ETag: '"e"' }));
    await expect(new SdkAdminObjectStore(empty.client, "b").getVersion("k", "v")).rejects.toThrow(
      "without a body or an etag",
    );
    const noEtag = s3Client(() => ({ Body: body("x") }));
    await expect(new SdkAdminObjectStore(noEtag.client, "b").getVersion("k", "v")).rejects.toThrow(
      "without a body or an etag",
    );
  });
});

describe("SdkAdminObjectStore.listAll", () => {
  it("lists every object under a prefix at any depth, every page, by key, with no delimiter", async () => {
    const { client, sent } = s3Client((command) =>
      (command as ListObjectsV2Command).input.ContinuationToken === undefined
        ? {
            Contents: [
              { Key: "documents/E2/b.pdf", ETag: '"2"', Size: 20 },
              { Key: "documents/E1/incomplete.pdf", ETag: '"3"' },
            ],
            IsTruncated: true,
            NextContinuationToken: "next",
          }
        : { Contents: [{ Key: "documents/E1/a.pdf", ETag: '"1"', Size: 10 }], IsTruncated: false },
    );
    expect(await new SdkAdminObjectStore(client, "b").listAll("documents/")).toEqual([
      { key: "documents/E1/a.pdf", etag: '"1"', size: 10 },
      { key: "documents/E2/b.pdf", etag: '"2"', size: 20 },
    ]);
    expect(sent.map((command) => (command as ListObjectsV2Command).input)).toEqual([
      { Bucket: "b", Prefix: "documents/" },
      { Bucket: "b", Prefix: "documents/", ContinuationToken: "next" },
    ]);
  });

  it("lists nothing under an empty prefix, and turns a 5xx into a transient failure", async () => {
    const none = s3Client(() => ({ IsTruncated: false }));
    expect(await new SdkAdminObjectStore(none.client, "b").listAll("imports/")).toEqual([]);
    const failing = s3Client(() => s3Error("InternalError", 500));
    await expect(
      new SdkAdminObjectStore(failing.client, "b").listAll("imports/"),
    ).rejects.toBeInstanceOf(DependencyUnavailable);
  });

  it("keeps the narrow operations of the store it extends", async () => {
    const { client } = s3Client(() => ({ Body: body("hoy"), ETag: '"e"' }));
    const got = await new SdkAdminObjectStore(client, "b").get("k");
    expect(new TextDecoder().decode(got?.body)).toBe("hoy");
  });
});

describe("adminClients", () => {
  it("builds the clients of one environment with no credential of its own", () => {
    const clients = adminClients({ region: "eu-west-1", data_bucket: "atlas-prod-data" });
    expect(clients.objects).toBeInstanceOf(SdkAdminObjectStore);
    expect(clients.parameters).toBeInstanceOf(SdkParameterStore);
  });
});

describe("SdkSecretStore (feature 017, E4)", () => {
  const ssmFailure = (name: string, status: number) =>
    Object.assign(new Error(`SECRET-VALUE ${name}`), {
      name,
      $metadata: { httpStatusCode: status },
    });
  const ssm = (answer: (command: unknown) => unknown) => {
    const sent: unknown[] = [];
    const client: SecretSender = {
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
  const TAGS = { project: "atlas", env: "prod", managed_by: "atlas-admin-secrets" };

  it("asks whether a parameter exists WITHOUT decrypting it, and reads not found as no", async () => {
    const found = ssm(() => ({ Parameter: { Name: "n", Value: "CIPHERTEXT" } }));
    expect(await new SdkSecretStore(found.client).exists("/atlas/prod/auth/session-key")).toBe(
      true,
    );
    expect((found.sent[0] as GetParameterCommand).input).toEqual({
      Name: "/atlas/prod/auth/session-key",
      WithDecryption: false,
    });
    const missing = ssm(() => ssmFailure("ParameterNotFound", 400));
    expect(await new SdkSecretStore(missing.client).exists("n")).toBe(false);
  });

  it("never reads a refusal or a failure as an answer: it throws, and a 5xx is transient", async () => {
    const denied = ssm(() => ssmFailure("AccessDeniedException", 400));
    await expect(new SdkSecretStore(denied.client).exists("n")).rejects.toMatchObject({
      name: "AccessDeniedException",
    });
    const down = ssm(() => ssmFailure("InternalServerError", 500));
    await expect(new SdkSecretStore(down.client).exists("n")).rejects.toBeInstanceOf(
      DependencyUnavailable,
    );
  });

  it("creates with its kind and its tags and no Overwrite, and says when the name is taken", async () => {
    const created = ssm(() => ({}));
    expect(await new SdkSecretStore(created.client).create("n", "v", "SecureString", TAGS)).toBe(
      "created",
    );
    expect((created.sent[0] as PutParameterCommand).input).toEqual({
      Name: "n",
      Value: "v",
      Type: "SecureString",
      Tags: [
        { Key: "project", Value: "atlas" },
        { Key: "env", Value: "prod" },
        { Key: "managed_by", Value: "atlas-admin-secrets" },
      ],
    });
    const taken = ssm(() => ssmFailure("ParameterAlreadyExists", 400));
    expect(await new SdkSecretStore(taken.client).create("n", "v", "String", TAGS)).toBe("exists");
    const slow = ssm(() => ssmFailure("TooManyUpdates", 429));
    await expect(
      new SdkSecretStore(slow.client).create("n", "v", "String", TAGS),
    ).rejects.toBeInstanceOf(DependencyUnavailable);
  });

  it("rotates with Overwrite and no tags in that call, and tags the parameter after it", async () => {
    const { client, sent } = ssm(() => ({}));
    await new SdkSecretStore(client).rotate("n", "v", "SecureString", TAGS);
    expect(sent).toHaveLength(2);
    expect((sent[0] as PutParameterCommand).input).toEqual({
      Name: "n",
      Value: "v",
      Type: "SecureString",
      Overwrite: true,
    });
    expect((sent[1] as AddTagsToResourceCommand).input).toEqual({
      ResourceType: "Parameter",
      ResourceId: "n",
      Tags: [
        { Key: "project", Value: "atlas" },
        { Key: "env", Value: "prod" },
        { Key: "managed_by", Value: "atlas-admin-secrets" },
      ],
    });
  });

  it("says rotated-but-not-tagged when only the tagging fails, never copying what AWS said", async () => {
    let calls = 0;
    const { client } = ssm(() => (++calls === 2 ? ssmFailure("AccessDeniedException", 400) : {}));
    await expect(
      new SdkSecretStore(client).rotate("n", "v", "SecureString", TAGS),
    ).rejects.toMatchObject({
      name: "SecretTagsFailed",
      parameter: "n",
      message: "the value was rotated but the tags were not written",
    });
  });

  it("does not tag a parameter whose rotation failed, and throws the failure as it came", async () => {
    const { client, sent } = ssm(() => ssmFailure("ThrottlingException", 400));
    await expect(
      new SdkSecretStore(client).rotate("n", "v", "SecureString", TAGS),
    ).rejects.toBeInstanceOf(DependencyUnavailable);
    expect(sent).toHaveLength(1);
  });

  it("is part of the clients of one environment", () => {
    const clients = adminClients({ region: "eu-west-1", data_bucket: "atlas-prod-data" });
    expect(clients.secrets).toBeInstanceOf(SdkSecretStore);
  });
});
