import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAFT_STORE, LEDGER_STORE } from "../src/ledger-store/browser/idb.js";
import { FakeDatabase, FakeIdbFactory } from "./fake-idb.js";

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
