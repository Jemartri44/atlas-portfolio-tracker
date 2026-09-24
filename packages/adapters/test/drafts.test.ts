// `drafts/` on the disk (feature 012, block 5): one file per draft, every write
// under the lock of the ledger folder (mutant 23 of prompt 012 §5).

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PendingDraft } from "@atlas/domain/ecb";
import { describe, expect, it } from "vitest";
import { DRAFTS_DIR, FileDraftStore } from "../src/drafts/file-drafts.js";
import { LedgerLockedError, LOCK_FILE, LockLostError } from "../src/ledger-store/folder-lock.js";

const folder = (): Promise<string> => mkdtemp(join(tmpdir(), "atlas-012-drafts-"));

const draftOf = (id: string): PendingDraft => ({
  draft_format: 1,
  id,
  saved_at: "2026-04-01T10:00:00.000Z",
  event: { type: "buy", currency: "USD", trade_date: "2026-04-01" },
});

const first = "01K00000000000000000000001";
const second = "01K00000000000000000000002";

const lockHeld = async (dir: string): Promise<void> => {
  await writeFile(
    join(dir, LOCK_FILE),
    `${JSON.stringify({ holder: "cli", token: "other", since: "2026-04-01T10:00:00.000Z" })}\n`,
  );
};

describe("FileDraftStore", () => {
  it("lists nothing when there is no folder of drafts", async () => {
    expect(await new FileDraftStore(await folder()).list()).toEqual({
      drafts: [],
      unreadable: [],
    });
  });

  it("saves one file per draft, lists them oldest first and removes them", async () => {
    const dir = await folder();
    const store = new FileDraftStore(dir);
    await store.save(draftOf(second));
    await store.save(draftOf(first));
    expect((await store.list()).drafts.map((draft) => draft.id)).toEqual([first, second]);
    expect(JSON.parse(await readFile(join(dir, DRAFTS_DIR, `${first}.json`), "utf8"))).toEqual(
      draftOf(first),
    );
    await store.remove(first);
    await store.remove(first); // already gone: not an error
    expect((await store.list()).drafts.map((draft) => draft.id)).toEqual([second]);
    // Nothing is left behind: no temporary file, no lock.
    expect(await readdir(join(dir, DRAFTS_DIR))).toEqual([`${second}.json`]);
    expect(await readdir(dir)).not.toContain(LOCK_FILE);
  });

  it("writes a draft again with the id its confirmation stamped (second review of PR #75)", async () => {
    const store = new FileDraftStore(await folder());
    await store.save(draftOf(first));
    await store.update({ ...draftOf(first), pending_event_id: second });
    expect((await store.list()).drafts).toEqual([{ ...draftOf(first), pending_event_id: second }]);
  });

  it("names the files it cannot read instead of skipping them", async () => {
    const dir = await folder();
    const store = new FileDraftStore(dir);
    await store.save(draftOf(first));
    await writeFile(join(dir, DRAFTS_DIR, `${second}.json`), "{");
    // A draft whose file name is not its id is not trusted either.
    const third = "01K00000000000000000000003";
    await writeFile(join(dir, DRAFTS_DIR, `${third}.json`), JSON.stringify(draftOf(first)));
    await writeFile(join(dir, DRAFTS_DIR, "notes.txt"), "not a draft");
    const listed = await store.list();
    expect(listed.drafts.map((draft) => draft.id)).toEqual([first]);
    expect(listed.unreadable).toEqual([`${second}.json`, `${third}.json`]);
  });

  it("writes nothing while another writer holds the lock (mutant 23)", async () => {
    const dir = await folder();
    const store = new FileDraftStore(dir);
    await store.save(draftOf(first));
    await lockHeld(dir);
    await expect(store.save(draftOf(second))).rejects.toBeInstanceOf(LedgerLockedError);
    await expect(store.remove(first)).rejects.toBeInstanceOf(LedgerLockedError);
    expect((await store.list()).drafts.map((draft) => draft.id)).toEqual([first]);
  });

  it("writes and removes nothing once its lock is no longer its own (review of PR #75)", async () => {
    const dir = await folder();
    // Somebody breaks the lock and takes it again, right before the commit.
    const stolen = new FileDraftStore(dir, {
      beforeCommit: async () => {
        await rm(join(dir, LOCK_FILE));
        await lockHeld(dir);
      },
    });
    await expect(stolen.save(draftOf(first))).rejects.toBeInstanceOf(LockLostError);
    expect(await new FileDraftStore(dir).list()).toEqual({ drafts: [], unreadable: [] });
    await rm(join(dir, LOCK_FILE));
    await new FileDraftStore(dir).save(draftOf(first));
    await expect(stolen.remove(first)).rejects.toBeInstanceOf(LockLostError);
    await rm(join(dir, LOCK_FILE));
    expect((await new FileDraftStore(dir).list()).drafts.map((draft) => draft.id)).toEqual([first]);
  });

  it("fails when the folder cannot be listed for another reason", async () => {
    const dir = await folder();
    await writeFile(join(dir, DRAFTS_DIR), "a file where the folder should be");
    await expect(new FileDraftStore(dir).list()).rejects.toMatchObject({ code: "ENOTDIR" });
  });
});
