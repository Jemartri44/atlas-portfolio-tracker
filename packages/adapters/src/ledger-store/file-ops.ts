// The file operations the console's stores write with, as a parameter
// (feature 014, §6.3 (V9)). Production uses `node:fs/promises` as it is; a
// test passes a wrapper that records the order of `write`, `sync`, `rename`
// and `rm`, or fails at a chosen point — which is how the durability of what
// the sync holds back is proved without killing processes.

import { promises as fs } from "node:fs";

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
