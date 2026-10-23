// Arguments that used to be accepted and meant something else than what was written.

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Io } from "../../src/context.js";
import { run } from "../../src/main.js";
import { BUY_WORLD, harness, idAt, seed } from "../harness.js";

describe("a value written twice", () => {
  it("is refused and records nothing, instead of recording the last one", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec([...BUY_WORLD, "--quantity", "5"])).toBe(64);
    expect(h.err.join("\n")).toContain("--quantity se ha escrito 2 veces");
    expect((await h.store.load()).events).toHaveLength(5);
  });
});

describe("a change that changes nothing", () => {
  it("settings set with no setting is refused and records no event", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(["settings", "set", "--yes"])).toBe(64);
    expect(h.err.join("\n")).toContain("no se indica ningún ajuste");
    expect((await h.store.load()).events).toHaveLength(5);
  });

  it("edit with no field is refused and leaves the event as it is", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(BUY_WORLD)).toBe(0);
    const buyId = await idAt(h.store, 5);
    h.reset();
    expect(await h.exec(["edit", buyId, "--reason", "nada"])).toBe(64);
    expect(h.err.join("\n")).toContain("no se indica ningún campo que cambiar");
    expect((await h.store.load()).events).toHaveLength(6);
  });
});

describe("an id that is not in the ledger", () => {
  it("lots of an unknown asset is an error, not an empty table", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(["lots", "ast_nope"])).toBe(1);
    expect(h.err.join("\n")).toContain("Error (unknown_asset)");
    h.reset();
    expect(await h.exec(["lots", "ast_world"])).toBe(0);
  });

  it("a buy of an unknown asset names the asset, not the rate it then lacks", async () => {
    const h = harness({ events: seed() });
    const argv = BUY_WORLD.map((word) => (word === "ast_world" ? "ast_nope" : word));
    expect(await h.exec(argv)).toBe(1);
    expect(h.err.join("\n")).toContain("Error (unknown_asset)");
    expect((await h.store.load()).events).toHaveLength(5);
  });
});

describe("a date that is not a date", () => {
  it("settings show --at is checked like every other date", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(["settings", "show", "--at", "garbage"])).toBe(64);
    expect(await h.exec(["settings", "show", "--at", "2026-13-45"])).toBe(64);
    expect(h.err.join("\n")).toContain("--at debe ser una fecha YYYY-MM-DD");
    h.reset();
    expect(await h.exec(["settings", "show", "--at", "2026-09-02"])).toBe(0);
    expect(h.out.join("\n")).toContain("Configuración vigente el 2026-09-02");
  });
});

describe("a view of a ledger that is not there", () => {
  const capture = () => {
    const out: string[] = [];
    const err: string[] = [];
    const io: Io = {
      out: (t) => out.push(t),
      err: (t) => err.push(t),
      confirm: async () => true,
    };
    return { io, out, err };
  };

  it("says it reads as empty, so a mistyped --ledger does not look like an empty portfolio", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-missing-"));
    const missing = join(dir, "typo.jsonl");
    const read = capture();
    expect(await run(["--ledger", missing, "positions"], read.io)).toBe(0);
    expect(read.err.join("\n")).toContain(`no existe el libro ${missing}`);
    const present = join(dir, "ledger.jsonl");
    await writeFile(present, "");
    const quiet = capture();
    expect(await run(["--ledger", present, "positions"], quiet.io)).toBe(0);
    expect(quiet.err).toEqual([]);
  });

  it("says it for check and tax too, which would otherwise call it «sin hallazgos» and a base of 0", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-missing-"));
    const missing = join(dir, "typo.jsonl");
    for (const command of [["check"], ["tax", "2026"]]) {
      const read = capture();
      expect(await run(["--ledger", missing, ...command], read.io)).toBe(0);
      expect(read.err.join("\n")).toContain(`no existe el libro ${missing}`);
    }
  });

  it("refuses an empty --ledger, as a shell variable that was never set leaves it", async () => {
    const read = capture();
    expect(await run(["--ledger", "", "positions"], read.io)).toBe(64);
    expect(read.err.join("\n")).toContain("--ledger necesita una ruta");
  });

  it("does not say it before a first write, which is how a ledger begins", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-missing-"));
    const first = capture();
    const argv = ["--ledger", join(dir, "ledger.jsonl"), "settings", "set"];
    expect(await run([...argv, "--stale-price-days", "4", "--yes"], first.io)).toBe(0);
    expect(first.err.join("\n")).not.toContain("no existe el libro");
  });
});
