// The IndexedDB store of the web, over a double of IndexedDB (feature 012,
// block 0). The port contract first, then the three windows the block closes:
// compare and write in one transaction, the export date written with the text
// it exported, and an import that does not inherit the date of the ledger it
// replaces. Each case names the mutant of prompt 012 §5 it kills.

import { ConflictError } from "@atlas/domain";
import type { PendingDraft } from "@atlas/domain/ecb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlobLedgerStore } from "../src/ledger-store/blob.js";
import { BrowserDraftStore } from "../src/ledger-store/browser/drafts.js";
import { DRAFT_STORE, LEDGER_STORE } from "../src/ledger-store/browser/idb.js";
import { BrowserLedgerBlob, type StoredLedger } from "../src/ledger-store/browser/indexeddb.js";
import {
  etagOfText,
  exportLedgerText,
  LedgerChangedSinceAsked,
  replaceLedgerText,
} from "../src/ledger-store/browser/transfer.js";
import { FakeDatabase, FakeIdbFactory } from "./fake-idb.js";
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
  const open = () => Promise.resolve(db.asIdb());
  const blob = new BrowserLedgerBlob(open);
  return {
    db,
    blob,
    store: new BlobLedgerStore(blob),
    exportText: (when: Date) => exportLedgerText(when, open),
    /** An import confirmed on the ledger as it is now. */
    replaceText: async (next: string) =>
      replaceLedgerText(next, etagOfText(await blob.text()), open),
    replaceAsked: (next: string, etag: string) => replaceLedgerText(next, etag, open),
  };
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
    const { store, db, exportText, replaceAsked } = browser(`${lineOf(account)}\n`);
    const { etag } = await store.load();
    const count = async (action: () => Promise<unknown>): Promise<IDBTransactionMode[]> => {
      const from = db.created.length;
      await action();
      return db.created.slice(from);
    };
    expect(await count(() => store.append([deposit], etag))).toEqual(["readwrite"]);
    const next = (await store.load()).etag;
    expect(await count(() => store.replace([account], next, "a.jsonl"))).toEqual(["readwrite"]);
    expect(await count(() => exportText(new Date()))).toEqual(["readwrite"]);
    const now = etagOfText(`${lineOf(account)}\n`);
    expect(await count(() => replaceAsked("", now))).toEqual(["readwrite"]);
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
      const { store, blob, db, exportText } = browser(`${lineOf(account)}\n`);
      const { etag } = await store.load();
      const when = new Date("2026-09-24T10:00:00.000Z");
      const exported = exportFirst
        ? (await Promise.all([exportText(when), store.append([deposit], etag)]))[0]
        : (await Promise.all([store.append([deposit], etag), exportText(when)]))[1];
      // The line recorded meanwhile is still there: the export put nothing back.
      expect(await blob.text()).toBe(`${lineOf(account)}\n${lineOf(deposit)}\n`);
      const marked = db.commits.filter((commit) => commit.written.includes("current:meta"));
      expect(marked).toHaveLength(1);
      const commit = marked[0] as (typeof marked)[number];
      // Only the date was written…
      expect(commit.written).toEqual(["current:meta"]);
      // …and, at the moment it was, the ledger was exactly what was handed over.
      expect((commit.snapshot.get("current") as StoredLedger).text).toBe(exported);
      expect(commit.snapshot.get("current:meta")).toEqual({ lastExportAt: when.toISOString() });
      expect(await blob.lastExportAt()).toBe(when.toISOString());
    }
  });

  it("does not mark an export of nothing", async () => {
    const { blob, db, exportText } = browser();
    expect(await exportText(new Date())).toBe("");
    expect(db.commits).toEqual([]);
    expect(await blob.lastExportAt()).toBeUndefined();
  });

  it("does not inherit the export date of the ledger an import replaces (D4)", async () => {
    const { blob, exportText, replaceText } = browser(`${lineOf(account)}\n`);
    await exportText(new Date("2026-09-20T10:00:00.000Z"));
    expect(await blob.lastExportAt()).toBe("2026-09-20T10:00:00.000Z");
    await replaceText(`${lineOf(deposit)}\n`);
    expect(await blob.text()).toBe(`${lineOf(deposit)}\n`);
    expect(await blob.lastExportAt()).toBeUndefined();
  });

  it("still reads, and keeps, the export date a record carried before feature 012", async () => {
    const { blob, store, replaceText } = browser(`${lineOf(account)}\n`, {
      lastExportAt: "2026-09-01T09:00:00.000Z",
    });
    expect(await blob.lastExportAt()).toBe("2026-09-01T09:00:00.000Z");
    await store.append([deposit], (await store.load()).etag);
    expect(await blob.lastExportAt()).toBe("2026-09-01T09:00:00.000Z");
    await replaceText("");
    expect(await blob.lastExportAt()).toBeUndefined();
  });

  it("refuses an import if the ledger changed between the question and the yes (review of PR #75)", async () => {
    const { blob, store, replaceAsked } = browser(`${lineOf(account)}\n`);
    // Asked on the ledger of one line…
    const asked = etagOfText(await blob.text());
    // …another tab records one more before the yes.
    await store.append([deposit], (await store.load()).etag);
    const refusal = await replaceAsked(`${lineOf(other)}\n`, asked).catch(
      (error: unknown) => error,
    );
    expect(refusal).toBeInstanceOf(LedgerChangedSinceAsked);
    expect((refusal as LedgerChangedSinceAsked).lines).toBe(2);
    // Nothing replaced: the line of the other tab is still there.
    expect(await blob.text()).toBe(`${lineOf(account)}\n${lineOf(deposit)}\n`);
  });
});

const draftOf = (id: string): PendingDraft => ({
  draft_format: 1,
  id,
  saved_at: "2026-04-01T10:00:00.000Z",
  event: { type: "buy", currency: "USD", trade_date: "2026-04-01" },
});

describe("BrowserDraftStore (feature 012, block 5)", () => {
  const drafts = () => {
    const db = new FakeDatabase([LEDGER_STORE, DRAFT_STORE]);
    return { db, store: new BrowserDraftStore(() => Promise.resolve(db.asIdb())) };
  };
  const first = "01K00000000000000000000001";
  const second = "01K00000000000000000000002";

  it("saves, lists in the order they were saved and removes, apart from the ledger", async () => {
    const { db, store } = drafts();
    expect(await store.list()).toEqual({ drafts: [], unreadable: [] });
    await store.save(draftOf(second));
    await store.save(draftOf(first));
    expect((await store.list()).drafts.map((draft) => draft.id)).toEqual([first, second]);
    await store.remove(first);
    expect((await store.list()).drafts.map((draft) => draft.id)).toEqual([second]);
    // Nothing of it reaches the ledger's store.
    expect(db.store(LEDGER_STORE).size).toBe(0);
  });

  it("never overwrites a draft with the same id", async () => {
    const { store } = drafts();
    await store.save(draftOf(first));
    await expect(store.save({ ...draftOf(first), saved_at: "later" })).rejects.toBeDefined();
    expect((await store.list()).drafts[0]?.saved_at).toBe("2026-04-01T10:00:00.000Z");
  });

  it("writes a draft again with the id its confirmation stamped (second review of PR #75)", async () => {
    const { store } = drafts();
    await store.save(draftOf(first));
    await store.update({ ...draftOf(first), pending_event_id: second });
    expect((await store.list()).drafts).toEqual([{ ...draftOf(first), pending_event_id: second }]);
  });

  it("names the records it cannot read", async () => {
    const { db, store } = drafts();
    db.store(DRAFT_STORE).set(first, "{");
    db.store(DRAFT_STORE).set(second, JSON.stringify(draftOf(first)));
    expect(await store.list()).toEqual({ drafts: [], unreadable: [first, second] });
  });
});

describe("openAtlasDb, version 2", () => {
  const holder = globalThis as { indexedDB?: unknown };
  afterEach(() => {
    delete holder.indexedDB;
    vi.resetModules();
  });

  it("adds the drafts store to a database of version 1 and keeps its ledger", async () => {
    const factory = new FakeIdbFactory();
    const old = new FakeDatabase([LEDGER_STORE, "handles"]);
    old.store(LEDGER_STORE).set("current", { text: "x", updatedAt: "2026-09-01" });
    factory.databases.set("atlas", old);
    factory.versions.set("atlas", 1);
    holder.indexedDB = factory;
    vi.resetModules();
    const { openAtlasDb } = await import("../src/ledger-store/browser/idb.js");
    await openAtlasDb();
    expect(old.objectStoreNames.contains(DRAFT_STORE)).toBe(true);
    expect(old.store(LEDGER_STORE).get("current")).toEqual({ text: "x", updatedAt: "2026-09-01" });
    expect(factory.versions.get("atlas")).toBe(2);
  });

  it("says another tab blocks the upgrade, not that the browser keeps no data", async () => {
    const factory = new FakeIdbFactory();
    factory.databases.set("atlas", new FakeDatabase([LEDGER_STORE, "handles"]));
    factory.versions.set("atlas", 1);
    factory.blocked = true;
    holder.indexedDB = factory;
    vi.resetModules();
    const idb = await import("../src/ledger-store/browser/idb.js");
    const failure = await idb.openAtlasDb().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(idb.StorageUnavailable);
    expect((failure as Error).cause).toBe(idb.BLOCKED);
    // Once the other tab is gone, the next attempt opens it.
    factory.blocked = false;
    await expect(idb.openAtlasDb()).resolves.toBeDefined();
  });
});
