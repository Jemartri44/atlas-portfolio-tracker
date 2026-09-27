// Feature 015, E3, block 4 (§7 P16; §7.1 bis, N4): `sync/remote.json` is
// written by initialising and by joining, **in the same hold of the lock as
// the marker and before it** — the identity of the destination first, the
// proof of arriving last. A cut between the two leaves «remote.json without
// a marker» (S1), which is failsafe and recognised; never a marker that does
// not know its remote.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ConflictError } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { LEDGER_STORE } from "../../src/ledger-store/browser/idb.js";
import { SYNC_DEVICE_KEY, SYNC_STATE_KEY } from "../../src/ledger-store/browser/sync-store.js";
import { sweepOrphanTemporaries } from "../../src/ledger-store/folder-lock.js";
import { initialiseRemote, joinWithOwnLines, replaceFromRemote } from "../../src/sync/client.js";
import { REMOTE_FILE } from "../../src/sync/folder-store.js";
import { base } from "./builder.js";
import { clock, consoleDevice, webDevice } from "./devices.js";
import { recording } from "./recording-ops.js";
import { SimulatedBucket } from "./simulated-remote.js";

const REMOTE =
  '{"format":1,"origin":"https://atlas.example","device_id":"DDDDDDDDDDDDDDDDDDDDDD"}\n';

describe("sync/remote.json in the one write of initialising and joining (P16)", () => {
  it("is written first and the marker last, both holding the lock", async () => {
    for (const run of ["init", "join", "own"] as const) {
      const bucket = SimulatedBucket.inMemory();
      const options = clock();
      if (run !== "init") {
        const first = await consoleDevice(base());
        await initialiseRemote(first.sync, bucket.as("first"), options);
      }
      let log: string[] = [];
      const device = await consoleDevice(base(), (dir) => {
        const rec = recording(dir);
        log = rec.log;
        return rec.ops;
      });
      const withRemote = { ...options, remoteJson: REMOTE };
      if (run === "init") {
        await initialiseRemote(device.sync, bucket.as("dev"), withRemote);
      } else if (run === "join") {
        await replaceFromRemote(device.sync, bucket.as("dev"), withRemote, "join");
      } else {
        await joinWithOwnLines(device.sync, bucket.as("dev"), withRemote);
      }
      expect(await readFile(join(device.dir, REMOTE_FILE), "utf8"), run).toBe(REMOTE);
      const renames = log.filter((entry) => entry.startsWith("rename "));
      const remoteAt = renames.findIndex((entry) => entry.includes("sync/remote.json.tmp"));
      const markerAt = renames.findIndex((entry) => entry.includes("sync/state.json.tmp"));
      expect(remoteAt, run).toBe(0);
      expect(markerAt, run).toBe(renames.length - 1);
      expect(
        renames.every((entry) => entry.endsWith(" locked")),
        run,
      ).toBe(true);
    }
  });

  it("leaves remote.json without a marker when cut between the two, never the other way", async () => {
    const bucket = SimulatedBucket.inMemory();
    const options = clock();
    let fail: (pattern: RegExp) => void = () => undefined;
    const device = await consoleDevice(base(), (dir) => {
      const rec = recording(dir);
      fail = rec.failAt;
      return rec.ops;
    });
    fail(/^open sync\/state\.json\.tmp/);
    await expect(
      initialiseRemote(device.sync, bucket.as("dev"), { ...options, remoteJson: REMOTE }),
    ).rejects.toThrow(/cut at/);
    expect(await readFile(join(device.dir, REMOTE_FILE), "utf8")).toBe(REMOTE);
    expect(await readdir(join(device.dir, "sync"))).not.toContain("state.json");
  });

  it("writes nothing when remote.json changed since it was read (another console)", async () => {
    const device = await consoleDevice(base());
    const read = await device.sync.read();
    await mkdir(join(device.dir, "sync"));
    await writeFile(join(device.dir, REMOTE_FILE), REMOTE);
    await expect(device.sync.commit(read, { remote: REMOTE })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(await readdir(join(device.dir, "sync"))).toEqual(["remote.json"]);
  });

  it("writes nothing of it without being asked: a sync never does", async () => {
    const bucket = SimulatedBucket.inMemory();
    const device = await consoleDevice(base());
    await initialiseRemote(device.sync, bucket.as("dev"), clock());
    expect(await readdir(join(device.dir, "sync"))).not.toContain("remote.json");
  });

  it("is kept by the web as the id of its device, in the same transaction as the marker (E4, block 2)", async () => {
    const bucket = SimulatedBucket.inMemory();
    const phone = webDevice(base());
    const device = "DDDDDDDDDDDDDDDDDDDDDD";
    const before = phone.db.commits.length;
    await initialiseRemote(phone.sync, bucket.as("phone"), { ...clock(), remoteJson: device });
    const values = phone.db.store(LEDGER_STORE);
    expect(values.get(SYNC_DEVICE_KEY)).toBe(device);
    const commits = phone.db.commits.slice(before);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.written.sort()).toEqual([SYNC_DEVICE_KEY, SYNC_STATE_KEY].sort());
    expect((await phone.sync.read()).remoteText).toBe(device);
  });

  it("is compared by the web at the write: changed in between, nothing is written", async () => {
    const phone = webDevice(base());
    const read = await phone.sync.read();
    phone.db.store(LEDGER_STORE).set(SYNC_DEVICE_KEY, "OTHEROTHEROTHEROTHEROT");
    await expect(
      phone.sync.commit(read, { remote: "DDDDDDDDDDDDDDDDDDDDDD" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(phone.db.store(LEDGER_STORE).get(SYNC_DEVICE_KEY)).toBe("OTHEROTHEROTHEROTHEROT");
  });

  it("makes a browser with only the id of its device half started (S1), never unsynced", async () => {
    const phone = webDevice(base());
    phone.db.store(LEDGER_STORE).set(SYNC_DEVICE_KEY, "DDDDDDDDDDDDDDDDDDDDDD");
    expect((await phone.sync.read()).presence).toEqual({ present: true, marker: "missing" });
  });

  it("is swept as a temporary when a write of it was cut (P16)", async () => {
    const device = await consoleDevice(base());
    await mkdir(join(device.dir, "sync"));
    await writeFile(join(device.dir, "sync", "remote.json.tmp-123-456"), "{");
    expect(await sweepOrphanTemporaries(join(device.dir, "ledger.jsonl"))).toEqual([
      join("sync", "remote.json.tmp-123-456"),
    ]);
  });
});
