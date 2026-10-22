// A copy that fails its verification is removed: otherwise `path_exists`
// would refuse the retry of the same day.

import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Io } from "../../src/context.js";
import { run } from "../../src/main.js";

const state = vi.hoisted(() => ({ corrupt: false }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    copyFile: (async (from: string, to: string, ...rest: unknown[]) => {
      await (real.copyFile as (...args: unknown[]) => Promise<void>)(from, to, ...rest);
      if (state.corrupt) {
        await real.appendFile(to, "\n");
      }
    }) as typeof real.copyFile,
  };
});

describe("atlas backup, local", () => {
  it("removes a copy that does not verify and lets the retry go through", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-backup-"));
    const ledger = join(dir, "ledger.jsonl");
    const lines: string[] = [];
    const io: Io = {
      out: (t) => lines.push(t),
      err: (t) => lines.push(t),
      confirm: async () => undefined,
    };
    const atlas = (...argv: string[]) => run(["--ledger", ledger, ...argv], io);
    expect(await atlas("synth", "--out", ledger, "--seed", "5")).toBe(0);
    const to = join(dir, "backups");
    state.corrupt = true;
    try {
      expect(await atlas("backup", "--to", to)).not.toBe(0);
    } finally {
      state.corrupt = false;
    }
    expect(await readdir(to)).toEqual([]);
    expect(await atlas("backup", "--to", to)).toBe(0);
    expect(await readdir(to)).toHaveLength(1);
  });
});
