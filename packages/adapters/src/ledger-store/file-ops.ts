// The file operations the console's stores write with, as a parameter
// (feature 014, §6.3 (V9)). Production uses `node:fs/promises` as it is; a
// test passes a wrapper that records the order of `write`, `sync`, `rename`
// and `rm`, or fails at a chosen point — which is how the durability of what
// the sync holds back is proved without killing processes.

import { promises as fs } from "node:fs";
import type { HeldLock } from "./folder-lock.js";

export interface WritableFile {
  writeFile(data: Uint8Array | string): Promise<void>;
  /** `fsync` of this handle: its bytes are on disk when it resolves. */
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface FileOps {
  readFile(path: string): Promise<Buffer>;
  /** `"wx"` fails with `EEXIST` when the file is already there. */
  open(path: string, flags: "w" | "wx"): Promise<WritableFile>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** `fsync` of a directory, so that a rename in it is on disk too. */
  syncDir(path: string): Promise<void>;
  /** Whether a directory exists (`sync/` says the folder is synced). */
  isDirectory(path: string): Promise<boolean>;
}

export const nodeFileOps: FileOps = {
  readFile: (path) => fs.readFile(path),
  open: (path, flags) => fs.open(path, flags),
  rename: (from, to) => fs.rename(from, to),
  rm: (path) => fs.rm(path, { force: true }),
  mkdir: async (path) => {
    await fs.mkdir(path, { recursive: true });
  },
  isDirectory: async (path) => {
    try {
      return (await fs.stat(path)).isDirectory();
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return false;
      }
      throw error;
    }
  },
  syncDir: async (path) => {
    const handle = await fs.open(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
};

export interface AtomicWriteOptions {
  /** `"wx"` (default) refuses to reuse a temporary name; `"w"` truncates it. */
  flags?: "w" | "wx";
  /** Runs after the data is synced and before the lock check and the rename. */
  beforeCommit?: (() => Promise<void>) | undefined;
}

/**
 * Writes `data` at `path` atomically: a temporary file, synced, the lock
 * checked as still this writer's own, renamed over `path`. The temporary file
 * is removed whatever happens. The lock check is a risk reduction, not a
 * guarantee (ADR-0026, third amendment).
 */
export async function writeFileAtomically(
  ops: FileOps,
  path: string,
  data: Uint8Array | string,
  lock: HeldLock,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await ops.open(temporary, options.flags ?? "wx");
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await options.beforeCommit?.();
    await lock.assertOwned();
    await ops.rename(temporary, path);
  } finally {
    await ops.rm(temporary);
  }
}
