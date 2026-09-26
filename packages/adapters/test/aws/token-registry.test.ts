// Feature 015, E2: the records of the console tokens over the narrow
// interface of SSM (plan §4.2, T01, T02, T09, T21, T25, T26), against a double
// that keeps every version and resolves selectors as SSM does (§18.3).

import { createHash } from "node:crypto";
import { sameSecret, sha256Hex } from "@atlas/adapters/access";
import { DependencyUnavailable, TokenRegistry } from "@atlas/adapters/aws";
import { newTokenRecord, type TokenRecord } from "@atlas/domain/access";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeSsm } from "./test-only-fake-ssm.js";

const PREFIX = "/atlas/dev/";
const TID = "TTTTTTTTTTTTTTTTTTTTTT";
const NAME = `${PREFIX}device-tokens/${TID}`;
const TAGS = { project: "atlas", env: "dev" };
const T0 = Date.UTC(2026, 9, 1, 10, 0, 0);

const record = (tokenId = TID): TokenRecord =>
  newTokenRecord({
    tokenId,
    secretSha256: sha256Hex("s".repeat(43)),
    sub: "108234567890123456789",
    email: "user@example.test",
    deviceId: "DDDDDDDDDDDDDDDDDDDDDD",
    deviceName: "casa",
    issuedAtMs: T0,
    lifetimeDays: 90,
  });

const setup = () => {
  const ssm = new TestOnlyFakeSsm();
  return { ssm, registry: new TokenRegistry(ssm, PREFIX, TAGS) };
};

describe("TokenRegistry", () => {
  it("creates a record once, tagged, and a second creation finds it (the single use)", async () => {
    const { ssm, registry } = setup();
    expect(await registry.create(record())).toBe("created");
    expect(await registry.create(record())).toBe("exists");
    expect(ssm.tags(NAME)).toEqual(TAGS);
    expect(ssm.history(NAME)).toHaveLength(1);
    expect(await registry.read(TID)).toEqual(record());
  });

  it("revokes by overwriting, once: a revoked one is not written again", async () => {
    const { ssm, registry } = setup();
    await registry.create(record());
    const revoked = await registry.revoke(record(), T0 + 1000);
    expect(revoked.revoked_at).toBe("2026-10-01T10:00:01Z");
    expect(await registry.revoke(revoked, T0 + 5000)).toBe(revoked);
    expect(ssm.writes).toEqual([`putNew ${NAME}`, `overwrite ${NAME}`]);
    expect(await registry.read(TID)).toEqual(revoked);
    // SSM keeps the version before the revocation: only a selector reaches it,
    // and the registry never builds a name with one (B1).
    expect(await ssm.get(`${NAME}:1`)).not.toContain("revoked_at");
    await expect(registry.read(`${TID}:1`)).rejects.toMatchObject({ code: "token_id_invalid" });
    expect(ssm.reads.some((read) => read.includes(":"))).toBe(true);
    expect(ssm.reads.filter((read) => read.startsWith(NAME) && read !== NAME)).toEqual([
      `${NAME}:1`,
    ]);
  });

  it("reads a record whose own token id is another as unreadable, and a missing one as nothing", async () => {
    const { ssm, registry } = setup();
    ssm.set(NAME, JSON.stringify(record("OOOOOOOOOOOOOOOOOOOOOO")));
    expect(await registry.read(TID)).toBe("unreadable");
    expect(await registry.read("MMMMMMMMMMMMMMMMMMMMMM")).toBeUndefined();
  });

  it("reads again on every call: nothing is cached (B2)", async () => {
    const { ssm, registry } = setup();
    expect(await registry.read(TID)).toBeUndefined();
    ssm.set(NAME, JSON.stringify(record()));
    expect(await registry.read(TID)).toEqual(record());
    ssm.set(NAME, JSON.stringify({ ...record(), revoked_at: "2026-10-02T00:00:00Z" }));
    expect((await registry.read(TID)) as TokenRecord).toHaveProperty("revoked_at");
  });

  it("lists every record of the folder, the unreadable ones too, by the id of their name", async () => {
    const { ssm, registry } = setup();
    await registry.create(record());
    ssm.set(`${PREFIX}device-tokens/broken`, "{");
    ssm.set(`${PREFIX}auth/allow-list`, "{}");
    ssm.set(`${PREFIX}device-tokens/deeper/x`, "{}");
    const listed = await registry.list();
    expect(listed).toHaveLength(2);
    expect(listed).toContainEqual({ tokenId: TID, read: record() });
    expect(listed).toContainEqual({ tokenId: "broken", read: "unreadable" });
  });

  it("lets the transient failures of SSM through as what they are", async () => {
    const { ssm, registry } = setup();
    ssm.throttleNext();
    await expect(registry.read(TID)).rejects.toBeInstanceOf(DependencyUnavailable);
    ssm.collideNext();
    await expect(registry.create(record())).rejects.toMatchObject({ reason: "too_many_updates" });
    expect(await registry.create(record())).toBe("created");
  });
});

describe("the secret of a token, compared in constant time (T03)", () => {
  it("matches only its own hash", () => {
    const secret = "s".repeat(43);
    expect(sha256Hex(secret)).toBe(createHash("sha256").update(secret).digest("hex"));
    expect(sameSecret(secret, sha256Hex(secret))).toBe(true);
    expect(sameSecret(`${secret.slice(0, 42)}t`, sha256Hex(secret))).toBe(false);
    expect(sameSecret(secret, "short")).toBe(false);
  });
});
