// The lock of the ledger folder from the console (ADR-0026, Part B; feature 012).

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { breakFolderLock, FileLedgerStore, systemClock, webCryptoRandom } from "@atlas/adapters";
import { describe, expect, it } from "vitest";
import type { Io } from "../../src/context.js";
import { run } from "../../src/main.js";

const capture = (answer?: boolean) => {
  const lines: string[] = [];
  const io: Io = {
    out: (t) => lines.push(t),
    err: (t) => lines.push(t),
    confirm: async () => answer,
  };
  return { io, lines };
};

const folder = async (): Promise<{ dir: string; ledger: string; lock: string }> => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-lock-"));
  return { dir, ledger: join(dir, "ledger.jsonl"), lock: join(dir, "ledger.lock") };
};

const foreign = (since: string): string =>
  `${JSON.stringify({ holder: "cli", token: "otro", since, pid: 4242, host: "portatil" })}\n`;

const account = [
  "account",
  "add",
  "--id",
  "acc_a",
  "--name",
  "A",
  "--platform",
  "p",
  "--book",
  "core",
  "--base-currency",
  "EUR",
  "--country",
  "ES",
  "--yes",
];

describe("atlas lock", () => {
  it("says there is no lock when nobody is writing", async () => {
    const { ledger } = await folder();
    const { io, lines } = capture();
    expect(await run(["--ledger", ledger, "lock", "show"], io)).toBe(0);
    expect(lines.join("\n")).toContain("no tiene cerrojo");
  });

  it("refuses to write while another console holds the lock, and says who and how to get out", async () => {
    const { ledger, lock } = await folder();
    const since = new Date(Date.now() - 2 * 60_000).toISOString();
    await writeFile(lock, foreign(since));
    const { io, lines } = capture();
    expect(await run(["--ledger", ledger, ...account], io)).toBe(6);
    const said = lines.join("\n");
    expect(said).toContain("bloqueada por otra orden de la consola (proceso 4242 en portatil)");
    expect(said).toContain("hace 2 min");
    expect(said).not.toContain("abandonado");
    expect(said).toContain("atlas lock break");
    expect(said).toContain("reduce el riesgo de que escriban los dos, pero no lo elimina");
    expect(await readFile(lock, "utf8")).toBe(foreign(since));
  });

  it("calls an old lock probably abandoned, and still never breaks it by itself", async () => {
    const { ledger, lock, dir } = await folder();
    await writeFile(lock, foreign("2020-01-01T00:00:00.000Z"));
    await writeFile(join(dir, "atlas.config.json"), '{"lock_stale_minutes": 5}');
    const { io, lines } = capture();
    expect(await run(["--ledger", ledger, ...account], io)).toBe(6);
    expect(lines.join("\n")).toContain("Lleva más de 5 minutos: probablemente quedó abandonado");
    expect(await readFile(lock, "utf8")).toBe(foreign("2020-01-01T00:00:00.000Z"));
    lines.length = 0;
    expect(await run(["--ledger", ledger, "lock", "show"], io)).toBe(0);
    expect(lines.join("\n")).toContain("01/01/2020 a las 01:00");
  });

  it("breaks the lock only when asked and confirmed", async () => {
    const { ledger, lock } = await folder();
    await writeFile(lock, foreign("2020-01-01T00:00:00.000Z"));
    const refused = capture(false);
    expect(await run(["--ledger", ledger, "lock", "break"], refused.io)).toBe(0);
    expect(refused.lines.join("\n")).toContain("Cancelado.");
    expect(await readFile(lock, "utf8")).toContain("otro");
    const noTty = capture(undefined);
    expect(await run(["--ledger", ledger, "lock", "break"], noTty.io)).toBe(4);
    const yes = capture(true);
    expect(await run(["--ledger", ledger, "lock", "break"], yes.io)).toBe(0);
    expect(yes.lines.join("\n")).toContain("Cerrojo roto.");
    expect(yes.lines.join("\n")).toContain("no imposible");
    expect(await run(["--ledger", ledger, ...account], capture().io)).toBe(0);
  });

  it("says a lock nobody can read is still a lock, and rejects an unknown subcommand", async () => {
    const { ledger, lock } = await folder();
    await writeFile(lock, "a mano");
    const { io, lines } = capture();
    expect(await run(["--ledger", ledger, "lock", "show"], io)).toBe(0);
    expect(lines.join("\n")).toContain("no dice de quién es");
    expect(await run(["--ledger", ledger, ...account], io)).toBe(6);
    expect(await run(["--ledger", ledger, "lock", "open"], io)).toBe(64);
  });

  it("calls an empty lock file a write in progress, and does not suggest breaking it (review of PR #75)", async () => {
    const { ledger, lock } = await folder();
    await writeFile(lock, "");
    const { io, lines } = capture();
    expect(await run(["--ledger", ledger, ...account], io)).toBe(6);
    const said = lines.join("\n");
    expect(said).toContain("Hay una escritura en curso");
    expect(said).toContain("No hay nada que romper");
    expect(said).not.toContain("atlas lock break");
    expect(said).not.toContain("no se entiende");
    lines.length = 0;
    expect(await run(["--ledger", ledger, "lock", "show"], io)).toBe(0);
    expect(lines.join("\n")).toContain("Hay una escritura en curso");
  });

  it("removes the temporaries of a killed write, only when nobody holds the lock (review of PR #75)", async () => {
    const { ledger, lock, dir } = await folder();
    expect(await run(["--ledger", ledger, ...account], capture().io)).toBe(0);
    const orphan = join(dir, "ledger.jsonl.tmp-4242-1");
    await writeFile(orphan, "a half written ledger");
    // Somebody holds the lock: their temporary may be the write in progress.
    await writeFile(lock, foreign(new Date().toISOString()));
    expect(await run(["--ledger", ledger, "lock", "show"], capture().io)).toBe(0);
    expect(await readFile(orphan, "utf8")).toBe("a half written ledger");
    // Nobody does: it is an orphan, and it goes.
    await rm(lock);
    const { io, lines } = capture();
    expect(await run(["--ledger", ledger, "positions"], io)).toBe(0);
    expect(lines.join("\n")).toContain("ledger.jsonl.tmp-4242-1");
    await expect(readFile(orphan, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(dir)).not.toContain("ledger.lock");
  });

  it("says nothing was written when its lock was broken mid-write", async () => {
    const { ledger, dir, lock } = await folder();
    const { io, lines } = capture();
    const compose = (path: string) => ({
      store: new FileLedgerStore(path, undefined, {
        beforeCommit: async () => {
          await breakFolderLock(dir);
          await writeFile(lock, foreign("2026-09-24T01:00:00.000Z"));
        },
      }),
      clock: systemClock,
      random: webCryptoRandom,
    });
    expect(await run(["--ledger", ledger, ...account], io, compose)).toBe(6);
    expect(lines.join("\n")).toContain("no se ha escrito nada");
  });
});
