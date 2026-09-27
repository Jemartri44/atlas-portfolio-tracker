// Feature 015, E3, block 5, point 6: an archive is never overwritten, and a
// write cut after archiving and repeated **within the same second** takes the
// next name (`-2` to `-9`), as `syncDevice` already did (`syncArchiveName`):
// confirming what is held, joining from the remote, downloading a rewritten
// remote again and joining with the own lines — the orders the user now has.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { LedgerEvent } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import {
  confirmHeldUnit,
  heldUnits,
  initialiseRemote,
  joinWithOwnLines,
  replaceFromRemote,
  syncDevice,
} from "../../src/sync/client.js";
import { Builder, base } from "./builder.js";
import { type ConsoleDevice, clock, consoleDevice } from "./devices.js";
import { type Recording, recording } from "./recording-ops.js";
import { SimulatedBucket } from "./simulated-remote.js";

/** A clock stopped on one second: the repeat takes the same name, unless it retries. */
const stopped = () => ({ ...clock(), now: () => new Date("2027-08-30T12:00:00.000Z") });

const withRecording = async (shared: readonly LedgerEvent[]) => {
  let rec: Recording | undefined;
  const device = await consoleDevice(shared, (dir) => {
    rec = recording(dir);
    return rec.ops;
  });
  return { device, rec: rec as Recording };
};

const archives = async (device: ConsoleDevice): Promise<string[]> =>
  (await readdir(join(device.dir, "archive")).catch(() => [] as string[])).sort();

/** Runs `run` cut right after its archive is written, then again in the same second. */
const cutThenRepeat = async (rec: Recording, run: () => Promise<unknown>): Promise<void> => {
  rec.failAt(/^rename ledger\.jsonl\.tmp/);
  await run().catch((error: unknown) => {
    if (!String(error).includes("cut at")) {
      throw error;
    }
  });
  rec.failAt(/^$never/);
  await run();
};

const twin = (b: Builder): LedgerEvent =>
  b.event("cash_deposit", {
    account_id: "acc_fund",
    value_date: "2027-01-11",
    amount: "50",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2027-01-11",
  });

describe("the name of the archive, repeated in the same second (point 6)", () => {
  it("confirming what is held takes the next name", async () => {
    const shared = base();
    const bucket = SimulatedBucket.inMemory();
    const options = clock();
    const one = await consoleDevice(shared);
    const { device: two, rec } = await withRecording(shared);
    await initialiseRemote(one.sync, bucket.as("one"), options);
    await replaceFromRemote(two.sync, bucket.as("two"), options, "join");
    await one.record([twin(new Builder(100))]);
    await syncDevice(one.sync, bucket.as("one"), options);
    await two.record([twin(new Builder(900)), new Builder(950).deposit("7")]);
    await syncDevice(two.sync, bucket.as("two"), options);
    const [view] = await heldUnits(two.sync, options);
    const before = await archives(two);
    await cutThenRepeat(rec, () => confirmHeldUnit(two.sync, view?.unit.unit as string, stopped()));
    const added = (await archives(two)).filter((name) => !before.includes(name));
    expect(added).toHaveLength(2);
    expect(added.some((name) => name.endsWith("-2.jsonl"))).toBe(true);
    expect(await heldUnits(two.sync, options)).toEqual([]);
  });

  it("joining from the remote and downloading it again take the next name", async () => {
    for (const how of ["join", "redownload"] as const) {
      const shared = base();
      const bucket = SimulatedBucket.inMemory();
      const options = clock();
      const one = await consoleDevice(shared);
      await initialiseRemote(one.sync, bucket.as("one"), options);
      const { device: two, rec } = await withRecording(shared);
      await two.record([new Builder(700).deposit("9")]);
      if (how === "redownload") {
        await replaceFromRemote(two.sync, bucket.as("two"), options, "join");
        await two.record([new Builder(800).deposit("11")]);
      }
      await cutThenRepeat(rec, () => replaceFromRemote(two.sync, bucket.as("two"), stopped(), how));
      const names = (await archives(two)).filter((name) => name.startsWith(`pre-${how}-`));
      expect(
        names.some((name) => name.endsWith("-2.jsonl")),
        how,
      ).toBe(true);
    }
  });

  it("joining with the own lines takes the next name", async () => {
    const shared = base();
    const bucket = SimulatedBucket.inMemory();
    const options = clock();
    const one = await consoleDevice(shared);
    await initialiseRemote(one.sync, bucket.as("one"), options);
    await one.record([new Builder(100).deposit("3")]);
    await syncDevice(one.sync, bucket.as("one"), options);
    const { device: two, rec } = await withRecording(shared);
    await two.record([new Builder(700).deposit("9")]);
    await cutThenRepeat(rec, () => joinWithOwnLines(two.sync, bucket.as("two"), stopped()));
    const names = (await archives(two)).filter((name) => name.startsWith("pre-join-"));
    expect(names.some((name) => name.endsWith("-2.jsonl"))).toBe(true);
  });
});
