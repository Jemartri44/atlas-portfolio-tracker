// One hold of the folder lock for a sequence of writes (feature 014, plan
// §2.1): the lock is not re-entrant, so `underLock` hands a writer that never
// takes it again, and every write of the writer happens with it held.

import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileLedgerStore } from "../src/ledger-store/file.js";
import { type FileOps, nodeFileOps } from "../src/ledger-store/file-ops.js";
import {
  acquireFolderLock,
  LedgerLockedError,
  LOCK_FILE,
  sweepOrphanTemporaries,
} from "../src/ledger-store/folder-lock.js";
import { account, deposit, lineOf } from "./fixtures.js";
import { nonCanonical } from "./ledger-store.contract.js";

const fresh = async (lines: readonly string[] = []) => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-under-lock-"));
  const path = join(dir, "ledger.jsonl");
  await writeFile(path, lines.map((line) => `${line}\n`).join(""));
  return { dir, path };
};

/** Records every operation, and whether the lock file existed when it ran. */
const recording = (dir: string) => {
  const log: string[] = [];
  const locked = async (): Promise<boolean> =>
    stat(join(dir, LOCK_FILE)).then(
      () => true,
      () => false,
    );
  const name = (path: string): string =>
    path.slice(dir.length + 1).replace(/\.tmp-\d+-\d+$/, ".tmp");
  const ops: FileOps = {
    ...nodeFileOps,
    open: async (path, flags) => {
      const handle = await nodeFileOps.open(path, flags);
      log.push(`open ${name(path)} ${flags} ${(await locked()) ? "locked" : "UNLOCKED"}`);
      return {
        writeFile: async (data) => {
          log.push(`write ${name(path)}`);
          await handle.writeFile(data);
        },
        sync: async () => {
          log.push(`sync ${name(path)}`);
          await handle.sync();
        },
        close: () => handle.close(),
      };
    },
    rename: async (from, to) => {
      log.push(`rename ${name(from)} -> ${name(to)} ${(await locked()) ? "locked" : "UNLOCKED"}`);
      await nodeFileOps.rename(from, to);
    },
    syncDir: async (path) => {
      log.push(`syncDir ${name(path) || "."}`);
      await nodeFileOps.syncDir(path);
    },
  };
  return { ops, log };
};

describe("FileLedgerStore.underLock", () => {
  it("runs a whole sequence under one hold, and nobody else can take it meanwhile", async () => {
    const { path, dir } = await fresh([lineOf(account)]);
    const store = new FileLedgerStore(path);
    await store.underLock(async (writer) => {
      const { etag } = await writer.load();
      await writer.writeFile("sync/held.jsonl", Buffer.from("held\n"));
      await expect(acquireFolderLock(dir)).rejects.toBeInstanceOf(LedgerLockedError);
      const appended = await writer.appendLines([lineOf(deposit)], etag);
      await writer.replaceLines([lineOf(deposit)], appended.etag, "pre-sync-x.jsonl");
      await writer.writeFile("sync/state.json", Buffer.from("{}"));
      expect((await writer.readFile("sync/held.jsonl"))?.toString()).toBe("held\n");
      expect(await writer.readFile("sync/nothing.json")).toBeUndefined();
    });
    expect(await readFile(path, "utf8")).toBe(`${lineOf(deposit)}\n`);
    expect(await readFile(join(dir, "archive", "pre-sync-x.jsonl"), "utf8")).toBe(
      `${lineOf(account)}\n${lineOf(deposit)}\n`,
    );
    await expect(stat(join(dir, LOCK_FILE))).rejects.toThrow();
  });

  it("writes raw lines byte for byte from the writer too", async () => {
    const { path } = await fresh([lineOf(account)]);
    const store = new FileLedgerStore(path);
    const odd = nonCanonical();
    await store.underLock(async (writer) => {
      const { etag } = await writer.load();
      const appended = await writer.appendLines([odd], etag);
      await writer.replaceLines(
        [lineOf(account), odd, odd.replace("5FA1", "5FA2")],
        appended.etag,
        "a.jsonl",
      );
    });
    expect(await readFile(path, "utf8")).toBe(
      `${lineOf(account)}\n${odd}\n${odd.replace("5FA1", "5FA2")}\n`,
    );
  });

  it("is not re-entrant: the public operations inside it lock themselves out", async () => {
    const { path } = await fresh([lineOf(account)]);
    const store = new FileLedgerStore(path);
    await store.underLock(async (writer) => {
      const { etag } = await writer.load();
      await expect(store.appendLines([lineOf(deposit)], etag)).rejects.toBeInstanceOf(
        LedgerLockedError,
      );
    });
  });

  it("writes a file of the folder durably: temporary with wx, sync, rename, then the directory", async () => {
    const { path, dir } = await fresh();
    const { ops, log } = recording(dir);
    const store = new FileLedgerStore(path, undefined, { fileOps: ops });
    await store.underLock((writer) => writer.writeFile("sync/state.json", Buffer.from("{}")));
    expect(log).toEqual([
      "open sync/state.json.tmp wx locked",
      "write sync/state.json.tmp",
      "sync sync/state.json.tmp",
      "rename sync/state.json.tmp -> sync/state.json locked",
      "syncDir sync",
    ]);
    expect(await readFile(join(dir, "sync", "state.json"), "utf8")).toBe("{}");
  });

  it("releases the lock when the sequence fails, and leaves no temporary behind", async () => {
    const { path, dir } = await fresh();
    const store = new FileLedgerStore(path);
    await expect(
      store.underLock(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(stat(join(dir, LOCK_FILE))).rejects.toThrow();
  });
});

describe("sweepOrphanTemporaries in sync/ (feature 014, D-Q19)", () => {
  it("removes the temporaries of the state of the sync, only with nobody holding the lock", async () => {
    const { path, dir } = await fresh([lineOf(account)]);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(dir, "sync"));
    const orphans = [
      "state.json.tmp-4242-1",
      "held.jsonl.tmp-4242-2",
      "discarded.jsonl.tmp-4242-3",
    ];
    for (const name of orphans) {
      await writeFile(join(dir, "sync", name), "half");
    }
    await writeFile(join(dir, "sync", "held.jsonl"), "kept");
    await writeFile(join(dir, "sync", "notes.tmp-1-1"), "not ours");
    const lock = await acquireFolderLock(dir);
    expect(await sweepOrphanTemporaries(path)).toEqual([]);
    await lock.release();
    expect((await sweepOrphanTemporaries(path)).sort()).toEqual(
      orphans.map((name) => join("sync", name)).sort(),
    );
    const { readdir } = await import("node:fs/promises");
    expect((await readdir(join(dir, "sync"))).sort()).toEqual(["held.jsonl", "notes.tmp-1-1"]);
  });
});
