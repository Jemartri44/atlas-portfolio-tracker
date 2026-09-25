// Resolving what is held back, cut at every write (review of PR #83, B1):
// the destination is written before the origin forgets the line, so a cut
// leaves it in two places, never in none — and repeating the resolution, or
// syncing, finishes it without duplicating anything.

import { correctEvent, type LedgerEvent, recordEvent, type UseCaseDeps } from "@atlas/domain";
import {
  holdRecords,
  linesOfText,
  parseDiscarded,
  parseHeld,
  sealedIds,
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
      await startRedo(two.sync, id, () => sealed, options);
      await two.record([
        { ...twinDeposit(new Builder(990)), id: sealed, amount: "51" } as LedgerEvent,
      ]);
      rec.failAt(pattern);
      await finishRedo(two.sync, id, options).catch((error: unknown) => {
        if (!String(error).includes("cut at")) {
          throw error;
        }
      });
      rec.failAt(/^$never/);
      const after = await where(two, line);
      expect(after.held || after.discarded === 1, JSON.stringify(after)).toBe(true);
      if (after.held) {
        await finishRedo(two.sync, id, options);
      }
      expect(await where(two, line)).toEqual({ ledger: 0, held: false, discarded: 1 });
    },
  );
});

/** Ids in order, distinct: what a ULID generator gives, readable in a test. */
const sequence = (prefix: string): (() => string) => {
  let next = 0;
  return () => {
    next += 1;
    return `01${prefix}${String(next).padStart(24 - prefix.length, "0")}`;
  };
};

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
    await expect(finishRedo(device.sync, id, options)).rejects.toMatchObject({
      code: "redo_not_recorded",
    });
    const plan = await startRedo(device.sync, id, sequence("C1"), options);
    expect(plan).toMatchObject({ kind: "correct", target_id: first.id });
    if (plan.kind !== "correct") {
      throw new Error("a pair is redone as a correction");
    }
    const [reversal, corrected] = new Builder(500).correction(first, { amount: "21" });
    await device.record([
      { ...reversal, id: plan.reversal_id } as LedgerEvent,
      { ...corrected, id: plan.id } as LedgerEvent,
    ]);
    await finishRedo(device.sync, id, options);
    expect(unresolvedHeld(parseHeld(await device.held())).flatMap((unit) => unit.lines)).toEqual(
      linesOf(chain.slice(2)),
    );
    expect(parseDiscarded(await device.discarded()).map((record) => record.line)).toEqual(
      linesOf(chain.slice(0, 2)),
    );
    expect(await startRedo(device.sync, id, sequence("C2"), options)).toMatchObject({
      kind: "correct",
      target_id: second.id,
    });
  });
});

const deps = (device: Device): UseCaseDeps => {
  let tick = Date.parse("2027-09-01T10:00:00.000Z");
  let random = 0;
  return {
    store: device.store,
    clock: {
      now: () => {
        tick += 1000;
        return new Date(tick);
      },
    },
    random: (target) => {
      random += 1;
      target.fill(random % 256);
    },
  };
};

describe("finishing a redo by the ids sealed, never by the target (R1 of the second review of PR #83)", () => {
  /** Case 3 of ADR-0026 as it is: both devices correct the same buy; the phone's pair is held. */
  const case3 = async () => {
    const shared = base();
    const bucket = SimulatedBucket.inMemory();
    const options = clock();
    const laptop = await consoleDevice(shared);
    const phone = await consoleDevice(shared);
    await initialiseRemote(laptop.sync, bucket.as("laptop"), options);
    await replaceFromRemote(phone.sync, bucket.as("phone"), options, "join");
    const buy = shared[shared.length - 1] as LedgerEvent;
    await laptop.record(new Builder(100).correction(buy, { fee: "1" }));
    const pair = new Builder(200).correction(buy, { fee: "2" });
    await phone.record(pair);
    await syncDevice(laptop.sync, bucket.as("laptop"), options);
    expect(await syncDevice(phone.sync, bucket.as("phone"), options)).toMatchObject({
      held: { code: "pair_rejected" },
    });
    const [view] = await heldUnits(phone.sync, options);
    return { phone, options, id: view?.unit.unit as string, pair };
  };

  it("refuses to finish when nothing was recorded, though the laptop's correction is there", async () => {
    const { phone, options, id, pair } = await case3();
    await startRedo(phone.sync, id, sequence("R1"), options);
    await expect(finishRedo(phone.sync, id, options)).rejects.toMatchObject({
      code: "redo_not_recorded",
    });
    expect(unresolvedHeld(parseHeld(await phone.held())).flatMap((unit) => unit.lines)).toEqual(
      linesOf(pair),
    );
    expect(await phone.discarded()).toBe("");
  });

  it("finishes once the reversal and the correction with exactly the sealed ids are recorded", async () => {
    const { phone, options, id, pair } = await case3();
    const plan = await startRedo(phone.sync, id, sequence("R1"), options);
    expect(plan).toMatchObject({ kind: "correct" });
    if (plan.kind !== "correct") {
      throw new Error("a pair is redone as a correction");
    }
    // The same seal when started again: the ids never change until finished.
    expect(await startRedo(phone.sync, id, sequence("R9"), options)).toEqual(plan);
    // Redone as the user would, by the use case, on the current state.
    await correctEvent(deps(phone), plan.target_id, plan.draft, "redo", {
      ids: sealedIds(plan),
    });
    await finishRedo(phone.sync, id, options);
    const records = parseDiscarded(await phone.discarded());
    expect(records.map((record) => [record.line, record.replaced_by])).toEqual([
      [linesOf(pair)[0], plan.reversal_id],
      [linesOf(pair)[1], plan.id],
    ]);
  });
});

describe("redoing a chain whose pairs correct each other (third review of PR #83)", () => {
  it("points the later pair at the id the earlier one was redone with, and redoes the chain whole", async () => {
    const shared = base();
    const b = new Builder(400);
    const deposit = b.deposit("11");
    const device = await consoleDevice([...shared, deposit]);
    const options = clock();
    const first = b.correction(deposit, { amount: "21" });
    const second = b.correction(first[1], { amount: "31" });
    const chain = [...first, ...second];
    await device.sync.commit(await device.sync.read(), {
      held: holdRecords(linesOf(chain), "client", { code: "pair_rejected", details: {} }, "t"),
    });
    const [view] = await heldUnits(device.sync, options);
    const id = view?.unit.unit as string;
    const redo = async (seal: string) => {
      const plan = await startRedo(device.sync, id, sequence(seal), options);
      if (plan.kind !== "correct") {
        throw new Error("a pair of a chain is redone as a correction");
      }
      await correctEvent(deps(device), plan.target_id, plan.draft, "redo", {
        ids: sealedIds(plan),
      });
      await finishRedo(device.sync, id, options);
      return plan;
    };
    const one = await redo("C1");
    expect(one.target_id).toBe(deposit.id);
    const two = await redo("C2");
    // Not the held correction, which never reached the ledger: its redo.
    expect(two.target_id).toBe(one.id);
    expect(await heldUnits(device.sync, options)).toEqual([]);
    expect(parseDiscarded(await device.discarded()).map((record) => record.replaced_by)).toEqual([
      one.reversal_id,
      one.id,
      two.reversal_id,
      two.id,
    ]);
  });
});

describe("redoing a lone reversal by its sealed id (second review of PR #83)", () => {
  it("records it with recordEvent and that id, and finishes by it", async () => {
    const shared = base();
    const b = new Builder(400);
    const deposit = b.deposit("11");
    const device = await consoleDevice([...shared, deposit]);
    const options = clock();
    const lone = new Builder(450).reversal(deposit);
    await device.sync.commit(await device.sync.read(), {
      held: holdRecords(linesOf([lone]), "client", { code: "domain_rejected", details: {} }, "t"),
    });
    const [view] = await heldUnits(device.sync, options);
    const id = view?.unit.unit as string;
    const plan = await startRedo(device.sync, id, sequence("R7"), options);
    expect(plan).toMatchObject({
      kind: "reverse",
      target_id: deposit.id,
      draft: { type: "reversal", reverses_id: deposit.id },
    });
    if (plan.kind !== "reverse") {
      throw new Error("a lone reversal is redone as a reversal");
    }
    await recordEvent(deps(device), plan.draft, { id: plan.id });
    await finishRedo(device.sync, id, options);
    expect(parseDiscarded(await device.discarded())).toMatchObject([
      { line: linesOf([lone])[0], reason: { code: "redone" }, replaced_by: plan.id },
    ]);
  });
});

describe("discarded.jsonl records decisions, not bytes (second review of PR #83)", () => {
  it("records a new decision on the same bytes, and a retried one once", async () => {
    const device = await consoleDevice(base());
    const options = clock();
    const line = linesOf([new Builder(700).deposit("9")])[0] as string;
    const holdAndDiscard = async (at: string) => {
      await device.sync.commit(await device.sync.read(), {
        held: holdRecords([line], "client", { code: "new_duplicate", details: {} }, at),
      });
      const [view] = await heldUnits(device.sync, options);
      await discardHeldUnit(device.sync, view?.unit.unit as string, options);
    };
    await holdAndDiscard("2027-09-01T10:00:00.000Z");
    // Held again later, the same bytes, and discarded again: a second decision.
    await holdAndDiscard("2027-09-02T10:00:00.000Z");
    const records = parseDiscarded(await device.discarded());
    expect(records.map((record) => record.line)).toEqual([line, line]);
    expect(new Set(records.map((record) => record.decision)).size).toBe(2);
  });
});
