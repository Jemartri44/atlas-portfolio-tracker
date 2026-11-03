// The orders of administration against the doubles of S3 and SSM — the same world the API of the
// tests runs on (`apps/api/test/harness.ts`), so that what the administration writes is read by the
// API as it would be. Never AWS, never Google.

import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DomainError } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeSecrets } from "../../../../packages/adapters/test/aws/test-only-fake-secrets.js";
import { CONFIG, setup } from "../../../api/test/harness.js";
import type { AdminAccess } from "../../src/admin/environment.js";
import { EXIT } from "../../src/context.js";
import { harness, seed } from "../harness.js";

type Api = ReturnType<typeof setup>;
const LEDGER_KEY = "ledger/ledger.jsonl";

/** The administration of the test environment: the doubles the API runs on. */
const adminOf = (api: Api): AdminAccess => ({
  clientsFor: async (environment) => {
    if (environment !== "test") {
      throw new DomainError("admin_environment_unknown", "unknown", {
        environment,
        path: "admin.json",
      });
    }
    return {
      objects: api.s3,
      parameters: api.ssm,
      secrets: new TestOnlyFakeSecrets(),
      ssmPrefix: CONFIG.ssmPrefix,
    };
  },
});

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

describe("atlas admin pull", () => {
  it("brings the ledger of the cloud down as its bytes are, never over a file", async () => {
    const api = setup();
    const text = '{"a":1}\n{"b":"ñ"}\n';
    api.s3.seed(LEDGER_KEY, text);
    const to = join(await mkdtemp(join(tmpdir(), "atlas-pull-")), "nueva");
    const c = await adminConsole(api);
    expect(await c.exec(["admin", "pull", "--env", "test", "--to", to])).toBe(EXIT.ok);
    expect(await readFile(join(to, "ledger.jsonl"), "utf8")).toBe(text);
    expect((await stat(join(to, "ledger.jsonl"))).mode & 0o777).toBe(0o600);
    expect(c.text()).toContain("(2 líneas)");
    expect(c.text()).toContain("check --deep");
    await writeFile(join(to, "ledger.jsonl"), "mine\n");
    c.reset();
    expect(await c.exec(["admin", "pull", "--env", "test", "--to", to])).toBe(EXIT.domain);
    expect(c.text()).toContain("path_exists");
    expect(await readFile(join(to, "ledger.jsonl"), "utf8")).toBe("mine\n");
  });

  it("says a cloud with no ledger, an unknown environment and AWS not answering", async () => {
    const api = setup();
    const to = await mkdtemp(join(tmpdir(), "atlas-pull-"));
    const c = await adminConsole(api);
    expect(await c.exec(["admin", "pull", "--env", "test", "--to", to])).toBe(EXIT.domain);
    expect(c.text()).toContain("ledger_missing");
    c.reset();
    expect(await c.exec(["admin", "pull", "--env", "prod", "--to", to])).not.toBe(EXIT.ok);
    expect(c.text()).toContain("admin_environment_unknown");
    api.s3.failNext(1);
    c.reset();
    expect(await c.exec(["admin", "pull", "--env", "test", "--to", to])).toBe(EXIT.domain);
    expect(c.text()).toContain("admin_remote_unavailable");
  });

  it("wants --to", async () => {
    const c = await adminConsole(setup());
    expect(await c.exec(["admin", "pull", "--env", "test"])).toBe(EXIT.usage);
  });
});

describe("the confirmations of the administration", () => {
  it.each([
    ["compact", ["admin", "compact", "--env", "test"]],
    ["restore", ["admin", "restore", "--env", "test", "--from", "backups/2026-09"]],
  ])("refuses --yes in %s, and writes nothing", async (_order, argv) => {
    const api = setup();
    const before = api.s3.keys().map((key) => [key, api.s3.etagOf(key)]);
    const c = await adminConsole(api);
    expect(await c.exec([...argv, "--yes"])).toBe(EXIT.usage);
    expect(c.text()).toContain("--yes no vale");
    expect(api.s3.keys().map((key) => [key, api.s3.etagOf(key)])).toEqual(before);
  });

  it("asks for the name of the environment, and a yes is not it", async () => {
    const api = setup();
    api.s3.seed(LEDGER_KEY, "");
    const before = api.s3.keys().map((key) => [key, api.s3.etagOf(key)]);
    const c = harness({
      events: seed(),
      admin: adminOf(api),
      ledgerPath: join(await mkdtemp(join(tmpdir(), "atlas-admin-")), "ledger.jsonl"),
      confirm: true,
      typed: "s",
    });
    const copy = join(await mkdtemp(join(tmpdir(), "atlas-copy-")), "ledger.jsonl");
    await writeFile(copy, "");
    expect(await c.exec(["admin", "restore", "--env", "test", "--from", copy])).toBe(EXIT.ok);
    expect(c.text()).toContain("Cancelado");
    expect(c.text()).toContain("Escribe «test» para seguir");
    expect(api.s3.keys().map((key) => [key, api.s3.etagOf(key)])).toEqual(before);
  });

  it("stops without a terminal to ask", async () => {
    const api = setup();
    const c = harness({
      events: seed(),
      admin: adminOf(api),
      ledgerPath: join(await mkdtemp(join(tmpdir(), "atlas-admin-")), "ledger.jsonl"),
    });
    const copy = join(await mkdtemp(join(tmpdir(), "atlas-copy-")), "ledger.jsonl");
    await writeFile(copy, "");
    expect(await c.exec(["admin", "restore", "--env", "test", "--from", copy])).toBe(EXIT.noTty);
    expect(api.s3.keys()).toEqual([]);
  });
});

describe("the name of the environment", () => {
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
      expect(await c.exec(["admin", "pull", "--env", name, "--to", "x"])).toBe(EXIT.usage);
      expect(asked).toBe(false);
    },
  );
});
