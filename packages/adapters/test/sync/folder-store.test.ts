// The console's store of sync state (plan §5 and §6): what it reads, one hold
// of the lock for the whole of step 6, what is held back on disk before the
// ledger loses the line (V9), and every cut between two writes leaving every
// line at least in one place.

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ConflictError } from "@atlas/domain";
import {
  linesOfText,
  markerFor,
  parseHeld,
  serializeMarker,
  unresolvedHeld,
} from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { LOCK_FILE } from "../../src/ledger-store/folder-lock.js";
import { initialiseRemote, syncDevice } from "../../src/sync/client.js";
import { folderSyncPresence } from "../../src/sync/folder-store.js";
import { Builder, base, linesOf } from "./builder.js";
import { clock, consoleDevice } from "./devices.js";
import { recording } from "./recording-ops.js";
import { SimulatedBucket } from "./simulated-remote.js";

describe("what sync/ of a folder says", () => {
  it("absent, a marker missing, unreadable or read", async () => {
    const device = await consoleDevice(base());
    expect((await folderSyncPresence(device.dir)).presence).toEqual({ present: false });
    await mkdir(join(device.dir, "sync"));
    expect((await folderSyncPresence(device.dir)).presence).toEqual({
      present: true,
      marker: "missing",
    });
    await writeFile(join(device.dir, "sync", "state.json"), "{");
    expect((await folderSyncPresence(device.dir)).presence).toEqual({
      present: true,
      marker: "unreadable",
    });
    const marker = markerFor([], 0);
    await writeFile(join(device.dir, "sync", "state.json"), serializeMarker(marker));
    expect(await folderSyncPresence(device.dir)).toEqual({
      presence: { present: true, marker },
      markerText: serializeMarker(marker),
    });
    await rm(join(device.dir, "sync"), { recursive: true });
    await writeFile(join(device.dir, "sync"), "not a folder");
    expect((await folderSyncPresence(device.dir)).presence).toEqual({ present: false });
  });
});

/**
 * A console over one remote holds back a sale the remote no longer covers,
 * while a foreign line arrives: step 6 writes what is held back, **replaces**
 * the ledger (lines move) and writes the marker.
 */
const heldScenario = async () => {
  const shared = base();
  const bucket = SimulatedBucket.inMemory();
  const options = clock();
  let rec: ReturnType<typeof recording> | undefined;
  const device = await consoleDevice(shared, (dir) => {
    rec = recording(dir);
    return rec.ops;
  });
  await initialiseRemote(device.sync, bucket.as("cli"), options);
  const mine = new Builder(100);
  const sale = mine.trade("sell", "8", "2027-06-10");
  const after = mine.deposit("30");
  await device.record([sale, after]);
  const foreign = new Builder(200).trade("sell", "5", "2027-06-09");
  await bucket.appendRaw(linesOf([foreign]));
  return {
    shared,
    bucket,
    options,
    device,
    rec: rec as ReturnType<typeof recording>,
    sale,
    after,
    foreign,
  };
};

describe("step 6 in the console", () => {
  it("syncs what is held back to disk before the ledger loses the line, all under the lock (V9)", async () => {
    const { bucket, options, device, rec } = await heldScenario();
    rec.log.length = 0;
    const outcome = await syncDevice(device.sync, bucket.as("cli"), options);
    expect(outcome).toMatchObject({
      status: "synced",
      held: { code: "domain_rejected" },
      pending: 1,
    });
    const heldSync = rec.log.indexOf("sync sync/held.jsonl.tmp");
    const ledgerOpen = rec.log.findIndex((entry) => entry.startsWith("open ledger.jsonl.tmp"));
    expect(heldSync).toBeGreaterThanOrEqual(0);
    expect(ledgerOpen).toBeGreaterThan(heldSync);
    expect(rec.log.indexOf("syncDir sync")).toBeLessThan(ledgerOpen);
    // Every write of the sequence ran with our lock on the folder.
    const writes = rec.log.filter(
      (entry) => entry.startsWith("open") || entry.startsWith("rename"),
    );
    expect(writes.length).toBeGreaterThan(5);
    expect(writes.filter((entry) => !entry.endsWith(" locked"))).toEqual([]);
  });

  it("never calls the remote with the lock of the folder taken", async () => {
    const { bucket, options, device } = await heldScenario();
    const calls: string[] = [];
    bucket.onCall = async (what) => {
      calls.push(what);
      const held = await stat(join(device.dir, LOCK_FILE)).then(
        () => true,
        () => false,
      );
      if (held) {
        throw new Error(`the remote was called (${what}) with the folder locked`);
      }
    };
    expect(await syncDevice(device.sync, bucket.as("cli"), options)).toMatchObject({
      status: "synced",
    });
    expect(calls).toEqual(["read", "read", "publish"]);
  });

  it("writes nothing when anything read at step 1 changed", async () => {
    const device = await consoleDevice(base());
    for (const change of [
      async () => device.record([new Builder(300).deposit("1")]),
      async () => writeFile(join(device.dir, "sync", "held.jsonl"), "x"),
      async () => writeFile(join(device.dir, "sync", "discarded.jsonl"), "x"),
      async () => writeFile(join(device.dir, "sync", "state.json"), "{}"),
    ]) {
      await mkdir(join(device.dir, "sync"), { recursive: true });
      const state = await device.sync.read();
      await change();
      const before = await device.text();
      await expect(device.sync.commit(state, { marker: markerFor([], 0) })).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(await device.text()).toBe(before);
      await rm(join(device.dir, "sync"), { recursive: true, force: true });
    }
  });

  /**
   * A cut between each two writes of step 6, and one inside the rewrite of
   * the ledger (after its archive, before its rename): after it, the next
   * sync ends with every line in the remote, in the ledger or held back —
   * never nowhere —, a line held back not in the ledger, and nothing twice.
   */
  it.each([
    ["before what is held back", /^open sync\/held\.jsonl\.tmp/],
    ["between what is held back and the ledger", /^open ledger\.jsonl\.tmp/],
    [
      "inside the rewrite of the ledger, after its archive",
      /^rename ledger\.jsonl\.tmp -> ledger\.jsonl/,
    ],
    ["between the ledger and the marker", /^open sync\/state\.json\.tmp/],
  ])("loses no line with a cut %s", async (_where, pattern) => {
    const { shared, bucket, options, device, rec, sale, after, foreign } = await heldScenario();
    rec.failAt(pattern);
    await expect(syncDevice(device.sync, bucket.as("cli"), options)).rejects.toThrow(/cut at/);
    // The next sync, without cuts.
    const outcome = await syncDevice(device.sync, bucket.as("cli"), options);
    expect(outcome.status).toBe("synced");
    const remote = linesOfText(await bucket.text());
    const local = linesOfText(await device.text());
    const held = unresolvedHeld(parseHeld(await device.held())).flatMap((unit) => unit.lines);
    for (const line of linesOf([...shared, sale, after, foreign])) {
      expect([...remote, ...local, ...held].includes(line), line).toBe(true);
    }
    const saleLine = linesOf([sale])[0] as string;
    expect(held).toEqual([saleLine]);
    expect(local.includes(saleLine)).toBe(false);
    expect(local).toEqual([...remote, ...linesOf([after])]);
    expect(new Set(local).size).toBe(local.length);
  });
});
