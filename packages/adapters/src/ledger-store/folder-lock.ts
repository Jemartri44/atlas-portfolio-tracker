// The advisory lock of a ledger folder (ADR-0026, Part B; feature 012, block 0).
//
// **One lock per ledger folder**, covering every write inside it: the ledger,
// `archive/`, `drafts/`, `reference/ecb/` and, when it exists, `sync/`
// (decision (t) of prompt 012). It is built around "write bytes in a folder"
// and not around `append` and `replace`, so the raw-line operations of feature
// 014 take it as they are.
//
// What it guarantees, and what it does not, said where it is read:
//
// - **Only the console writes in the folder.** The browser cannot create a file
//   exclusively (the File System Access API has no such primitive: verified in
//   `specs/012-ecb-reference-rates/questions.md` §1), so by decision of the
//   direction the web never writes here (ADR-0019 and ADR-0026 amended). The
//   lock closes the window between Atlas **console** writers, and only because
//   `open(…, "wx")` — `O_CREAT | O_EXCL` — is atomic where it runs.
// - **Advisory**: a text editor does not see it, and that is accepted.
// - **It is never broken automatically**, however old. Its age is informative;
//   breaking it is an act of the user (`atlas lock break`).
// - **The ownership check before the rename is a risk reduction, not a
//   guarantee.** If the user breaks a lock whose owner is still alive, the
//   check makes it less likely that both write; it cannot make it impossible.

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, join } from "node:path";

export const LOCK_FILE = "ledger.lock";

/** What the lock file says. `holder` is only ever `cli` today; the field is kept for feature 014. */
export interface FolderLockInfo {
  holder: string;
  token: string;
  since: string;
  pid?: number;
  host?: string;
}

/**
 * A lock file that exists and is still empty: another writer has just created
 * it exclusively and has not written who it is yet. A write is starting — not
 * an unreadable lock, and nothing to break (review of PR #75).
 */
export const BEING_WRITTEN = "being_written";

/** What a lock file says: who holds it, that it is being written, or `undefined` when unreadable. */
export type FolderLockState = FolderLockInfo | typeof BEING_WRITTEN | undefined;

const hasCode = (error: unknown, code: string): boolean =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === code;

/**
 * The folder is locked by somebody else. `info` is what the lock file says, or
 * `undefined` when it cannot be read (someone wrote it by hand, or it is being
 * written right now): the lock still holds, whoever it is.
 */
export class LedgerLockedError extends Error {
  constructor(
    readonly folder: string,
    readonly info: FolderLockState,
  ) {
    super(
      info === undefined
        ? `the ledger folder ${folder} is locked by a writer that does not identify itself`
        : info === BEING_WRITTEN
          ? `the ledger folder ${folder} is locked by a write that is just starting`
          : `the ledger folder ${folder} is locked by ${info.holder} since ${info.since}`,
    );
    this.name = "LedgerLockedError";
  }
}

/**
 * The lock this writer took is no longer its own: somebody broke it and
 * possibly took it again. Nothing was renamed.
 */
export class LockLostError extends Error {
  constructor(readonly folder: string) {
    super(`the lock of ${folder} was broken while writing; nothing was written`);
    this.name = "LockLostError";
  }
}

const parse = (text: string): FolderLockState => {
  if (text === "") {
    return BEING_WRITTEN;
  }
  try {
    const value = JSON.parse(text) as Partial<FolderLockInfo>;
    return typeof value.holder === "string" &&
      typeof value.token === "string" &&
      typeof value.since === "string"
      ? (value as FolderLockInfo)
      : undefined;
  } catch {
    // A lock file that is not ours, or half written: it still locks.
    return undefined;
  }
};

/** What the lock file of `folder` says; `null` when there is no lock. */
export const readFolderLock = async (folder: string): Promise<FolderLockState | null> => {
  try {
    return parse(await fs.readFile(join(folder, LOCK_FILE), "utf8"));
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
};

/** A lock this process holds. */
export interface HeldLock {
  readonly info: FolderLockInfo;
  /** Throws LockLostError when the file on disk is no longer this lock. */
  assertOwned(): Promise<void>;
  /** Deletes the file only if it is still this lock; never someone else's. */
  release(): Promise<void>;
}

/**
 * Takes the lock of `folder` by creating the lock file **exclusively**, or
 * throws LedgerLockedError with what the existing one says. Creates the folder
 * if it does not exist yet, as the first write of a new ledger does.
 */
export const acquireFolderLock = async (
  folder: string,
  now: Date = new Date(),
): Promise<HeldLock> => {
  const path = join(folder, LOCK_FILE);
  const info: FolderLockInfo = {
    holder: "cli",
    token: randomBytes(16).toString("hex"),
    since: now.toISOString(),
    pid: process.pid,
    host: hostname(),
  };
  await fs.mkdir(folder, { recursive: true });
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(path, "wx");
  } catch (error) {
    if (hasCode(error, "EEXIST")) {
      throw new LedgerLockedError(folder, (await readFolderLock(folder)) ?? undefined);
    }
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify(info)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const owned = async (): Promise<boolean> => {
    const current = await readFolderLock(folder);
    return typeof current === "object" && current?.token === info.token;
  };
  return {
    info,
    assertOwned: async () => {
      if (!(await owned())) {
        throw new LockLostError(folder);
      }
    },
    release: async () => {
      // Read and then delete is not atomic, and it does not need to be: the
      // only other way the file changes is the user breaking it on purpose.
      if (await owned()) {
        await fs.rm(path, { force: true });
      }
    },
  };
};

/** Breaks the lock, whoever holds it. Only ever called on an explicit request of the user. */
export const breakFolderLock = async (folder: string): Promise<boolean> => {
  try {
    await fs.rm(join(folder, LOCK_FILE));
    return true;
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
};

/**
 * Runs `write` holding the lock of `folder`, and releases it **always**, also
 * when the write fails: a lock left behind by an exception forces the user to
 * break it for nothing and teaches them to break locks without looking.
 */
export const withFolderLock = async <T>(
  folder: string,
  write: (lock: HeldLock) => Promise<T>,
): Promise<T> => {
  const lock = await acquireFolderLock(folder);
  try {
    return await write(lock);
  } finally {
    await lock.release();
  }
};

/**
 * Removes the temporary files a write of the ledger left behind when it was
 * killed before its rename (`ledger.jsonl.tmp-<pid>-<time>`; review of PR
 * #75), and those of `sync/` (feature 014). Only under the lock: every
 * writer creates its temporary holding it,
 * so while this holds it, any temporary is an orphan. If somebody holds the
 * lock, nothing is touched — their temporary may be the write in progress.
 * Returns the names removed.
 */
export const sweepOrphanTemporaries = async (ledgerPath: string): Promise<string[]> => {
  const folder = dirname(ledgerPath);
  const prefix = `${basename(ledgerPath)}.tmp-`;
  // Since feature 014 (decision D-Q19), the temporaries of the state of the
  // sync too: `sync/state.json`, `held.jsonl` and `discarded.jsonl` are
  // written the same way, and a loose file in the folder that syncs ends up
  // confusing somebody.
  const syncTemporary = /^(?:state\.json|held\.jsonl|discarded\.jsonl)\.tmp-\d+-\d+$/;
  const list = async (dir: string, keep: (name: string) => boolean): Promise<string[]> => {
    try {
      return (await fs.readdir(dir)).filter(keep);
    } catch (error) {
      if (hasCode(error, "ENOENT") || hasCode(error, "ENOTDIR")) {
        return [];
      }
      throw error;
    }
  };
  const orphans = async (): Promise<string[]> => [
    ...(await list(folder, (name) => name.startsWith(prefix))),
    ...(await list(join(folder, "sync"), (name) => syncTemporary.test(name))).map((name) =>
      join("sync", name),
    ),
  ];
  if ((await orphans()).length === 0) {
    return [];
  }
  try {
    return await withFolderLock(folder, async () => {
      const found = await orphans();
      for (const name of found) {
        await fs.rm(join(folder, name), { force: true });
      }
      return found;
    });
  } catch (error) {
    if (error instanceof LedgerLockedError) {
      return [];
    }
    throw error;
  }
};
