// Resolving what is held back, cut at every write (review of PR #83, B1):
// the destination is written before the origin forgets the line, so a cut
// leaves it in two places, never in none — and repeating the resolution, or
// syncing, finishes it without duplicating anything.

import type { LedgerEvent } from "@atlas/domain";
import {
  holdRecords,
  linesOfText,
  parseDiscarded,
  parseHeld,
  unresolvedHeld,
} from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import {
  confirmHeldUnit,
  discardHeldUnit,
  finishRedo,
  heldUnits,
  initialiseRemote,
  replaceFromRemote,
  startRedo,
  syncDevice,
} from "../../src/sync/client.js";
import { Builder, base, linesOf } from "./builder.js";
import { clock, consoleDevice, type Device } from "./devices.js";
import { type Recording, recording } from "./recording-ops.js";
import { SimulatedBucket } from "./simulated-remote.js";

const twinDeposit = (b: Builder): LedgerEvent =>
  b.event("cash_deposit", {
    account_id: "acc_fund",
    value_date: "2027-01-11",
    amount: "50",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2027-01-11",
  });

/** A console holding a new duplicate back, with a line still pending behind it. */
const heldDuplicate = async () => {
  const shared = base();
  const bucket = SimulatedBucket.inMemory();
  const options = clock();
  const one = await consoleDevice(shared);
  let rec: Recording | undefined;
  const two = await consoleDevice(shared, (dir) => {
    rec = recording(dir);
    return rec.ops;
  });
  await initialiseRemote(one.sync, bucket.as("one"), options);
  await replaceFromRemote(two.sync, bucket.as("two"), options, "join");
  await one.record([twinDeposit(new Builder(100))]);
  await syncDevice(one.sync, bucket.as("one"), options);
  const twin = twinDeposit(new Builder(900));
  const later = new Builder(950).deposit("7");
  await two.record([twin, later]);
  expect(await syncDevice(two.sync, bucket.as("two"), options)).toMatchObject({
    held: { code: "new_duplicate" },
  });
  return {
    bucket,
    options,
    two,
    line: linesOf([twin])[0] as string,
    later: linesOf([later])[0] as string,
    rec: rec as Recording,
  };
};

const where = async (device: Device, line: string) => ({
  ledger: linesOfText(await device.text()).filter((entry) => entry === line).length,
  held: unresolvedHeld(parseHeld(await device.held())).some((unit) => unit.lines.includes(line)),
  discarded: parseDiscarded(await device.discarded()).filter((record) => record.line === line)
    .length,
});

const WRITES = [
  /^open sync\/held\.jsonl\.tmp/,
  /^open sync\/discarded\.jsonl\.tmp/,
  /^open archive\//,
  /^open ledger\.jsonl\.tmp/,
  /^rename ledger\.jsonl\.tmp/,
  /^open sync\/state\.json\.tmp/,
];

describe("confirming, cut at every write", () => {
  it.each(WRITES.map((pattern) => [String(pattern), pattern] as const))(
    "never loses the line with a cut at %s, and finishes it once repeated",
    async (_name, pattern) => {
      const { bucket, options, two, line, later, rec } = await heldDuplicate();
      const [view] = await heldUnits(two.sync, options);
      const id = view?.unit.unit as string;
      rec.failAt(pattern);
      await confirmHeldUnit(two.sync, id, options).catch((error: unknown) => {
        if (!String(error).includes("cut at")) {
          throw error;
        }
      });
      rec.failAt(/^$never/);
      const after = await where(two, line);
      expect(after.ledger > 0 || after.held, JSON.stringify(after)).toBe(true);
      expect(after.ledger).toBeLessThanOrEqual(1);
      if (after.held) {
        await confirmHeldUnit(two.sync, id, options);
      }
      const done = await where(two, line);
      expect(done).toEqual({ ledger: 1, held: false, discarded: 0 });
      // The confirmed line goes back in front of what is still pending (M5).
      const lines = linesOfText(await two.text());
      expect(lines.indexOf(line)).toBeLessThan(lines.indexOf(later));
      expect(await syncDevice(two.sync, bucket.as("two"), options)).toMatchObject({
        status: "synced",
      });
      expect(linesOfText(await bucket.text())).toContain(line);
    },
  );
});

describe("discarding, cut at every write", () => {
  it.each(WRITES.map((pattern) => [String(pattern), pattern] as const))(
    "never loses the line with a cut at %s, and never discards it twice",
    async (_name, pattern) => {
      const { options, two, line, rec } = await heldDuplicate();
      const [view] = await heldUnits(two.sync, options);
      const id = view?.unit.unit as string;
      rec.failAt(pattern);
      await discardHeldUnit(two.sync, id, options).catch((error: unknown) => {
        if (!String(error).includes("cut at")) {
          throw error;
        }
      });
      rec.failAt(/^$never/);
      const after = await where(two, line);
      expect(after.held || after.discarded === 1, JSON.stringify(after)).toBe(true);
      if (after.held) {
        await discardHeldUnit(two.sync, id, options);
      }
      expect(await where(two, line)).toEqual({ ledger: 0, held: false, discarded: 1 });
    },
  );
});

describe("finishing a redo, cut at every write", () => {
  it.each(WRITES.map((pattern) => [String(pattern), pattern] as const))(
    "never loses the line with a cut at %s",
    async (_name, pattern) => {
      const { options, two, line, rec } = await heldDuplicate();
      const [view] = await heldUnits(two.sync, options);
      const id = view?.unit.unit as string;
      const sealed = "01ARYZ6S41TSV4RRFFQ69ZZZZZ";
      await startRedo(two.sync, id, sealed, options);
      await two.record([
        { ...twinDeposit(new Builder(990)), id: sealed, amount: "51" } as LedgerEvent,
      ]);
      rec.failAt(pattern);
      await finishRedo(two.sync, id, sealed, options).catch((error: unknown) => {
        if (!String(error).includes("cut at")) {
          throw error;
        }
      });
      rec.failAt(/^$never/);
      const after = await where(two, line);
      expect(after.held || after.discarded === 1, JSON.stringify(after)).toBe(true);
      if (after.held) {
        await finishRedo(two.sync, id, sealed, options);
      }
      expect(await where(two, line)).toEqual({ ledger: 0, held: false, discarded: 1 });
    },
  );
});

describe("finishing the redo of a chain (B2 of the review of PR #83)", () => {
  it("moves to discarded only the pair redone, and keeps the other held", async () => {
    const shared = base();
    const b = new Builder(400);
    const first = b.deposit("11");
    const second = b.deposit("12");
    const device = await consoleDevice([...shared, first, second]);
    const chain = [
      ...b.correction(first, { amount: "21" }),
      ...b.correction(second, { amount: "22" }),
    ];
    const options = clock();
    await device.sync.commit(await device.sync.read(), {
      held: holdRecords(linesOf(chain), "client", { code: "pair_rejected", details: {} }, "t"),
    });
    const [view] = await heldUnits(device.sync, options);
    const id = view?.unit.unit as string;
    await expect(finishRedo(device.sync, id, "x", options)).rejects.toMatchObject({
      code: "redo_not_recorded",
    });
    expect(await startRedo(device.sync, id, "x", options)).toMatchObject({
      kind: "correct",
      target_id: first.id,
    });
    await device.record(new Builder(500).correction(first, { amount: "21" }));
    await finishRedo(device.sync, id, "x", options);
    expect(unresolvedHeld(parseHeld(await device.held())).flatMap((unit) => unit.lines)).toEqual(
      linesOf(chain.slice(2)),
    );
    expect(parseDiscarded(await device.discarded()).map((record) => record.line)).toEqual(
      linesOf(chain.slice(0, 2)),
    );
    expect(await startRedo(device.sync, id, "x", options)).toMatchObject({
      kind: "correct",
      target_id: second.id,
    });
  });
});
