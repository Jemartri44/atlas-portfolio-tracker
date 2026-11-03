// The mark that closes every session, over S3, and the secrets of SSM with their cache.

import { SESSIONS_VALID_FROM_KEY } from "@atlas/access";
import {
  AccessSecrets,
  closeSessionsBefore,
  DependencyUnavailable,
  parameterNames,
  readSessionsValidFrom,
} from "@atlas/adapters/aws";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeS3 } from "./test-only-fake-s3.js";
import { TestOnlyFakeSsm } from "./test-only-fake-ssm.js";

describe("the mark of logout-all", () => {
  it("is written once, moves only forward, and reads back", async () => {
    const s3 = new TestOnlyFakeS3();
    expect(await readSessionsValidFrom(s3)).toBeUndefined();
    await closeSessionsBefore(s3, 1_000);
    expect(await readSessionsValidFrom(s3)).toBe(1_000);
    await closeSessionsBefore(s3, 900);
    expect(await readSessionsValidFrom(s3)).toBe(1_000);
    await closeSessionsBefore(s3, 1_100);
    expect(await readSessionsValidFrom(s3)).toBe(1_100);
    expect(s3.keys()).toEqual([SESSIONS_VALID_FROM_KEY]);
  });

  it("replaces an unreadable mark, and tries again when another write wins", async () => {
    const s3 = new TestOnlyFakeS3();
    s3.seed(SESSIONS_VALID_FROM_KEY, "{ not json");
    expect(await readSessionsValidFrom(s3)).toBe("unreadable");
    s3.conflictNext();
    await closeSessionsBefore(s3, 1_000);
    expect(await readSessionsValidFrom(s3)).toBe(1_000);
  });

  it("fails rather than leave the sessions open, and lets a failure of S3 through", async () => {
    const s3 = new TestOnlyFakeS3();
    s3.beforePut = () => s3.conflictNext();
    await expect(closeSessionsBefore(s3, 1_000)).rejects.toThrow("sessions mark contention");
    s3.beforePut = undefined;
    s3.failNext();
    await expect(readSessionsValidFrom(s3)).rejects.toBeInstanceOf(DependencyUnavailable);
  });
});

describe("AccessSecrets", () => {
  const names = parameterNames("/atlas/dev/");
  const setup = () => {
    const ssm = new TestOnlyFakeSsm();
    ssm.set(
      names.allowList,
      JSON.stringify({ allow_list_format: 1, entries: [{ sub: "1", email: "a@example.test" }] }),
    );
    ssm.set(names.clientId, "client-dev");
    ssm.set(names.clientSecret, "secret-dev");
    ssm.set(names.sessionKey, "key-dev");
    let now = 0;
    const secrets = new AccessSecrets(ssm, () => new Date(now), {
      ssmPrefix: "/atlas/dev/",
      allowListCacheSeconds: 120,
      secretsCacheSeconds: 300,
    });
    return {
      ssm,
      secrets,
      at: (ms: number) => {
        now = ms;
      },
    };
  };

  it("names the parameters under the prefix of the environment", () => {
    expect(names).toEqual({
      allowList: "/atlas/dev/auth/allow-list",
      clientId: "/atlas/dev/auth/google-client-id",
      clientSecret: "/atlas/dev/auth/google-client-secret",
      sessionKey: "/atlas/dev/auth/session-key",
    });
  });

  it("re-reads the allow list once its cache expires, and never later (R18)", async () => {
    const { ssm, secrets, at } = setup();
    expect(await secrets.allowList()).toEqual([{ sub: "1", email: "a@example.test" }]);
    ssm.set(names.allowList, JSON.stringify({ allow_list_format: 1, entries: [] }));
    at(119_999);
    expect(await secrets.allowList()).toHaveLength(1);
    at(120_000);
    expect(await secrets.allowList()).toEqual([]);
    expect(ssm.reads.filter((name) => name === names.allowList)).toHaveLength(2);
  });

  it("caches the client and the key for their own time", async () => {
    const { ssm, secrets, at } = setup();
    expect([
      await secrets.clientId(),
      await secrets.clientSecret(),
      await secrets.sessionKey(),
    ]).toEqual(["client-dev", "secret-dev", "key-dev"]);
    ssm.set(names.sessionKey, "rotated");
    at(299_999);
    expect(await secrets.sessionKey()).toBe("key-dev");
    at(300_000);
    expect(await secrets.sessionKey()).toBe("rotated");
  });

  it("fails as a dependency — never as an empty list — and caches no failure (R31)", async () => {
    const { ssm, secrets } = setup();
    ssm.throttleNext();
    await expect(secrets.allowList()).rejects.toMatchObject({
      dependency: "ssm",
      reason: "throttling",
    });
    expect(await secrets.allowList()).toHaveLength(1);
    ssm.delete(names.clientSecret);
    await expect(secrets.clientSecret()).rejects.toMatchObject({ reason: "parameter_missing" });
    ssm.set(names.allowList, "{");
    const fresh = new AccessSecrets(ssm, () => new Date(0), {
      ssmPrefix: "/atlas/dev/",
      allowListCacheSeconds: 120,
      secretsCacheSeconds: 300,
    });
    await expect(fresh.allowList()).rejects.toMatchObject({ reason: "parameter_unreadable" });
  });
});
