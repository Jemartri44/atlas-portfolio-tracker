// The seven steps over both stores (ADR-0026, Part B; plan §11 and the table
// of §4.2): the answer lost, the race, the failures that hold nothing back,
// the refusals that hold a line back, a rewritten remote, starting, joining,
// resolving and deactivating.

import type { LedgerEvent } from "@atlas/domain";
import { parseHeld, RemoteError, unresolvedHeld } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import {
  confirmHeldUnit,
  deactivateSync,
  discardHeldUnit,
  finishRedo,
  heldUnits,
  initialiseRemote,
  joinWithOwnLines,
  replaceFromRemote,
  startRedo,
  syncDevice,
} from "../../src/sync/client.js";
import { Builder, base, linesOf, textOf } from "./builder.js";
import { clock, consoleDevice, type Device, webDevice } from "./devices.js";
import { defaultRules, SimulatedBucket } from "./simulated-remote.js";

const kinds: [string, (events: readonly LedgerEvent[]) => Promise<Device>][] = [
  ["console", (events) => consoleDevice(events)],
  ["web", async (events) => webDevice(events)],
];

const heldLines = async (device: Device): Promise<string[]> =>
  unresolvedHeld(parseHeld(await device.held())).flatMap((unit) => unit.lines);

/** A device synced with an initialised remote, and a second one that joined it. */
const pair = async (make: (events: readonly LedgerEvent[]) => Promise<Device>) => {
  const shared = base();
  const bucket = SimulatedBucket.inMemory();
  const options = clock();
  const one = await make(shared);
  const two = await make(shared);
  await initialiseRemote(one.sync, bucket.as("one"), options);
  await replaceFromRemote(two.sync, bucket.as("two"), options, "join");
  return { shared, bucket, options, one, two };
};

describe.each(kinds)("the client over the %s", (_kind, make) => {
  it("does not duplicate what the remote accepted when the answer was lost (step 5, R4)", async () => {
    const { bucket, options, one, shared } = await pair(make);
    const mine = new Builder(100);
    await one.record([mine.deposit("50")]);
    bucket.loseNextAnswer = true;
    const lost = await syncDevice(one.sync, bucket.as("one"), options);
    expect(lost).toEqual({
      status: "stopped",
      stop: {
        code: "remote_failed",
        details: { remote_code: "network_failed", status: undefined },
      },
    });
    expect(await bucket.text()).toBe(textOf([...shared, ...mine.events]));
    const again = await syncDevice(one.sync, bucket.as("one"), options);
    expect(again).toMatchObject({ status: "synced", pending: 0 });
    expect(await bucket.text()).toBe(textOf([...shared, ...mine.events]));
    expect(await one.text()).toBe(await bucket.text());
  });

  it("starts again after a 412 and stops after three in a row (D-Q9), holding nothing back", async () => {
    const { bucket, options, one, shared } = await pair(make);
    const mine = new Builder(100);
    await one.record([mine.deposit("50")]);
    let foreign = 200;
    const race = async () => {
      foreign += 1;
      await bucket.appendRaw(linesOf([new Builder(foreign * 10).deposit(String(foreign))]));
    };
    bucket.beforeWrite = race;
    const lost = await syncDevice(one.sync, bucket.as("one"), options);
    expect(lost).toEqual({
      status: "stopped",
      stop: { code: "remote_contention", details: { attempts: 3 } },
    });
    expect(await heldLines(one)).toEqual([]);
    let once = true;
    bucket.beforeWrite = async () => {
      if (once) {
        once = false;
        await race();
      }
    };
    expect(await syncDevice(one.sync, bucket.as("one"), options)).toMatchObject({
      status: "synced",
      pending: 0,
    });
    expect((await bucket.text()).endsWith(textOf(mine.events))).toBe(true);
    expect((await bucket.text()).startsWith(textOf(shared))).toBe(true);
  });

  it.each([
    ["a failure of the server", "internal", 500, "append"],
    ["an expired credential", "device_token_expired", 401, "append"],
    ["a request refused before the API", "transport_rejected", undefined, "append"],
    ["no connection while reading", "network_failed", undefined, "read"],
  ] as const)("stops on %s and holds nothing back (V4)", async (_what, code, status, when) => {
    const { bucket, options, one } = await pair(make);
    const mine = new Builder(100);
    await one.record([mine.deposit("50")]);
    const before = await one.text();
    bucket.failNext = { what: when, error: new RemoteError(code, status) };
    expect(await syncDevice(one.sync, bucket.as("one"), options)).toEqual({
      status: "stopped",
      stop: { code: "remote_failed", details: { remote_code: code, status } },
    });
    expect(await heldLines(one)).toEqual([]);
    expect(await one.text()).toBe(before);
  });

  it("holds back what the remote refuses for that line, with the remote's reason (step 4)", async () => {
    const shared = base();
    let now = new Date("2027-08-30T10:00:00.000Z");
    const bucket = SimulatedBucket.inMemory(() => ({ ...defaultRules(), now }));
    const options = clock();
    const one = await make(shared);
    await initialiseRemote(one.sync, bucket.as("one"), options);
    const mine = new Builder(100).recordedOn("2027-09-01");
    await one.record([mine.deposit("50"), mine.deposit("60")]);
    const outcome = await syncDevice(one.sync, bucket.as("one"), options);
    expect(outcome).toMatchObject({
      status: "synced",
      held: { code: "recorded_at_in_future" },
      pending: 1,
    });
    expect(await heldLines(one)).toEqual(linesOf(mine.events.slice(0, 1)));
    // The replica is the remote followed by its queue, byte for byte.
    expect(await one.text()).toBe(`${await bucket.text()}${linesOf(mine.events.slice(1))[0]}\n`);
    const units = parseHeld(await one.held());
    expect(units[0]).toMatchObject({ kind: "held", origin: "remote" });
    // What was behind it stays pending, and nothing goes up until it is resolved (R13).
    now = new Date("2027-09-02T00:00:00.000Z");
    expect(await syncDevice(one.sync, bucket.as("one"), options)).toMatchObject({
      status: "synced",
      pending: 1,
    });
    expect(await bucket.text()).toBe(textOf(shared));
  });

  it("stops on a rewritten remote, and only downloads it again when asked, holding back what it lacks (R2, R3)", async () => {
    const { bucket, options, one, shared } = await pair(make);
    const mine = new Builder(100);
    await one.record([mine.deposit("50")]);
    await syncDevice(one.sync, bucket.as("one"), options);
    const pending = new Builder(200).deposit("70");
    await one.record([pending]);
    // A restore to the shared base, keeping every id of it.
    await bucket.rewrite(textOf(shared));
    const stopped = await syncDevice(one.sync, bucket.as("one"), options);
    expect(stopped).toMatchObject({ status: "stopped", stop: { code: "remote_rewritten" } });
    expect(await bucket.text()).toBe(textOf(shared));
    expect(
      await replaceFromRemote(one.sync, bucket.as("one"), options, "redownload"),
    ).toMatchObject({
      status: "synced",
    });
    expect(await one.text()).toBe(textOf(shared));
    expect(await heldLines(one)).toEqual(linesOf([...mine.events, pending]));
    expect(
      parseHeld(await one.held()).map((record) => record.kind === "held" && record.reason.code),
    ).toEqual(["absent_after_rewrite", "absent_after_rewrite"]);
    // Held back, never uploaded alone.
    expect(await syncDevice(one.sync, bucket.as("one"), options)).toMatchObject({
      status: "synced",
      pending: 0,
    });
    expect(await bucket.text()).toBe(textOf(shared));
  });

  it("does not upload over a remote this client cannot read (case 6)", async () => {
    const { bucket, options, one, shared } = await pair(make);
    await one.record([new Builder(100).deposit("50")]);
    const newer = linesOf([new Builder(300).deposit("1")])[0]?.replace(
      '"schema_version":1',
      '"schema_version":2',
    );
    await bucket.appendRaw([newer as string]);
    expect(await syncDevice(one.sync, bucket.as("one"), options)).toMatchObject({
      status: "stopped",
      stop: { code: "remote_schema_too_new" },
    });
    expect((await bucket.text()).startsWith(textOf(shared))).toBe(true);
    expect((await bucket.text()).split("\n").length).toBe(shared.length + 2);
  });

  it("refuses to initialise an invalid ledger before calling the remote (V7)", async () => {
    const b = new Builder(0);
    b.account("acc_fund");
    b.asset("ast_world");
    b.trade("sell", "5");
    const device = await make(b.events);
    const bucket = SimulatedBucket.inMemory();
    const calls: string[] = [];
    bucket.onCall = (what) => {
      calls.push(what);
    };
    expect(await initialiseRemote(device.sync, bucket.as("one"), clock())).toMatchObject({
      status: "refused",
      refusal: { code: "init_refused_invalid_ledger" },
    });
    expect(calls).toEqual([]);
    expect(await bucket.text()).toBe("");
  });

  it("initialises only an empty remote", async () => {
    const { bucket, options, two } = await pair(make);
    expect(await initialiseRemote(two.sync, bucket.as("two"), options)).toMatchObject({
      status: "stopped",
      stop: { details: { remote_code: "precondition_failed" } },
    });
  });

  it("publishes the state of its queue under the device of its credential, never one of the body", async () => {
    const { bucket, options, one } = await pair(make);
    await one.record([new Builder(100).deposit("5")]);
    bucket.failNext = { what: "append", error: new RemoteError("internal", 500) };
    await syncDevice(one.sync, bucket.as("one"), options);
    await syncDevice(one.sync, bucket.as("one"), options);
    const devices = await bucket.devices();
    expect(devices.find((entry) => entry.device_id === "one")).toMatchObject({
      pending: 0,
      held: 0,
    });
    await expect(
      bucket.as("one").publishBody({ pending: 0, held: 0, last_sync_at: "t", device_id: "two" }),
    ).rejects.toMatchObject({ code: "body_invalid" });
  });

  it("says a failed publication without undoing the sync", async () => {
    const { bucket, options, one } = await pair(make);
    await one.record([new Builder(100).deposit("5")]);
    bucket.failNext = { what: "publish", error: new RemoteError("internal", 500) };
    const outcome = await syncDevice(one.sync, bucket.as("one"), options);
    expect(outcome).toMatchObject({
      status: "synced",
      uploaded: 1,
      notice: { code: "publish_failed", details: { remote_code: "internal" } },
    });
    expect(await one.text()).toBe(await bucket.text());
  });

  it("joins with its own lines as pending, or from the remote holding back what it lacks (D-Q5)", async () => {
    const { bucket, options, shared } = await pair(make);
    const own = new Builder(500);
    const mine = [own.deposit("5")];
    const joiner = await make([...shared, ...mine]);
    const joined = await joinWithOwnLines(joiner.sync, bucket.as("three"), options);
    expect(joined).toMatchObject({ outcome: { status: "synced", pending: 1 }, invalid: [] });
    expect(await syncDevice(joiner.sync, bucket.as("three"), options)).toMatchObject({
      uploaded: 1,
    });
    const other = await make([...shared, own.deposit("6")]);
    expect(await replaceFromRemote(other.sync, bucket.as("four"), options, "join")).toMatchObject({
      status: "synced",
    });
    expect(await other.text()).toBe(await bucket.text());
    expect(
      parseHeld(await other.held()).map((record) => record.kind === "held" && record.reason.code),
    ).toEqual(["absent_at_join"]);
  });

  it("resolves what it held back: confirm a new duplicate, and it goes up declared (R6, R18)", async () => {
    const { bucket, options, one, two } = await pair(make);
    const mine = new Builder(100);
    const deposit = mine.deposit("50");
    await one.record([deposit]);
    await syncDevice(one.sync, bucket.as("one"), options);
    const theirs = new Builder(900);
    const twin = theirs.event("cash_deposit", {
      account_id: "acc_fund",
      value_date: "2027-01-11",
      amount: "50",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2027-01-11",
    });
    await two.record([twin]);
    expect(await syncDevice(two.sync, bucket.as("two"), options)).toMatchObject({
      held: { code: "new_duplicate" },
    });
    const [view] = await heldUnits(two.sync, options);
    expect(view?.resolutions).toEqual(["confirm", "redo", "discard"]);
    await confirmHeldUnit(two.sync, view?.unit.unit as string, options);
    expect(await heldLines(two)).toEqual([]);
    expect(await syncDevice(two.sync, bucket.as("two"), options)).toMatchObject({
      status: "synced",
      uploaded: 1,
    });
    expect((await bucket.text()).endsWith(textOf([twin]))).toBe(true);
    expect(await two.text()).toBe(await bucket.text());
  });

  it("discards explicitly, and redoes a line by the id sealed before recording it", async () => {
    const { bucket, options, one } = await pair(make);
    const mine = new Builder(100).recordedOn("2027-09-01");
    const early = mine.deposit("50");
    await one.record([early]);
    let now = new Date("2027-08-30T10:00:00.000Z");
    const strict = SimulatedBucket.inMemory(() => ({ ...defaultRules(), now }));
    await strict.rewrite(await bucket.text());
    expect(await syncDevice(one.sync, strict.as("one"), options)).toMatchObject({
      held: { code: "recorded_at_in_future" },
    });
    const [view] = await heldUnits(one.sync, options);
    const id = view?.unit.unit as string;
    const plan = await startRedo(one.sync, id, "01ARYZ6S41TSV4RRFFQ69ZZZZZ", options);
    expect(plan).toMatchObject({ kind: "record", draft: { type: "cash_deposit" } });
    await expect(
      finishRedo(one.sync, id, "01ARYZ6S41TSV4RRFFQ69ZZZZZ", options),
    ).rejects.toMatchObject({
      code: "redo_not_recorded",
    });
    const redo = new Builder(0).recordedOn("2027-08-30");
    const again = { ...redo.deposit("50"), id: "01ARYZ6S41TSV4RRFFQ69ZZZZZ" } as LedgerEvent;
    await one.record([again]);
    await finishRedo(one.sync, id, "01ARYZ6S41TSV4RRFFQ69ZZZZZ", options);
    expect(await heldLines(one)).toEqual([]);
    expect(await one.discarded()).toContain('"code":"redone"');
    now = new Date("2027-08-31T10:00:00.000Z");
    expect(await syncDevice(one.sync, strict.as("one"), options)).toMatchObject({
      status: "synced",
      uploaded: 1,
    });
    // And discarding.
    const late = new Builder(700).recordedOn("2027-09-05");
    await one.record([late.deposit("9")]);
    await syncDevice(one.sync, strict.as("one"), options);
    const [held] = await heldUnits(one.sync, options);
    await discardHeldUnit(one.sync, held?.unit.unit as string, options);
    expect(await heldLines(one)).toEqual([]);
    expect(await one.discarded()).toContain('"code":"discarded_by_user"');
  });

  it("deactivates only without pending lines, and keeps what is held back (P4, D-Q6)", async () => {
    const { bucket, options, one } = await pair(make);
    await one.record([new Builder(100).deposit("50")]);
    expect(await deactivateSync(one.sync, options)).toEqual({
      code: "deactivate_refused_pending",
      details: { pending: 1 },
    });
    const strict = SimulatedBucket.inMemory(() => ({
      ...defaultRules(),
      now: new Date("2027-08-01T00:00:00.000Z"),
    }));
    await strict.rewrite(await bucket.text());
    await syncDevice(one.sync, strict.as("one"), options);
    expect(await heldLines(one)).toHaveLength(1);
    expect(await deactivateSync(one.sync, options)).toBeUndefined();
    expect(await heldLines(one)).toHaveLength(1);
    const state = await one.sync.read();
    expect(state.presence).toMatchObject({ present: true, marker: { status: "disabled" } });
    // Never synced: nothing to deactivate, and nothing is created.
    const fresh = await make(base());
    expect(await deactivateSync(fresh.sync, options)).toBeUndefined();
    expect((await fresh.sync.read()).presence).toEqual({ present: false });
  });
});

describe("starting is explicit (NB3, NB4 of the review of PR #83)", () => {
  it.each(kinds)(
    "a sync of a %s device that never joined is refused, and nothing is uploaded",
    async (_k, make) => {
      const bucket = SimulatedBucket.inMemory();
      const options = clock();
      const one = await make(base());
      await initialiseRemote(one.sync, bucket.as("one"), options);
      const other = await make([...base(), new Builder(700).deposit("3")]);
      expect(await syncDevice(other.sync, bucket.as("two"), options)).toEqual({
        status: "refused",
        refusal: { code: "sync_not_configured", details: {} },
      });
      expect(await bucket.text()).toBe(textOf(base()));
      await deactivateSync(one.sync, options);
      expect(await syncDevice(one.sync, bucket.as("one"), options)).toMatchObject({
        refusal: { code: "sync_deactivated" },
      });
    },
  );

  it("refuses to deactivate with the marker missing, and pending lines stay pending", async () => {
    const { options, one } = await pair((events) => consoleDevice(events));
    await one.record([new Builder(100).deposit("50")]);
    const { rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await rm(join((one as unknown as { dir: string }).dir, "sync", "state.json"));
    expect(await deactivateSync(one.sync, options)).toEqual({
      code: "deactivate_refused_marker_missing",
      details: {},
    });
    expect((await one.sync.read()).presence).toEqual({ present: true, marker: "missing" });
  });
});

describe("the local ledger changing under a sync (step 6)", () => {
  it("writes nothing on what changed, starts again, and loses nothing (12)", async () => {
    const { bucket, options, one } = await pair((events) => consoleDevice(events));
    const mine = new Builder(100);
    await one.record([mine.deposit("50")]);
    const later = new Builder(600);
    let recorded = false;
    bucket.onCall = async (what) => {
      if (what === "append" && !recorded) {
        recorded = true;
        await one.record([later.deposit("61")]);
      }
    };
    expect(await syncDevice(one.sync, bucket.as("one"), options)).toMatchObject({
      status: "synced",
    });
    const local = await one.text();
    expect(local.includes(linesOf(later.events)[0] as string)).toBe(true);
    expect(local.includes(linesOf(mine.events)[0] as string)).toBe(true);
  });

  it("stops after three changes in a row (D-Q9)", async () => {
    const { bucket, options, one } = await pair((events) => consoleDevice(events));
    let next = 600;
    bucket.onCall = async (what) => {
      if (what === "publish") {
        return;
      }
      next += 1;
      await one.record([new Builder(next * 10).deposit(String(next))]);
    };
    expect(await syncDevice(one.sync, bucket.as("one"), options)).toEqual({
      status: "stopped",
      stop: { code: "local_changed", details: { attempts: 3 } },
    });
  });
});
