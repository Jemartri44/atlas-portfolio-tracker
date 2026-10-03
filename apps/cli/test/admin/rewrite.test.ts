// Feature 015, E5: the two rewrites of the remote — `atlas admin compact` and
// `atlas admin restore` (ADR-0026, Part A; ADR-0032) — against the double of
// S3. Both are refused by the rule of the rewrite (pending here or published
// by any device, an unreadable device; the forgotten ones do not count), both
// archive before writing and never delete, and both write on the condition of
// the remote they read. The restore walks its six steps in order.

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeLine, type LedgerSchema, type Migration } from "@atlas/domain";
import { newDevice, serializeDeviceObject } from "@atlas/domain/access";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeSecrets } from "../../../../packages/adapters/test/aws/test-only-fake-secrets.js";
import { CONFIG, setup } from "../../../api/test/harness.js";
import type { AdminAccess } from "../../src/admin/environment.js";
import { EXIT } from "../../src/context.js";
import { harness, seed } from "../harness.js";

type Api = ReturnType<typeof setup>;
const LEDGER = "ledger/ledger.jsonl";

const adminOf = (api: Api): AdminAccess => ({
  clientsFor: async () => ({
    objects: api.s3,
    parameters: api.ssm,
    secrets: new TestOnlyFakeSecrets(),
    ssmPrefix: CONFIG.ssmPrefix,
  }),
});

const text = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join("");
const seeded = seed().map((event) => encodeLine(event));

const device = (api: Api, id: string, fields: { pending?: number; state?: "forgotten" } = {}) =>
  api.s3.seed(
    `sync/devices/${id}.json`,
    serializeDeviceObject({
      ...newDevice({ deviceId: id, type: "web", createdAt: "2026-10-01T10:00:00Z" }),
      pending: fields.pending ?? 0,
      ...(fields.state === undefined
        ? {}
        : { state: "forgotten", forgotten_at: "2026-10-02T10:00:00Z" }),
    }),
  );

const adminConsole = async (
  api: Api,
  options: { confirm?: boolean; schema?: LedgerSchema } = {},
) => {
  const folder = await mkdtemp(join(tmpdir(), "atlas-admin-"));
  return {
    folder,
    c: harness({
      events: seed(),
      admin: adminOf(api),
      ledgerPath: join(folder, "ledger.jsonl"),
      confirm: options.confirm ?? true,
      typed: options.confirm === false ? "no" : "test",
      ...(options.schema === undefined ? {} : { schema: options.schema }),
    }),
  };
};

// A schema with a version 2, to have something to compact (as the local compact tests).
const renameNote: Migration = (record) => record;
const V2: LedgerSchema = { version: 2, migrations: new Map([[1, renameNote]]) };

describe("the rule of the rewrite of the remote", () => {
  it.each([
    ["compact", ["admin", "compact", "--env", "test"]],
    ["restore", ["admin", "restore", "--env", "test", "--from", "backups/2026-09"]],
  ])(
    "refuses %s with a device that published pending lines, and writes nothing",
    async (_what, argv) => {
      const api = setup();
      api.s3.seed(LEDGER, text(seeded));
      api.s3.seed("backups/2026-09/ledger.jsonl", text(seeded.slice(0, 2)));
      device(api, `D${"1".repeat(21)}`, { pending: 3 });
      const before = api.s3.keys();
      const { c } = await adminConsole(api, { schema: V2 });
      expect(await c.exec(argv)).not.toBe(EXIT.ok);
      expect(c.text()).toContain("rewrite_refused_pending_devices");
      expect(api.s3.keys()).toEqual(before);
      expect(api.s3.text(LEDGER)).toBe(text(seeded));
    },
  );

  it("refuses with a device that cannot be read, and does not count a forgotten one", async () => {
    const api = setup();
    api.s3.seed(LEDGER, text(seeded));
    api.s3.seed(`sync/devices/${"U".repeat(22)}.json`, "{");
    const { c } = await adminConsole(api, { schema: V2 });
    expect(await c.exec(["admin", "compact", "--env", "test"])).not.toBe(EXIT.ok);
    expect(c.text()).toContain("rewrite_refused_device_unreadable");
    // Forgotten, with a queue: it does not count.
    const other = setup();
    other.s3.seed(LEDGER, text(seeded));
    device(other, `D${"2".repeat(21)}`, { pending: 5, state: "forgotten" });
    const again = await adminConsole(other, { schema: V2 });
    expect(await again.c.exec(["admin", "compact", "--env", "test"])).toBe(EXIT.ok);
  });
});

describe("atlas admin compact", () => {
  it("archives the remote first, rewrites it in the current version, and never deletes", async () => {
    const api = setup();
    api.s3.seed(LEDGER, text(seeded));
    const { c } = await adminConsole(api, { schema: V2 });
    expect(await c.exec(["admin", "compact", "--env", "test"])).toBe(EXIT.ok);
    const archived = api.s3.keys().filter((key) => key.startsWith("archive/"));
    expect(archived).toHaveLength(1);
    expect(api.s3.text(archived[0] as string)).toBe(text(seeded));
    expect(
      (api.s3.text(LEDGER) as string)
        .split("\n")
        .filter(Boolean)
        .every((line) => line.includes('"schema_version":2')),
    ).toBe(true);
  });

  it("writes nothing when the remote changed after it was read", async () => {
    const api = setup();
    api.s3.seed(LEDGER, text(seeded));
    let crossed = false;
    api.s3.beforePut = (key) => {
      if (!crossed && key === LEDGER) {
        crossed = true;
        api.s3.seed(
          LEDGER,
          text([
            ...seeded,
            encodeLine({ ...seed()[0], id: "01ARYZ6S41TSV4RRFFQ69G5ZZZ" } as never),
          ]),
        );
      }
    };
    const { c } = await adminConsole(api, { schema: V2 });
    expect(await c.exec(["admin", "compact", "--env", "test"])).not.toBe(EXIT.ok);
    expect(api.s3.text(LEDGER)).not.toContain('"schema_version":2');
  });
});

describe("atlas admin restore (ADR-0032, the six steps)", () => {
  it("restores a prefix, saying the tail it loses, archiving first and writing the bytes as they are", async () => {
    const api = setup();
    api.s3.seed(LEDGER, text(seeded));
    const candidate = text(seeded.slice(0, 2));
    const { c, folder } = await adminConsole(api);
    await writeFile(join(folder, "copia.jsonl"), candidate);
    expect(
      await c.exec(["admin", "restore", "--env", "test", "--from", join(folder, "copia.jsonl")]),
    ).toBe(EXIT.ok);
    const out = c.text();
    for (const step of ["1.", "2.", "3.", "5.", "6."]) {
      expect(out).toContain(step);
    }
    expect(out).toContain("se pierde esta cola");
    expect(api.s3.text(LEDGER)).toBe(candidate);
    const archived = api.s3.keys().filter((key) => key.startsWith("archive/pre-restore-"));
    expect(archived).toHaveLength(1);
    expect(api.s3.text(archived[0] as string)).toBe(text(seeded));
  });

  it("touches nothing on a no at step 4", async () => {
    const api = setup();
    api.s3.seed(LEDGER, text(seeded));
    api.s3.seed("backups/2026-09/ledger.jsonl", text(seeded.slice(0, 1)));
    const { c } = await adminConsole(api, { confirm: false });
    expect(await c.exec(["admin", "restore", "--env", "test", "--from", "backups/2026-09"])).toBe(
      EXIT.ok,
    );
    expect(c.text()).toContain("Cancelado");
    expect(api.s3.text(LEDGER)).toBe(text(seeded));
    expect(api.s3.keys().some((key) => key.startsWith("archive/"))).toBe(false);
  });

  it("refuses a candidate that does not pass the check, before comparing", async () => {
    const api = setup();
    api.s3.seed(LEDGER, text(seeded));
    // A cash movement on an account that does not exist: invalid in projection.
    const broken = encodeLine({
      schema_version: 1,
      id: "01ARYZ6S41TSV4RRFFQ69G5FZZ",
      recorded_at: "2026-09-01T18:00:00.000Z",
      type: "cash_deposit",
      account_id: "acc_missing",
      value_date: "2026-09-01",
      amount: "1",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2026-09-01",
      fingerprint: "sha256:x",
    } as never);
    api.s3.seed("backups/2026-08/ledger.jsonl", text([...seeded, broken]));
    const { c } = await adminConsole(api);
    expect(
      await c.exec(["admin", "restore", "--env", "test", "--from", "backups/2026-08"]),
    ).not.toBe(EXIT.ok);
    expect(c.text()).toContain("restore_candidate_invalid");
    expect(c.text()).not.toContain("3.");
    expect(api.s3.text(LEDGER)).toBe(text(seeded));
  });

  it("writes the candidate's bytes as they are, never serialised again (replaceLines)", async () => {
    const api = setup();
    api.s3.seed(LEDGER, text(seeded));
    // The same events with their keys in another order: valid, and not what
    // the encoder of today writes. A rewrite that serialises would change them.
    const reordered = seeded
      .slice(0, 2)
      .map((line) =>
        JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(line)).reverse())),
      );
    expect(reordered[0]).not.toBe(seeded[0]);
    api.s3.seed("backups/2026-07/ledger.jsonl", text(reordered));
    const { c } = await adminConsole(api);
    expect(await c.exec(["admin", "restore", "--env", "test", "--from", "backups/2026-07"])).toBe(
      EXIT.ok,
    );
    expect(api.s3.text(LEDGER)).toBe(text(reordered));
  });

  it("writes nothing when the remote changed between the comparison and the write", async () => {
    const api = setup();
    api.s3.seed(LEDGER, text(seeded));
    api.s3.seed("backups/2026-09/ledger.jsonl", text(seeded.slice(0, 2)));
    const moved = text([
      ...seeded,
      encodeLine({ ...seed()[0], id: "01ARYZ6S41TSV4RRFFQ69G5ZZY" } as never),
    ]);
    // The second read of the ledger comes after the confirmation of step 4:
    // another writer got there first.
    let reads = 0;
    const objects = new Proxy(api.s3, {
      get: (target, name, receiver) =>
        name === "get"
          ? async (key: string) => {
              if (key === LEDGER && ++reads === 2) {
                target.seed(LEDGER, moved);
              }
              return target.get(key);
            }
          : Reflect.get(target, name, receiver),
    });
    const folder = await mkdtemp(join(tmpdir(), "atlas-admin-"));
    const c = harness({
      events: seed(),
      admin: {
        clientsFor: async () => ({
          objects,
          parameters: api.ssm,
          secrets: new TestOnlyFakeSecrets(),
          ssmPrefix: CONFIG.ssmPrefix,
        }),
      },
      ledgerPath: join(folder, "ledger.jsonl"),
      confirm: true,
      typed: "test",
    });
    expect(await c.exec(["admin", "restore", "--env", "test", "--from", "backups/2026-09"])).toBe(
      EXIT.conflict,
    );
    expect(api.s3.text(LEDGER)).toBe(moved);
  });

  it("refuses a file that is not UTF-8, before comparing (review of PR #98, N9)", async () => {
    const api = setup();
    api.s3.seed(LEDGER, text(seeded));
    const { c, folder } = await adminConsole(api);
    // A byte 0xFF inside a string of a good copy: not UTF-8 at all.
    const broken = Buffer.from(text(seeded.slice(0, 2)));
    const at = broken.indexOf("Fondos");
    expect(at).toBeGreaterThan(0);
    broken[at + 3] = 0xff;
    await writeFile(join(folder, "copia.jsonl"), broken);
    expect(
      await c.exec(["admin", "restore", "--env", "test", "--from", join(folder, "copia.jsonl")]),
    ).toBe(EXIT.domain);
    expect(c.text()).toContain("restore_candidate_invalid");
    expect(c.text()).toContain("not_utf8");
    expect(c.text()).not.toContain("3.");
    expect(api.s3.text(LEDGER)).toBe(text(seeded));
  });

  it("refuses a file that starts with a BOM instead of writing other bytes (round 2, PR #98)", async () => {
    const api = setup();
    api.s3.seed(LEDGER, text(seeded));
    const { c, folder } = await adminConsole(api);
    await writeFile(
      join(folder, "copia.jsonl"),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text(seeded.slice(0, 2)))]),
    );
    expect(
      await c.exec(["admin", "restore", "--env", "test", "--from", join(folder, "copia.jsonl")]),
    ).toBe(EXIT.domain);
    expect(c.text()).not.toContain("3.");
    expect(api.s3.text(LEDGER)).toBe(text(seeded));
  });

  it("restores an older version of the object, compared event by event", async () => {
    const api = setup();
    api.s3.seed(LEDGER, text(seeded.slice(0, 1)));
    const old = api.s3.versionsOf(LEDGER)[0] as string;
    api.s3.seed(LEDGER, text([seeded[0] as string, seeded[2] as string]));
    const { c } = await adminConsole(api);
    expect(await c.exec(["admin", "restore", "--env", "test", "--from", `s3-version:${old}`])).toBe(
      EXIT.ok,
    );
    expect(c.text()).toContain("es un prefijo de la nube");
    expect(api.s3.text(LEDGER)).toBe(text(seeded.slice(0, 1)));
  });

  it("writes nothing when the remote changed after step 3", async () => {
    const api = setup();
    api.s3.seed(LEDGER, text(seeded));
    api.s3.seed("backups/2026-09/ledger.jsonl", text(seeded.slice(0, 2)));
    let crossed = false;
    api.s3.beforePut = (key) => {
      if (!crossed && key === LEDGER) {
        crossed = true;
        api.s3.seed(LEDGER, text(seeded.slice(0, 1)));
      }
    };
    const { c } = await adminConsole(api);
    expect(
      await c.exec(["admin", "restore", "--env", "test", "--from", "backups/2026-09"]),
    ).not.toBe(EXIT.ok);
    expect(api.s3.text(LEDGER)).toBe(text(seeded.slice(0, 1)));
  });
});
