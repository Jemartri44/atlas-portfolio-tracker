// What the console creates on disk is the owner's alone (audit of 03/11, finding 5): the ledger
// and the files beside it `600`, the folders it creates `700`. The mode asked for is what counts
// here, so the tests run with the umask of the process as it comes.

import { mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileLedgerStore } from "../src/ledger-store/file.js";
import { acquireFolderLock } from "../src/ledger-store/folder-lock.js";
import { account, deposit, lineOf } from "./fixtures.js";

const modeOf = async (path: string): Promise<number> => (await stat(path)).mode & 0o777;

describe("the files and folders of a local ledger", () => {
  it("creates the folder 700 and the ledger 600 on the first append", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-modes-"));
    const folder = join(root, "new", "ledger-folder");
    const store = new FileLedgerStore(join(folder, "ledger.jsonl"));
    const { etag } = await store.load();
    await store.appendLines([lineOf(account), lineOf(deposit)], etag);
    expect(await modeOf(folder)).toBe(0o700);
    expect(await modeOf(join(folder, "ledger.jsonl"))).toBe(0o600);
    expect((await readdir(folder)).filter((name) => name.includes(".tmp-"))).toEqual([]);
  });

  it("takes the lock of a folder that does not exist yet with the folder 700", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-modes-"));
    const folder = join(root, "locked-folder");
    const lock = await acquireFolderLock(folder);
    expect(await modeOf(folder)).toBe(0o700);
    await lock.release();
  });
});
