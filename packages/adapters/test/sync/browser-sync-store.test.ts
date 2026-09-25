// The web's store of sync state (plan §5 and §6; V3): keys of their own in the
// `ledger` store, step 6 in **one** read-write transaction with
// `durability: "strict"`, all of it or nothing.

import { ArchiveExistsError, ConflictError } from "@atlas/domain";
import {
  holdRecords,
  markerFor,
  parseHeld,
  serializeMarker,
  unresolvedHeld,
} from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { BlobLedgerStore } from "../../src/ledger-store/blob.js";
import { LEDGER_STORE } from "../../src/ledger-store/browser/idb.js";
import {
  BrowserLedgerBlob,
  CURRENT_KEY,
  META_KEY,
} from "../../src/ledger-store/browser/indexeddb.js";
import { IMPORTED_PRICES_KEY } from "../../src/ledger-store/browser/prices.js";
import { IMPORTED_HISTORY_KEY } from "../../src/ledger-store/browser/reference.js";
import {
  BrowserSyncStore,
  browserSyncPresence,
  SYNC_DISCARDED_KEY,
  SYNC_HELD_KEY,
  SYNC_STATE_KEY,
} from "../../src/ledger-store/browser/sync-store.js";
import { initialiseRemote, syncDevice } from "../../src/sync/client.js";
import { Builder, base, linesOf } from "./builder.js";
import { clock, webDevice } from "./devices.js";
import { SimulatedBucket } from "./simulated-remote.js";

describe("the keys of the sync in the browser", () => {
  it("never collide with the keys the other adapters write", async () => {
    const web = webDevice(base());
    // An archive written by the store of the ledger, to read its key off it.
    const ledger = new BlobLedgerStore(new BrowserLedgerBlob(web.open));
    await ledger.replace([], (await ledger.load()).etag, "x.jsonl");
    const archiveKeys = [...web.db.store(LEDGER_STORE).keys()].filter((key) => key !== CURRENT_KEY);
    expect(archiveKeys).toEqual(["archive/x.jsonl"]);
    const others = [CURRENT_KEY, META_KEY, IMPORTED_PRICES_KEY, IMPORTED_HISTORY_KEY];
    for (const key of [SYNC_STATE_KEY, SYNC_HELD_KEY, SYNC_DISCARDED_KEY]) {
      expect(others).not.toContain(key);
      expect(key.startsWith("archive/")).toBe(false);
    }
  });

  it("say whether the browser is synced: no key, a marker missing, unreadable or read", async () => {
    const web = webDevice(base());
    const values = web.db.store(LEDGER_STORE);
    expect(await browserSyncPresence(web.open)).toEqual({ present: false });
    values.set(SYNC_HELD_KEY, "");
    expect(await browserSyncPresence(web.open)).toEqual({ present: true, marker: "missing" });
    values.set(SYNC_STATE_KEY, "{");
    expect(await browserSyncPresence(web.open)).toEqual({ present: true, marker: "unreadable" });
    const marker = markerFor([], 0);
    values.set(SYNC_STATE_KEY, serializeMarker(marker));
    expect(await browserSyncPresence(web.open)).toEqual({ present: true, marker });
  });
});

describe("step 6 in the browser", () => {
  const scenario = async () => {
    const shared = base();
    const bucket = SimulatedBucket.inMemory();
    const options = clock();
    const web = webDevice(shared);
    await initialiseRemote(web.sync, bucket.as("web"), options);
    const mine = new Builder(100);
    const sale = mine.trade("sell", "8", "2027-06-10");
    const after = mine.deposit("30");
    await web.record([sale, after]);
    await bucket.appendRaw(linesOf([new Builder(200).trade("sell", "5", "2027-06-09")]));
    return { bucket, options, web, sale, after };
  };

  it("is one read-write transaction with strict durability, and holds back, moves and marks in it", async () => {
    const { bucket, options, web, sale, after } = await scenario();
    const created = web.db.created.length;
    const outcome = await syncDevice(web.sync, bucket.as("web"), options);
    expect(outcome).toMatchObject({
      status: "synced",
      held: { code: "domain_rejected" },
      pending: 1,
    });
    const writes = web.db.created
      .map((mode, index) => [mode, web.db.durability[index]])
      .slice(created)
      .filter(([mode]) => mode === "readwrite");
    expect(writes).toEqual([["readwrite", "strict"]]);
    const commit = web.db.commits[web.db.commits.length - 1];
    expect(commit?.written.sort()).toEqual(
      [
        CURRENT_KEY,
        SYNC_HELD_KEY,
        SYNC_STATE_KEY,
        expect.stringMatching(/^archive\/pre-sync-/),
      ].sort(),
    );
    const held = unresolvedHeld(parseHeld(await web.held())).flatMap((unit) => unit.lines);
    expect(held).toEqual(linesOf([sale]));
    expect(await web.text()).toBe(`${await bucket.text()}${linesOf([after])[0]}\n`);
  });

  it("writes nothing when the ledger, the held lines, the discarded ones or the marker changed", async () => {
    const { web } = await scenario();
    for (const key of [CURRENT_KEY, SYNC_HELD_KEY, SYNC_DISCARDED_KEY, SYNC_STATE_KEY]) {
      const state = await web.sync.read();
      const values = web.db.store(LEDGER_STORE);
      const before = new Map(values);
      values.set(key, key === CURRENT_KEY ? { text: "", updatedAt: "x" } : "changed");
      const changed = new Map(values);
      await expect(
        web.sync.commit(state, { marker: markerFor([], 0), held: [] }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(new Map(values)).toEqual(changed);
      values.clear();
      for (const [k, v] of before) {
        values.set(k, v);
      }
    }
  });

  it("only ever appends to what is held back", async () => {
    const web = webDevice(base());
    const first = holdRecords(["a"], "client", { code: "x", details: {} }, "t");
    const second = holdRecords(["b"], "client", { code: "y", details: {} }, "t");
    await web.sync.commit(await web.sync.read(), { held: first });
    await web.sync.commit(await web.sync.read(), { held: second });
    expect(parseHeld(await web.held())).toEqual([...first, ...second]);
  });

  it("refuses an archive name that is not a plain file name, writing nothing", async () => {
    const { web } = await scenario();
    const state = await web.sync.read();
    const before = new Map(web.db.store(LEDGER_STORE));
    for (const bad of ["", "a/b.jsonl", "a\\b.jsonl"]) {
      await expect(
        web.sync.commit(state, { ledger: { replace: [], archive: bad }, marker: markerFor([], 0) }),
      ).rejects.toMatchObject({ code: "invalid_archive_name" });
    }
    expect(new Map(web.db.store(LEDGER_STORE))).toEqual(before);
  });

  it("writes nothing at all when its archive already exists", async () => {
    const { web } = await scenario();
    const state = await web.sync.read();
    web.db.store(LEDGER_STORE).set("archive/taken.jsonl", { text: "" });
    const before = new Map(web.db.store(LEDGER_STORE));
    await expect(
      web.sync.commit(state, {
        held: [],
        ledger: { replace: state.ledger.lines.slice(0, 1), archive: "taken.jsonl" },
        marker: markerFor([], 0),
      }),
    ).rejects.toBeInstanceOf(ArchiveExistsError);
    expect(new Map(web.db.store(LEDGER_STORE))).toEqual(before);
  });
});
