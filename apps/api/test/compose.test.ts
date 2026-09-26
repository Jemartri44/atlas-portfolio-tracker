// Feature 015, E3: the composition of production (`apps/api/src/compose.ts`),
// with simulated stores instead of the SDK: it reads the configuration and the
// session key **before** it hands out a handler, and refuses to start with a
// configuration it does not understand or a key that is not 32 bytes.

import { base64url } from "@atlas/adapters/access";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeS3 } from "../../../packages/adapters/test/aws/test-only-fake-s3.js";
import { TestOnlyFakeSsm } from "../../../packages/adapters/test/aws/test-only-fake-ssm.js";
import { compose } from "../src/compose.js";
import { NAMES, SESSION_KEY } from "./harness.js";

const ENV = {
  ATLAS_ENV: "dev",
  ATLAS_ORIGIN: "https://atlas.example",
  ATLAS_DATA_BUCKET: "atlas-dev-data",
  ATLAS_SESSION_TTL_SECONDS: "28800",
  ATLAS_LOGIN_TTL_SECONDS: "600",
  ATLAS_CONSOLE_CODE_TTL_SECONDS: "300",
  ATLAS_TOKEN_LIFETIME_DAYS: "90",
  ATLAS_RECENT_ISSUE_DAYS: "7",
  ATLAS_CLOCK_TOLERANCE_SECONDS: "600",
  ATLAS_ALLOW_LIST_CACHE_SECONDS: "120",
  ATLAS_SECRETS_CACHE_SECONDS: "300",
  // The runtime of Lambda sets its own variables: they are not ours to judge.
  AWS_REGION: "eu-west-1",
};

const parts = (key: string | undefined) => {
  const ssm = new TestOnlyFakeSsm();
  if (key !== undefined) {
    ssm.set(NAMES.sessionKey, key);
  }
  const buckets: string[] = [];
  return {
    ssm,
    buckets,
    make: {
      objects: (bucket: string) => {
        buckets.push(bucket);
        return new TestOnlyFakeS3();
      },
      parameters: () => ssm,
      fetch: (() => {
        throw new Error("no network in a test");
      }) as unknown as typeof fetch,
      log: () => undefined,
    },
  };
};

describe("compose (the Lambda of production)", () => {
  it("reads the key before handing out a handler, over the bucket of the configuration", async () => {
    const { ssm, buckets, make } = parts(SESSION_KEY);
    const handler = await compose(ENV, make);
    expect(typeof handler).toBe("function");
    expect(ssm.reads).toContain(NAMES.sessionKey);
    expect(buckets).toEqual(["atlas-dev-data"]);
    const answer = await handler({
      rawPath: "/api/nothing",
      requestContext: { requestId: "r", http: { method: "GET" } },
    });
    expect(answer.statusCode).toBe(404);
  });

  it("does not start with a session key that is not 32 bytes, or with none", async () => {
    for (const key of [
      base64url(Buffer.alloc(31, 1)),
      base64url(Buffer.alloc(33, 1)),
      "not base64!",
      undefined,
    ]) {
      await expect(compose(ENV, parts(key).make), String(key)).rejects.toThrow();
    }
  });

  it("does not start with a configuration it does not understand", async () => {
    for (const env of [
      { ...ENV, ATLAS_ENV: "staging" },
      { ...ENV, ATLAS_SOMETHING: "1" },
      { ...ENV, ATLAS_TOKEN_LIFETIME_DAYS: "121" },
    ]) {
      await expect(compose(env, parts(SESSION_KEY).make)).rejects.toThrow();
    }
  });
});
