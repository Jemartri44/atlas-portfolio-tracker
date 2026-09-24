// `drafts/` next to the ledger, on the disk (ADR-0029, point 9; block 5 of
// prompt 012): one file per draft, `drafts/<ULID>.json`, outside the ledger.
//
// **Every write goes under the lock of the ledger folder** (decision (t)): one
// lock for every write in the folder, the drafts included. A draft is written
// to a temporary name, synced and renamed, so it is never seen in half; the
// lock is checked as still ours right before the rename, as the ledger does.
//
// A file that cannot be read is **named**, not skipped in silence and not
// deleted: it may be the only copy of an operation.

import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  type PendingDraft,
  type PendingDraftStore,
  parsePendingDraft,
  serializePendingDraft,
} from "@atlas/domain/ecb";
import { withFolderLock } from "../ledger-store/folder-lock.js";

export const DRAFTS_DIR = "drafts";

const FILE = /^[0-9A-HJKMNP-TV-Z]{26}\.json$/;

const hasCode = (error: unknown, code: string): boolean =>
  (error as { code?: string }).code === code;

export class FileDraftStore implements PendingDraftStore {
  /** `folder` is the ledger's folder. */
  constructor(private readonly folder: string) {}

  private get dir(): string {
    return join(this.folder, DRAFTS_DIR);
  }

  async list(): Promise<{ drafts: PendingDraft[]; unreadable: string[] }> {
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch (error) {
      if (hasCode(error, "ENOENT")) {
        return { drafts: [], unreadable: [] };
      }
      throw error;
    }
    const drafts: PendingDraft[] = [];
    const unreadable: string[] = [];
    // A ULID sorts by time: the name order is the order they were saved in.
    for (const name of names.filter((entry) => FILE.test(entry)).sort()) {
      try {
        const draft = parsePendingDraft(await fs.readFile(join(this.dir, name), "utf8"));
        if (`${draft.id}.json` === name) {
          drafts.push(draft);
        } else {
          unreadable.push(name);
        }
      } catch {
        unreadable.push(name);
      }
    }
    return { drafts, unreadable };
  }

  save(draft: PendingDraft): Promise<void> {
    return withFolderLock(this.folder, async (lock) => {
      await fs.mkdir(this.dir, { recursive: true });
      const path = join(this.dir, `${draft.id}.json`);
      const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
      const handle = await fs.open(temporary, "wx");
      try {
        await handle.writeFile(serializePendingDraft(draft));
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await lock.assertOwned();
        await fs.rename(temporary, path);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    });
  }

  remove(id: string): Promise<void> {
    return withFolderLock(this.folder, async (lock) => {
      await lock.assertOwned();
      await fs.rm(join(this.dir, `${id}.json`), { force: true });
    });
  }
}
