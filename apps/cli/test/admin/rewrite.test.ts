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
import { CONFIG, setup } from "../../../api/test/harness.js";
import type { AdminAccess } from "../../src/admin/environment.js";
import { EXIT } from "../../src/context.js";
import { harness, seed } from "../harness.js";

type Api = ReturnType<typeof setup>;
const LEDGER = "ledger/ledger.jsonl";

const adminOf = (api: Api): AdminAccess => ({
  clientsFor: async () => ({ objects: api.s3, parameters: api.ssm, ssmPrefix: CONFIG.ssmPrefix }),
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
