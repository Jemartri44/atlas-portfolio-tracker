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
  newTokenRecord,
  parseTokenRecord,
  serializeDeviceObject,
  serializeTokenRecord,
  tokenParameterPath,
} from "@atlas/domain/access";
import { describe, expect, it } from "vitest";
import { setup as apiSetup, CONFIG, consoleLogin, errorOf } from "../../../api/test/harness.js";
import type { AdminAccess } from "../../src/admin/environment.js";
import { EXIT } from "../../src/context.js";
import { harness, seed } from "../harness.js";
import { dashRandom } from "../support/dash-ids.js";

/** Every id the API draws begins with `--`; `DEVICE` gives the ones of a single dash. */
const setup = () => apiSetup({ random: dashRandom() });

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

/** A device id of 22 characters that begins with `--` (odd) or with `-` (even). */
const DEVICE = (n: number) =>
  n % 2 === 1 ? `--D${String(n).padStart(19, "0")}` : `-D${String(n).padStart(20, "0")}`;

/** `atlas admin forget-device` with the id after `--`, the end of the options. */
const forget = (id: string, ...flags: string[]) => [
  "admin",
  "forget-device",
  "--env",
  "test",
  ...flags,
  "--",
  id,
];

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
    typed: options.confirm === false ? "no" : "test",
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
    // Revoking all is not done while a record could not be read (review of
    // PR #98, N2): the order fails, naming it, and leaves it as it is.
    expect(await c.exec(["admin", "revoke-all-tokens", "--env", "test"])).toBe(EXIT.domain);
    expect(c.text()).toContain("U".repeat(22));
    expect(c.text()).toContain("No se puede asegurar que estén revocados");
    expect(await api.ssm.get(name)).toBe("{");
  });
});

describe("atlas admin forget-device (§7 P9, amended)", () => {
  it("revokes its tokens, then marks it forgotten on its ETag, and the API refuses it", async () => {
    const api = setup();
    const mine = await consoleLogin(api);
    const other = await consoleLogin(api);
    const c = await adminConsole(api);
    expect(await c.exec(forget(mine.device_id))).toBe(EXIT.ok);
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
    expect(await c.exec(forget(session.device_id))).toBe(EXIT.ok);
    const answer = await api.call("GET", "/api/session");
    expect(errorOf(answer).code).toBe("device_forgotten");
  });

  it("refuses a device with its queue published, and forgets it with --force after saying what is lost", async () => {
    const api = setup();
    seedDevice(api, DEVICE(3), { pending: 2, held: 1 });
    const c = await adminConsole(api);
    expect(await c.exec(forget(DEVICE(3)))).not.toBe(EXIT.ok);
    expect(c.text()).toContain("forget_refused_queue");
    expect(JSON.parse(api.s3.text(`sync/devices/${DEVICE(3)}.json`) as string).state).toBe(
      "active",
    );
    c.reset();
    expect(await c.exec(forget(DEVICE(3), "--force"))).toBe(EXIT.ok);
    expect(c.text()).toContain("2 operaciones pendientes y 1 retenidas");
    expect(JSON.parse(api.s3.text(`sync/devices/${DEVICE(3)}.json`) as string).state).toBe(
      "forgotten",
    );
  });

  it("leaves a device already forgotten as it is", async () => {
    const api = setup();
    seedDevice(api, DEVICE(4));
    const c = await adminConsole(api);
    await c.exec(forget(DEVICE(4)));
    const etag = api.s3.etagOf(`sync/devices/${DEVICE(4)}.json`);
    c.reset();
    expect(await c.exec(forget(DEVICE(4)))).toBe(EXIT.ok);
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
    expect(await c.exec(forget(mine.device_id))).not.toBe(EXIT.ok);
    expect(JSON.parse(api.s3.text(`sync/devices/${mine.device_id}.json`) as string).state).toBe(
      "active",
    );
    const record = parseTokenRecord(
      (await api.ssm.get(`${tokenParameterPath(CONFIG.ssmPrefix)}${mine.token_id}`)) as string,
      mine.token_id,
    );
    expect((record as { revoked_at?: string }).revoked_at).toBeUndefined();
    c.reset();
    expect(await c.exec(forget(mine.device_id))).toBe(EXIT.ok);
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
      typed: "test",
    });
    expect(await c.exec(forget(mine.device_id))).not.toBe(EXIT.ok);
    expect(JSON.parse(api.s3.text(`sync/devices/${mine.device_id}.json`) as string).state).toBe(
      "active",
    );
    const record = parseTokenRecord(
      (await api.ssm.get(`${tokenParameterPath(CONFIG.ssmPrefix)}${mine.token_id}`)) as string,
      mine.token_id,
    );
    expect((record as { revoked_at?: string }).revoked_at).toBeDefined();
    c.reset();
    expect(await c.exec(forget(mine.device_id))).toBe(EXIT.ok);
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
    expect(await c.exec(forget(DEVICE(5)))).toBe(EXIT.ok);
    expect(JSON.parse(api.s3.text(`sync/devices/${DEVICE(5)}.json`) as string).state).toBe(
      "forgotten",
    );
  });

  it("takes an id that begins with a dash after --, or as --device, and says so when it is not", async () => {
    const api = setup();
    const mine = await consoleLogin(api);
    const other = await consoleLogin(api);
    // The harness draws them so: the case that was left to chance.
    expect(mine.device_id.startsWith("--")).toBe(true);
    expect(DEVICE(2).startsWith("-") && !DEVICE(2).startsWith("--")).toBe(true);
    seedDevice(api, DEVICE(2), { pending: 1 });
    const c = await adminConsole(api);
    const before = api.s3.keys().map((key) => [key, api.s3.etagOf(key)]);
    // Written bare, it reads as an option: refused, naming the way out.
    expect(await c.exec(["admin", "forget-device", "--env", "test", mine.device_id])).toBe(
      EXIT.usage,
    );
    expect(c.text()).toContain(`opción desconocida: ${mine.device_id}`);
    expect(c.text()).toContain("escríbelo detrás de «--»");
    expect(api.s3.keys().map((key) => [key, api.s3.etagOf(key)])).toEqual(before);
    // As --device, whatever it begins with.
    c.reset();
    expect(
      await c.exec(["admin", "forget-device", "--env", "test", "--device", mine.device_id]),
    ).toBe(EXIT.ok);
    expect(JSON.parse(api.s3.text(`sync/devices/${mine.device_id}.json`) as string).state).toBe(
      "forgotten",
    );
    // A single dash is a positional even without --, and --force goes with it.
    c.reset();
    expect(await c.exec(["admin", "forget-device", DEVICE(2), "--force", "--env", "test"])).toBe(
      EXIT.ok,
    );
    expect(JSON.parse(api.s3.text(`sync/devices/${DEVICE(2)}.json`) as string).state).toBe(
      "forgotten",
    );
    // Only one of the two ways at a time.
    c.reset();
    expect(
      await c.exec([
        "admin",
        "forget-device",
        "--env",
        "test",
        "--device",
        other.device_id,
        "--",
        other.device_id,
      ]),
    ).toBe(EXIT.usage);
    expect(c.text()).toContain("el dispositivo se da una sola vez");
    // --device belongs to forget-device only, and a missing one names both ways.
    c.reset();
    expect(await c.exec(["admin", "devices", "--env", "test", "--device", other.device_id])).toBe(
      EXIT.usage,
    );
    expect(c.text()).toContain("--device no vale en «atlas admin devices»");
    c.reset();
    expect(await c.exec(["admin", "forget-device", "--env", "test"])).toBe(EXIT.usage);
    expect(c.text()).toContain("escríbelo detrás de «--» o con --device <id>");
    expect(JSON.parse(api.s3.text(`sync/devices/${other.device_id}.json`) as string).state).toBe(
      "active",
    );
  });

  it("refuses a device that is missing or cannot be read", async () => {
    const api = setup();
    api.s3.seed(`sync/devices/${DEVICE(6)}.json`, "{");
    const c = await adminConsole(api);
    expect(await c.exec(forget(DEVICE(7)))).not.toBe(EXIT.ok);
    expect(c.text()).toContain("forget_device_missing");
    c.reset();
    expect(await c.exec(forget(DEVICE(6)))).not.toBe(EXIT.ok);
    expect(c.text()).toContain("forget_device_unreadable");
    expect(api.s3.text(`sync/devices/${DEVICE(6)}.json`)).toBe("{");
  });
});

describe("the confirmations of the administration (review of PR #98, N1)", () => {
  it.each([
    ["forget-device", ["admin", "forget-device", "--env", "test", "--device", DEVICE(8)]],
    ["compact", ["admin", "compact", "--env", "test"]],
    ["restore", ["admin", "restore", "--env", "test", "--from", "backups/2026-09"]],
  ])("refuses --yes in %s, and writes nothing", async (_order, argv) => {
    const api = setup();
    seedDevice(api, DEVICE(8));
    const before = api.s3.keys().map((key) => [key, api.s3.etagOf(key)]);
    const c = await adminConsole(api);
    expect(await c.exec([...argv, "--yes"])).toBe(EXIT.usage);
    expect(c.text()).toContain("--yes no vale");
    expect(api.s3.keys().map((key) => [key, api.s3.etagOf(key)])).toEqual(before);
  });

  it("asks for the name of the environment, with the device described, and a yes is not it", async () => {
    const api = setup();
    const mine = await consoleLogin(api);
    const c = harness({
      events: seed(),
      admin: adminOf(api),
      ledgerPath: join(await mkdtemp(join(tmpdir(), "atlas-admin-")), "ledger.jsonl"),
      confirm: true,
      typed: "s",
    });
    expect(await c.exec(forget(mine.device_id))).toBe(EXIT.ok);
    expect(c.text()).toContain("Cancelado");
    expect(c.text()).toContain("consola, «sobremesa», última sincronización ninguna");
    expect(c.text()).toContain("Escribe «test» para seguir");
    expect(JSON.parse(api.s3.text(`sync/devices/${mine.device_id}.json`) as string).state).toBe(
      "active",
    );
  });

  it("stops without a terminal to ask", async () => {
    const api = setup();
    seedDevice(api, DEVICE(9));
    const c = harness({
      events: seed(),
      admin: adminOf(api),
      ledgerPath: join(await mkdtemp(join(tmpdir(), "atlas-admin-")), "ledger.jsonl"),
    });
    expect(await c.exec(forget(DEVICE(9)))).toBe(EXIT.noTty);
    expect(JSON.parse(api.s3.text(`sync/devices/${DEVICE(9)}.json`) as string).state).toBe(
      "active",
    );
  });
});

describe("the name of the environment (review of PR #98, N6)", () => {
  it.each(["toString", "__proto__", "Prod", "-x"])(
    "refuses --env %s before any client",
    async (name) => {
      let asked = false;
      const c = harness({
        events: seed(),
        admin: {
          clientsFor: async () => {
            asked = true;
            throw new Error("never");
          },
        },
      });
      expect(await c.exec(["admin", "devices", "--env", name])).toBe(EXIT.usage);
      expect(asked).toBe(false);
    },
  );
});

describe("forget-device sweeps the tokens issued meanwhile (review of PR #98, N8)", () => {
  const recordFor = (deviceId: string, tokenId: string) =>
    serializeTokenRecord(
      newTokenRecord({
        tokenId,
        secretSha256: "0".repeat(64),
        sub: "108234567890123456789",
        email: "user@example.test",
        deviceId,
        deviceName: "sobremesa",
        issuedAtMs: Date.UTC(2026, 9, 1, 10, 0, 0),
        lifetimeDays: 90,
      }),
    );

  it("revokes a token issued between the revocation and the mark", async () => {
    const api = setup();
    const mine = await consoleLogin(api);
    const late = "L".repeat(22);
    let crossed = false;
    api.s3.beforePut = (key) => {
      if (!crossed && key === `sync/devices/${mine.device_id}.json`) {
        crossed = true;
        api.ssm.set(
          `${tokenParameterPath(CONFIG.ssmPrefix)}${late}`,
          recordFor(mine.device_id, late),
        );
      }
    };
    const c = await adminConsole(api);
    expect(await c.exec(forget(mine.device_id))).toBe(EXIT.ok);
    const record = parseTokenRecord(
      (await api.ssm.get(`${tokenParameterPath(CONFIG.ssmPrefix)}${late}`)) as string,
      late,
    );
    expect((record as { revoked_at?: string }).revoked_at).toBeDefined();
    expect(c.text()).toContain("revocados 2 tokens");
  });

  it("finishes the sweep when repeated over a device already forgotten", async () => {
    const api = setup();
    seedDevice(api, DEVICE(10));
    const c = await adminConsole(api);
    expect(await c.exec(forget(DEVICE(10)))).toBe(EXIT.ok);
    const late = "M".repeat(22);
    api.ssm.set(`${tokenParameterPath(CONFIG.ssmPrefix)}${late}`, recordFor(DEVICE(10), late));
    c.reset();
    expect(await c.exec(forget(DEVICE(10)))).toBe(EXIT.ok);
    expect(c.text()).toContain("revocados 1 tokens suyos que seguían vivos");
    const record = parseTokenRecord(
      (await api.ssm.get(`${tokenParameterPath(CONFIG.ssmPrefix)}${late}`)) as string,
      late,
    );
    expect((record as { revoked_at?: string }).revoked_at).toBeDefined();
  });
});
