// Faults of the console found in the audit of 03/11: each test fails if the fix is undone.

import { mkdtemp, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isInvokedDirectly, run } from "../../src/main.js";
import { harness, seed } from "../harness.js";

describe("atlas account / asset update", () => {
  it.each([
    ["account", "acc_fund", "acc_etf"],
    ["asset", "ast_world", "ast_gold"],
  ])("refuses --id on %s update: it would rewrite another record", async (kind, id, other) => {
    const h = harness({ events: seed(), confirm: true });
    const before = (await h.store.load()).events.length;
    expect(await h.exec([kind, "update", id, "--id", other, "--name", "X", "--yes"])).toBe(64);
    expect((await h.store.load()).events).toHaveLength(before);
    // The same id as the positional says nothing new, and is accepted.
    expect(await h.exec([kind, "update", id, "--id", id, "--name", "X", "--yes"])).toBe(0);
  });
});

describe("key=value maps", () => {
  it.each(["ast_world=50=99,ast_bonds=50", "ast_world=50,ast_world=20,ast_bonds=80"])(
    "rejects an ambiguous pair or a repeated key: %s",
    async (weights) => {
      const h = harness({ events: seed(), confirm: true });
      const before = (await h.store.load()).events.length;
      expect(await h.exec(["settings", "set", "--target-weights", weights, "--yes"])).toBe(64);
      expect((await h.store.load()).events).toHaveLength(before);
    },
  );
});

describe("year arguments", () => {
  it("refuses a year that has not begun in tax, as m720 does", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(["tax", "9999"])).toBe(64);
    expect(h.text()).toContain("aún no ha empezado");
    expect(await h.exec(["tax", "2027"])).toBe(0);
  });
});

describe("atlas synth --seed", () => {
  it.each(["4294967296", "9".repeat(400)])("rejects the seed %s", async (seedText) => {
    const h = harness();
    const out = join(await mkdtemp(join(tmpdir(), "atlas-seed-")), "l.jsonl");
    expect(await h.exec(["synth", "--out", out, "--seed", seedText])).toBe(64);
  });
});

describe("invoked directly", () => {
  it("recognises the script through a symlink and a path with a hash", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-link-#-"));
    const real = join(dir, "main.js");
    await writeFile(real, "");
    const link = join(dir, "atlas");
    await symlink(real, link);
    const url = new URL(`file://${resolve(real).replace(/#/g, "%23")}`).href;
    expect(isInvokedDirectly(link, url)).toBe(true);
    expect(isInvokedDirectly(real, url)).toBe(true);
    expect(isInvokedDirectly(join(dir, "other.js"), url)).toBe(false);
    expect(isInvokedDirectly(undefined, url)).toBe(false);
  });
});

describe("atlas positions", () => {
  it("says the date it is cut at and leaves out what has not happened yet", async () => {
    const h = harness({ events: seed(), confirm: true, instant: "2027-08-30T10:00:00.000Z" });
    const buy = [
      "add",
      "buy",
      "--account",
      "acc_fund",
      "--asset",
      "ast_world",
      "--trade-date",
      "2028-03-01",
      "--value-date",
      "2028-03-01",
      "--quantity",
      "2",
      "--unit-price",
      "100",
      "--currency",
      "EUR",
      "--fx-rate",
      "1",
      "--fx-rate-date",
      "2028-03-01",
      "--yes",
    ];
    expect(await h.exec(buy)).toBe(0);
    h.reset();
    expect(await h.exec(["positions"])).toBe(0);
    expect(h.text()).toContain("Posiciones a 2027-08-30");
    expect(h.text()).not.toContain("ast_world");
    h.reset();
    expect(await h.exec(["positions", "--date", "2028-12-31"])).toBe(0);
    expect(h.text()).toContain("Posiciones a 2028-12-31");
    expect(h.text()).toContain("ast_world");
    expect(await h.exec(["positions", "--date", "ayer"])).toBe(64);
  });
});

describe("atlas export --out without a ledger", () => {
  it("refuses to write an empty file for a ledger that does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-noledger-"));
    const lines: string[] = [];
    const io = {
      out: (t: string) => lines.push(t),
      err: (t: string) => lines.push(t),
      confirm: async () => true,
    };
    const out = join(dir, "copy.jsonl");
    const code = await run(
      ["--ledger", join(dir, "missing.jsonl"), "export", "--out", out, "--yes"],
      io,
    );
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("no hay nada que exportar");
    await expect(stat(out)).rejects.toThrow();
  });
});
