// File operations that record their order — and whether the folder lock was
// ours when they ran — or fail at a chosen point: how the durability and the
// cuts of step 6 are proved without killing processes (§6.3 (V9)).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type FileOps, nodeFileOps } from "../../src/ledger-store/file-ops.js";
import { LOCK_FILE } from "../../src/ledger-store/folder-lock.js";

export interface Recording {
  readonly ops: FileOps;
  readonly log: string[];
  /** Makes the next operation whose log entry matches `pattern` throw, once. */
  failAt(pattern: RegExp): void;
}

export const recording = (dir: string): Recording => {
  const log: string[] = [];
  let failing: RegExp | undefined;
  const locked = async (): Promise<string> =>
    readFile(join(dir, LOCK_FILE), "utf8").then(
      (text) => (text.includes('"holder":"cli"') ? "locked" : "UNLOCKED"),
      () => "UNLOCKED",
    );
  const name = (path: string): string =>
    path.slice(dir.length + 1).replace(/\.tmp-\d+-\d+$/, ".tmp");
  const step = async (entry: string): Promise<void> => {
    log.push(entry);
    if (failing?.test(entry) === true) {
      failing = undefined;
      throw new Error(`cut at ${entry}`);
    }
  };
  const ops: FileOps = {
    ...nodeFileOps,
    open: async (path, flags) => {
      await step(`open ${name(path)} ${flags} ${await locked()}`);
      const handle = await nodeFileOps.open(path, flags);
      return {
        writeFile: async (data) => {
          await step(`write ${name(path)}`);
          await handle.writeFile(data);
        },
        sync: async () => {
          await step(`sync ${name(path)}`);
          await handle.sync();
        },
        close: () => handle.close(),
      };
    },
    rename: async (from, to) => {
      await step(`rename ${name(from)} -> ${name(to)} ${await locked()}`);
      await nodeFileOps.rename(from, to);
    },
    syncDir: async (path) => {
      await step(`syncDir ${name(path) || "."}`);
      await nodeFileOps.syncDir(path);
    },
  };
  return {
    ops,
    log,
    failAt: (pattern) => {
      failing = pattern;
    },
  };
};
