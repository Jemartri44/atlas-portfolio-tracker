// Feature 024: the copy of a cloud ledger is read back from the disk and its
// SHA-256 compared with the etag. A disk that returns other bytes than were
// written cannot be provoked from outside, so the read of the copy is the one
// double here; everything else is the console over the API with its doubles.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { encodeLine } from "@atlas/domain";
import { describe, expect, it, vi } from "vitest";
import { SELF } from "../../../api/test/harness.js";
import { EXIT } from "../../src/context.js";
import { CLI_SETTINGS, Events } from "../events.js";
import { setupConsole } from "../support/console.js";

const state = vi.hoisted(() => ({ corrupt: false }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    readFile: (async (path: Parameters<typeof real.readFile>[0], ...rest: unknown[]) => {
      const bytes = await (real.readFile as (...args: unknown[]) => Promise<Buffer>)(path, ...rest);
      return state.corrupt && /ledger-\d{4}-\d{2}-\d{2}\.jsonl$/.test(String(path))
        ? Buffer.concat([bytes, Buffer.from("x")])
        : bytes;
    }) as typeof real.readFile,
  };
});

const lines = (): string => {
  const b = new Events();
  b.settings(CLI_SETTINGS);
  b.account("acc_ib", "IE");
  return b
    .build()
    .map((event) => `${encodeLine(event)}\n`)
    .join("");
};

describe("the copy of a cloud ledger, read back from the disk", () => {
  it("fails with its own error, not a connection one, when the disk gives back other bytes", async () => {
    const c = await setupConsole();
    const { writeFile } = await import("node:fs/promises");
    const seed = join(c.root, "seed.jsonl");
    await writeFile(seed, lines());
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    expect(await c.exec(["remote", "upload", "--from", seed, "--yes"])).toBe(0);
    c.err.length = 0;
    const to = join(c.root, "copias");
    expect(await c.exec(["backup", "--to", to])).toBe(EXIT.ok);
    const [name] = await readdir(to);
    expect(name).toBeDefined();
    const second = join(c.root, "otras");
    state.corrupt = true;
    try {
      const code = await c.exec(["backup", "--to", second]);
      expect(code).toBe(EXIT.domain);
      expect(code).not.toBe(EXIT.offline);
      expect(c.err.join("\n")).toContain("backup_mismatch");
      expect(c.err.join("\n")).not.toContain("No se ha leído ni registrado nada");
    } finally {
      state.corrupt = false;
    }
  });
});
