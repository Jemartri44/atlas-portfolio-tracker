// The IndexedDB store of the web, over a double of IndexedDB (feature 012,
// block 0). The port contract first, then the three windows the block closes:
// compare and write in one transaction, the export date written with the text
// it exported, and an import that does not inherit the date of the ledger it
// replaces. Each case names the mutant of prompt 012 §5 it kills.

import { ConflictError, sha256Hex } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { BlobLedgerStore } from "../src/ledger-store/blob.js";
import { LEDGER_STORE } from "../src/ledger-store/browser/idb.js";
import { BrowserLedgerBlob, type StoredLedger } from "../src/ledger-store/browser/indexeddb.js";
import { FakeDatabase } from "./fake-idb.js";
import { account, deposit, lineOf } from "./fixtures.js";
import { ledgerStoreContract } from "./ledger-store.contract.js";

const textOf = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join("");

const browser = (text?: string, extra: Partial<StoredLedger> = {}) => {
  const db = new FakeDatabase([LEDGER_STORE]);
  if (text !== undefined) {
    db.store(LEDGER_STORE).set("current", {
      text,
      updatedAt: "2026-09-01T00:00:00.000Z",
      ...extra,
    });
  }
  const blob = new BrowserLedgerBlob(() => Promise.resolve(db.asIdb()));
  return { db, blob, store: new BlobLedgerStore(blob) };
};

const other = { ...deposit, id: "01ARYZ6S41TSV4RRFFQ69G5FA2" };

ledgerStoreContract("browser (IndexedDB double)", (lines) =>
  Promise.resolve(browser(textOf(lines)).store),
);

describe("BrowserLedgerBlob", () => {
  it("reads nothing as an empty ledger and creates it on the first append", async () => {
    const { blob, store } = browser();
    expect(await blob.exists()).toBe(false);
    expect(await blob.text()).toBe("");
    await store.append([account], (await store.load()).etag);
    expect(await blob.text()).toBe(`${lineOf(account)}\n`);
    expect(await blob.exists()).toBe(true);
  });

  it("loses no line when two tabs append on the same etag (mutant 3: two transactions)", async () => {
    const { store, blob } = browser(`${lineOf(account)}\n`);
    const { etag } = await store.load();
    const outcomes = await Promise.allSettled([
      store.append([deposit], etag),
      store.append([other], etag),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const lost = outcomes.find((outcome) => outcome.status === "rejected");
    expect((lost as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    expect((await blob.text()).split("\n")).toHaveLength(3);
  });

  it("reads, compares and writes in one read-write transaction, whatever it writes (mutants 3 and 24)", async () => {
    const { store, blob, db } = browser(`${lineOf(account)}\n`);
    const { etag } = await store.load();
    const count = async (action: () => Promise<unknown>): Promise<IDBTransactionMode[]> => {
      const from = db.created.length;
      await action();
      return db.created.slice(from);
    };
    expect(await count(() => store.append([deposit], etag))).toEqual(["readwrite"]);
    const next = (await store.load()).etag;
    expect(await count(() => store.replace([account], next, "a.jsonl"))).toEqual(["readwrite"]);
    expect(await count(() => blob.exportText(new Date()))).toEqual(["readwrite"]);
    expect(await count(() => blob.replaceText(""))).toEqual(["readwrite"]);
  });

  it("writes nothing when the archive already exists or the production fails", async () => {
    const { store, blob, db } = browser(`${lineOf(account)}\n`);
    const { etag } = await store.load();
    const next = await store.replace([account, deposit], etag, "a.jsonl");
    await expect(store.replace([account], next.etag, "a.jsonl")).rejects.toMatchObject({
      code: "archive_exists",
    });
    expect(await blob.text()).toBe(`${lineOf(account)}\n${lineOf(deposit)}\n`);
    expect(db.store(LEDGER_STORE).get("archive/a.jsonl")).toMatchObject({
      text: `${lineOf(account)}\n`,
    });
    await expect(
      blob.update(next.etag, () => {
        throw new Error("fallo al componer");
      }),
    ).rejects.toThrow("fallo al componer");
    expect(await blob.text()).toBe(`${lineOf(account)}\n${lineOf(deposit)}\n`);
  });

  it("records the export date with the very text it exported, and only the date (mutant 24)", async () => {
    for (const exportFirst of [true, false]) {
      const { store, blob, db } = browser(`${lineOf(account)}\n`);
      const { etag } = await store.load();
      const when = new Date("2026-09-24T10:00:00.000Z");
      const exported = exportFirst
        ? (await Promise.all([blob.exportText(when), store.append([deposit], etag)]))[0]
        : (await Promise.all([store.append([deposit], etag), blob.exportText(when)]))[1];
      // The line recorded meanwhile is still there: the export put nothing back.
      expect(await blob.text()).toBe(`${lineOf(account)}\n${lineOf(deposit)}\n`);
      const marked = db.commits.filter((commit) => commit.written.includes("current:meta"));
      expect(marked).toHaveLength(1);
      const commit = marked[0] as (typeof marked)[number];
      // Only the date was written…
      expect(commit.written).toEqual(["current:meta"]);
      // …and, at the moment it was, the ledger was exactly what was handed over.
      expect((commit.snapshot.get("current") as StoredLedger).text).toBe(exported);
      expect(commit.snapshot.get("current:meta")).toEqual({
        lastExportAt: when.toISOString(),
        exportedEtag: sha256Hex(new TextEncoder().encode(exported)),
      });
      expect(await blob.lastExportAt()).toBe(when.toISOString());
    }
  });

  it("does not mark an export of nothing", async () => {
    const { blob, db } = browser();
    expect(await blob.exportText(new Date())).toBe("");
    expect(db.commits).toEqual([]);
    expect(await blob.lastExportAt()).toBeUndefined();
  });

  it("does not inherit the export date of the ledger an import replaces (D4)", async () => {
    const { blob } = browser(`${lineOf(account)}\n`);
    await blob.exportText(new Date("2026-09-20T10:00:00.000Z"));
    expect(await blob.lastExportAt()).toBe("2026-09-20T10:00:00.000Z");
    await blob.replaceText(`${lineOf(deposit)}\n`);
    expect(await blob.text()).toBe(`${lineOf(deposit)}\n`);
    expect(await blob.lastExportAt()).toBeUndefined();
  });

  it("still reads, and keeps, the export date a record carried before feature 012", async () => {
    const { blob, store } = browser(`${lineOf(account)}\n`, {
      lastExportAt: "2026-09-01T09:00:00.000Z",
    });
    expect(await blob.lastExportAt()).toBe("2026-09-01T09:00:00.000Z");
    await store.append([deposit], (await store.load()).etag);
    expect(await blob.lastExportAt()).toBe("2026-09-01T09:00:00.000Z");
    await blob.replaceText("");
    expect(await blob.lastExportAt()).toBeUndefined();
  });
});
