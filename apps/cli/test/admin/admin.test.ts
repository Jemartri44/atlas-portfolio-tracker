// Feature 015, E5: the orders of administration against the doubles of S3 and
// SSM — the same world the API of the tests runs on (`apps/api/test/harness.ts`),
// so that what the administration writes is read by the API as it would be:
// a forgotten device refused with `device_forgotten`, a revoked token refused.
// Never AWS, never Google.

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DependencyUnavailable } from "@atlas/adapters/aws";
import { DomainError } from "@atlas/domain";
import {
  newDevice,
  parseTokenRecord,
  serializeDeviceObject,
  tokenParameterPath,
} from "@atlas/domain/access";
import { describe, expect, it } from "vitest";
import { CONFIG, consoleLogin, errorOf, setup } from "../../../api/test/harness.js";
import type { AdminAccess } from "../../src/admin/environment.js";
import { EXIT } from "../../src/context.js";
import { harness, seed } from "../harness.js";

type Api = ReturnType<typeof setup>;

/** The administration of the test environment: the doubles the API runs on. */
const adminOf = (api: Api): AdminAccess => ({
  clientsFor: async (environment) => {
    if (environment !== "test") {
      throw new DomainError("admin_environment_unknown", "unknown", {
        environment,
        path: "admin.json",
      });
    }
    return { objects: api.s3, parameters: api.ssm, ssmPrefix: CONFIG.ssmPrefix };
  },
});

const DEVICE = (n: number) => `D${String(n).padStart(21, "0")}`;

const seedDevice = (api: Api, id: string, queue: { pending?: number; held?: number } = {}) =>
  api.s3.seed(
    `sync/devices/${id}.json`,
    serializeDeviceObject({
      ...newDevice({
        deviceId: id,
        type: "console",
        createdAt: "2026-10-01T10:00:00Z",
        deviceName: "portátil",
      }),
      pending: queue.pending ?? 0,
      held: queue.held ?? 0,
    }),
  );

/** The console of the administrator, in a folder of its own with no ledger. */
const adminConsole = async (api: Api, options: { confirm?: boolean } = {}) => {
  const folder = await mkdtemp(join(tmpdir(), "atlas-admin-"));
  return harness({
    events: seed(),
    admin: adminOf(api),
    ledgerPath: join(folder, "ledger.jsonl"),
    confirm: options.confirm ?? true,
  });
};

describe("atlas admin devices", () => {
  it("lists every object of sync/devices/, an unreadable one as such", async () => {
    const api = setup();
    seedDevice(api, DEVICE(1));
    api.s3.seed(`sync/devices/${DEVICE(2)}.json`, "{");
    const c = await adminConsole(api);
    expect(await c.exec(["admin", "devices", "--env", "test"])).toBe(EXIT.ok);
    expect(c.text()).toContain(DEVICE(1));
    expect(c.text()).toContain("activo");
    expect(c.text()).toMatch(new RegExp(`${DEVICE(2)}.*ilegible`));
  });

  it("refuses an environment admin.json does not name", async () => {
    const api = setup();
    const c = await adminConsole(api);
    expect(await c.exec(["admin", "devices", "--env", "prod"])).not.toBe(EXIT.ok);
    expect(c.text()).toContain("admin_environment_unknown");
  });

  it("says AWS is not answering, never the message of the SDK", async () => {
    const api = setup();
    api.s3.failNext(1);
    const c = await adminConsole(api);
    expect(await c.exec(["admin", "devices", "--env", "test"])).toBe(EXIT.domain);
    expect(c.text()).toContain("admin_remote_unavailable");
  });
});

describe("atlas admin revoke-all-tokens (§7 P4)", () => {
  it("revokes every live record with the API's own format, and repeats without harm", async () => {
    const api = setup();
    const one = await consoleLogin(api);
    const two = await consoleLogin(api);
    const c = await adminConsole(api);
    expect(await c.exec(["admin", "revoke-all-tokens", "--env", "test"])).toBe(EXIT.ok);
    expect(c.text()).toContain("Revocados 2 tokens");
    for (const token of [one, two]) {
      const text = await api.ssm.get(`${tokenParameterPath(CONFIG.ssmPrefix)}${token.token_id}`);
      const record = parseTokenRecord(text as string, token.token_id);
      expect(record).not.toBe("unreadable");
      expect((record as { revoked_at?: string }).revoked_at).toBeDefined();
      // The API refuses it from now on.
      const answer = await api.call("GET", "/api/ledger", {
        headers: { "x-atlas-device-token": token.token },
        jar: false,
      });
      expect(errorOf(answer).code).toBe("device_token_revoked");
    }
    const before = api.ssm.history(`${tokenParameterPath(CONFIG.ssmPrefix)}${one.token_id}`).length;
    c.reset();
    expect(await c.exec(["admin", "revoke-all-tokens", "--env", "test"])).toBe(EXIT.ok);
    expect(c.text()).toContain("Revocados 0 tokens; 2 ya lo estaban");
    expect(api.ssm.history(`${tokenParameterPath(CONFIG.ssmPrefix)}${one.token_id}`)).toHaveLength(
      before,
    );
  });

  it("names an unreadable record and leaves it as it is", async () => {
    const api = setup();
    await consoleLogin(api);
    const name = `${tokenParameterPath(CONFIG.ssmPrefix)}${"U".repeat(22)}`;
    api.ssm.set(name, "{");
    const c = await adminConsole(api);
    expect(await c.exec(["admin", "revoke-all-tokens", "--env", "test"])).toBe(EXIT.ok);
    expect(c.text()).toContain("U".repeat(22));
    expect(await api.ssm.get(name)).toBe("{");
  });
});

describe("atlas admin forget-device (§7 P9, amended)", () => {
  it("revokes its tokens, then marks it forgotten on its ETag, and the API refuses it", async () => {
    const api = setup();
    const mine = await consoleLogin(api);
    const other = await consoleLogin(api);
    const c = await adminConsole(api);
    expect(await c.exec(["admin", "forget-device", "--env", "test", mine.device_id])).toBe(EXIT.ok);
    const object = JSON.parse(api.s3.text(`sync/devices/${mine.device_id}.json`) as string);
    expect(object).toMatchObject({ state: "forgotten" });
    expect(object.forgotten_at).toBeDefined();
    const mineRecord = parseTokenRecord(
      (await api.ssm.get(`${tokenParameterPath(CONFIG.ssmPrefix)}${mine.token_id}`)) as string,
      mine.token_id,
    );
    expect((mineRecord as { revoked_at?: string }).revoked_at).toBeDefined();
    // The other device keeps its token.
    const otherRecord = parseTokenRecord(
      (await api.ssm.get(`${tokenParameterPath(CONFIG.ssmPrefix)}${other.token_id}`)) as string,
      other.token_id,
    );
    expect((otherRecord as { revoked_at?: string }).revoked_at).toBeUndefined();
    // The object is still there: never deleted.
    expect(api.s3.keys()).toContain(`sync/devices/${mine.device_id}.json`);
  });

  it("forgets a device of the web alike: its cookie is refused with device_forgotten", async () => {
    const api = setup();
    await api.signIn();
    const session = JSON.parse((await api.call("GET", "/api/session")).body) as {
      device_id: string;
    };
    const c = await adminConsole(api);
    expect(await c.exec(["admin", "forget-device", "--env", "test", session.device_id])).toBe(
      EXIT.ok,
    );
    const answer = await api.call("GET", "/api/session");
    expect(errorOf(answer).code).toBe("device_forgotten");
  });

  it("refuses a device with its queue published, and forgets it with --force after saying what is lost", async () => {
    const api = setup();
    seedDevice(api, DEVICE(3), { pending: 2, held: 1 });
    const c = await adminConsole(api);
    expect(await c.exec(["admin", "forget-device", "--env", "test", DEVICE(3)])).not.toBe(EXIT.ok);
    expect(c.text()).toContain("forget_refused_queue");
    expect(JSON.parse(api.s3.text(`sync/devices/${DEVICE(3)}.json`) as string).state).toBe(
      "active",
    );
    c.reset();
    expect(await c.exec(["admin", "forget-device", "--env", "test", DEVICE(3), "--force"])).toBe(
      EXIT.ok,
    );
    expect(c.text()).toContain("2 operaciones pendientes y 1 retenidas");
    expect(JSON.parse(api.s3.text(`sync/devices/${DEVICE(3)}.json`) as string).state).toBe(
      "forgotten",
    );
  });

  it("leaves a device already forgotten as it is", async () => {
    const api = setup();
    seedDevice(api, DEVICE(4));
    const c = await adminConsole(api);
    await c.exec(["admin", "forget-device", "--env", "test", DEVICE(4)]);
    const etag = api.s3.etagOf(`sync/devices/${DEVICE(4)}.json`);
    c.reset();
    expect(await c.exec(["admin", "forget-device", "--env", "test", DEVICE(4)])).toBe(EXIT.ok);
    expect(c.text()).toContain("ya estaba olvidado");
    expect(api.s3.etagOf(`sync/devices/${DEVICE(4)}.json`)).toBe(etag);
  });

  // The cut between the two steps: revoked and not forgotten is safe, and
  // repeating finishes it; forgotten and not revoked cannot exist.
  it("never marks it forgotten when revoking its tokens failed", async () => {
    const api = setup();
    const mine = await consoleLogin(api);
    const c = await adminConsole(api);
    api.ssm.throttleNext(1);
    expect(await c.exec(["admin", "forget-device", "--env", "test", mine.device_id])).not.toBe(
      EXIT.ok,
    );
    expect(JSON.parse(api.s3.text(`sync/devices/${mine.device_id}.json`) as string).state).toBe(
      "active",
    );
    const record = parseTokenRecord(
      (await api.ssm.get(`${tokenParameterPath(CONFIG.ssmPrefix)}${mine.token_id}`)) as string,
      mine.token_id,
    );
    expect((record as { revoked_at?: string }).revoked_at).toBeUndefined();
    c.reset();
    expect(await c.exec(["admin", "forget-device", "--env", "test", mine.device_id])).toBe(EXIT.ok);
    expect(JSON.parse(api.s3.text(`sync/devices/${mine.device_id}.json`) as string).state).toBe(
      "forgotten",
    );
  });

  it("leaves it revoked and alive when the mark fails, and repeating finishes it", async () => {
    const api = setup();
    const mine = await consoleLogin(api);
    let failMark = true;
    const objects = new Proxy(api.s3, {
      get: (target, name, receiver) =>
        name === "putIfMatch" && failMark
          ? async () => {
              failMark = false;
              throw new DependencyUnavailable("s3", "status_503");
            }
          : Reflect.get(target, name, receiver),
    });
    const c = harness({
      events: seed(),
      admin: {
        clientsFor: async () => ({ objects, parameters: api.ssm, ssmPrefix: CONFIG.ssmPrefix }),
      },
      ledgerPath: join(await mkdtemp(join(tmpdir(), "atlas-admin-")), "ledger.jsonl"),
      confirm: true,
    });
    expect(await c.exec(["admin", "forget-device", "--env", "test", mine.device_id])).not.toBe(
      EXIT.ok,
    );
    expect(JSON.parse(api.s3.text(`sync/devices/${mine.device_id}.json`) as string).state).toBe(
      "active",
    );
    const record = parseTokenRecord(
      (await api.ssm.get(`${tokenParameterPath(CONFIG.ssmPrefix)}${mine.token_id}`)) as string,
      mine.token_id,
    );
    expect((record as { revoked_at?: string }).revoked_at).toBeDefined();
    c.reset();
    expect(await c.exec(["admin", "forget-device", "--env", "test", mine.device_id])).toBe(EXIT.ok);
    expect(JSON.parse(api.s3.text(`sync/devices/${mine.device_id}.json`) as string).state).toBe(
      "forgotten",
    );
    expect(c.text()).toContain("revocados 0 tokens (1 ya lo estaban)");
  });

  it("writes over a publication that came in between only after reading it again", async () => {
    const api = setup();
    seedDevice(api, DEVICE(5));
    let crossed = false;
    api.s3.beforePut = (key) => {
      if (!crossed && key === `sync/devices/${DEVICE(5)}.json`) {
        crossed = true;
        seedDevice(api, DEVICE(5));
      }
    };
    const c = await adminConsole(api);
    expect(await c.exec(["admin", "forget-device", "--env", "test", DEVICE(5)])).toBe(EXIT.ok);
    expect(JSON.parse(api.s3.text(`sync/devices/${DEVICE(5)}.json`) as string).state).toBe(
      "forgotten",
    );
  });

  it("refuses a device that is missing or cannot be read", async () => {
    const api = setup();
    api.s3.seed(`sync/devices/${DEVICE(6)}.json`, "{");
    const c = await adminConsole(api);
    expect(await c.exec(["admin", "forget-device", "--env", "test", DEVICE(7)])).not.toBe(EXIT.ok);
    expect(c.text()).toContain("forget_device_missing");
    c.reset();
    expect(await c.exec(["admin", "forget-device", "--env", "test", DEVICE(6)])).not.toBe(EXIT.ok);
    expect(c.text()).toContain("forget_device_unreadable");
    expect(api.s3.text(`sync/devices/${DEVICE(6)}.json`)).toBe("{");
  });
});
