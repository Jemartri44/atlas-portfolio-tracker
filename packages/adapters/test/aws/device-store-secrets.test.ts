// Feature 015, E1: the objects of the devices over S3 and the secrets of SSM
// with their cache (R18, R20, R21, R31).

import {
  AccessSecrets,
  DependencyUnavailable,
  DeviceStore,
  parameterNames,
} from "@atlas/adapters/aws";
import { newDevice } from "@atlas/domain/access";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeS3 } from "./test-only-fake-s3.js";
import { TestOnlyFakeSsm } from "./test-only-fake-ssm.js";

const ID = "AAAAAAAAAAAAAAAAAAAAAA";

describe("DeviceStore", () => {
  it("creates an object never over another, and reads it back strictly", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new DeviceStore(s3);
    const device = newDevice({ deviceId: ID, type: "web", createdAt: "2026-10-01T10:00:00Z" });
    expect(await store.read(ID)).toBeUndefined();
    expect(await store.create(device)).toBe("created");
    expect(await store.create({ ...device, type: "console" })).toBe("exists");
    expect(await store.read(ID)).toEqual(device);
    expect(s3.keys()).toEqual([`sync/devices/${ID}.json`]);
  });

  it("reads a damaged object as unreadable, and never builds a key from a bad id", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new DeviceStore(s3);
    s3.seed(`sync/devices/${ID}.json`, "{ not json");
    expect(await store.read(ID)).toBe("unreadable");
    await s3.putIfMatch(
      `sync/devices/${ID}.json`,
      Uint8Array.of(0xff, 0xfe),
      (await s3.get(`sync/devices/${ID}.json`))?.etag as string,
    );
    expect(await store.read(ID)).toBe("unreadable");
    await expect(store.read("../../ledger/ledger")).rejects.toMatchObject({
      code: "device_id_invalid",
    });
    expect(s3.calls.some((call) => call.includes(".."))).toBe(false);
  });

  it("lets a failure of S3 through as what it is", async () => {
    const s3 = new TestOnlyFakeS3();
    s3.failNext();
    await expect(new DeviceStore(s3).read(ID)).rejects.toBeInstanceOf(DependencyUnavailable);
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
