// Feature 015, E3, block 5, points 1 and 2: the redo of what the sync held
// back, walked with a console and the simulated remote.
//
// - Point 2 (`redo_waits_for_unit`): a pair that corrects the correction held
//   in **another** unit waits for that unit, and once that one is redone it
//   corrects the event it was redone with — by the ids of `held.jsonl`,
//   never by resemblance.
// - Point 1 (option (a)): a redo registered by hand only in half never
//   finishes; discarding what is held is the way out, and nothing registered
//   is lost.

import { createUlidGenerator, type LedgerEvent, type UseCaseDeps } from "@atlas/domain";
import { parseHeld, unresolvedHeld } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import {
  discardHeldUnit,
  finishRedo,
  heldUnits,
  initialiseRemote,
  recordRedoPlan,
  replaceFromRemote,
  startRedo,
  syncDevice,
} from "../../src/sync/client.js";
import { Builder, base } from "./builder.js";
import { type ConsoleDevice, clock, consoleDevice } from "./devices.js";
import { SimulatedBucket } from "./simulated-remote.js";

const depsOf = (device: ConsoleDevice, options: ReturnType<typeof clock>): UseCaseDeps => {
  let counter = 0;
  return {
    store: device.store,
    clock: { now: options.now },
    random: (target) => {
      counter += 1;
      target.fill((counter * 7) % 256);
    },
  };
};

const buyOf = (events: readonly LedgerEvent[]): LedgerEvent => events.at(-1) as LedgerEvent;

/**
 * The laptop corrects the purchase (pair X) and then corrects its own
 * correction (pair Y), without a connection; then it joins **from the
 * remote**: both pairs are held, each in its own unit.
 */
const twoUnits = async () => {
  const shared = base();
  const options = clock();
  const bucket = SimulatedBucket.inMemory();
  const first = await consoleDevice(shared);
  await initialiseRemote(first.sync, bucket.as("first"), options);
  const laptop = await consoleDevice(shared);
  const builder = new Builder(300);
  const x = builder.correction(buyOf(shared), { fee: "1" });
  // Y corrects X's correction: its reversal and its correction point at C1.
  const c1 = x[1] as LedgerEvent & Record<string, unknown>;
  const {
    schema_version: _v,
    id: _i,
    recorded_at: _r,
    type,
    fingerprint: _f,
    ...fields
  } = c1 as LedgerEvent & { fingerprint?: string };
  const y = [
    builder.reversal(c1),
    builder.event(type, { ...fields, fee: "3", corrects_id: c1.id }),
  ];
  // A line between them: two pairs in a row would be one chain (D-Q2), and
  // the wait inside a chain is `redo_waits_for_pair`, which already exists.
  const between = builder.deposit("50");
  await laptop.record([...x, between, ...y]);
  await replaceFromRemote(laptop.sync, bucket.as("laptop"), options, "join");
  const units = await heldUnits(laptop.sync, options);
  expect(units).toHaveLength(3);
  const unitOf = (pair: readonly LedgerEvent[]) =>
    units.find((view) => view.unit.lines.some((line) => line.includes(pair[0]?.id as string)))?.unit
      .unit as string;
  return { shared, options, bucket, laptop, x, y, unitX: unitOf(x), unitY: unitOf(y) };
};

describe("the redo across units (point 2)", () => {
  it("makes a pair wait for the unit that holds the correction it corrects", async () => {
    const { options, laptop, unitX, unitY } = await twoUnits();
    const ids = createUlidGenerator(depsOf(laptop, options));
    await expect(startRedo(laptop.sync, unitY, () => ids.next(), options)).rejects.toMatchObject({
      code: "redo_waits_for_unit",
      details: { unit: unitX },
    });
    // Nothing was sealed for the one that waits.
    const records = parseHeld(await laptop.held());
    expect(records.filter((record) => record.kind === "redo_started")).toEqual([]);
  });

  it("once that unit is redone, corrects the event it was redone with, by the ids of held.jsonl", async () => {
    const { options, bucket, laptop, unitX, unitY } = await twoUnits();
    const deps = depsOf(laptop, options);
    const ids = createUlidGenerator(deps);
    const planX = await startRedo(laptop.sync, unitX, () => ids.next(), options);
    await recordRedoPlan(deps, planX, { confirmDuplicate: true });
    await finishRedo(laptop.sync, unitX, options);
    expect(planX.kind).toBe("correct");
    const planY = await startRedo(laptop.sync, unitY, () => ids.next(), options);
    // It corrects what X was redone with: the id sealed for X's correction.
    expect(planY).toMatchObject({ kind: "correct", target_id: (planX as { id: string }).id });
    await recordRedoPlan(deps, planY, { confirmDuplicate: true });
    await finishRedo(laptop.sync, unitY, options);
    const [left] = await heldUnits(laptop.sync, options);
    await discardHeldUnit(laptop.sync, left?.unit.unit as string, options);
    expect(unresolvedHeld(parseHeld(await laptop.held()))).toEqual([]);
    expect(await syncDevice(laptop.sync, bucket.as("laptop"), options)).toMatchObject({
      status: "synced",
      pending: 0,
    });
  });
});

describe("a redo registered only in half (point 1, option (a))", () => {
  it("never finishes by resemblance; discarding gets out, and what was registered stays", async () => {
    const { options, laptop, x, unitX } = await twoUnits();
    const deps = depsOf(laptop, options);
    const ids = createUlidGenerator(deps);
    const plan = await startRedo(laptop.sync, unitX, () => ids.next(), options);
    expect(plan.kind).toBe("correct");
    // The user registers by hand only the reversal, with the sealed id — as
    // if the correction had failed or been forgotten.
    const reversal = new Builder(900).event("reversal", {
      reverses_id: (plan as { target_id: string }).target_id,
      reason: "a mano",
    });
    await laptop.record([{ ...reversal, id: (plan as { reversal_id: string }).reversal_id }]);
    await expect(finishRedo(laptop.sync, unitX, options)).rejects.toMatchObject({
      code: "redo_not_recorded",
    });
    await discardHeldUnit(laptop.sync, unitX, options);
    expect(unresolvedHeld(parseHeld(await laptop.held())).some((unit) => unit.unit === unitX)).toBe(
      false,
    );
    expect(await laptop.text()).toContain((plan as { reversal_id: string }).reversal_id);
    expect(await laptop.discarded()).toContain(x[1]?.id as string);
  });
});
