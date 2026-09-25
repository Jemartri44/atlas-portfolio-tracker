// The eleven cases of ADR-0026 («Contexto»), each walked as the case tells it,
// with two devices — a console and a web — over the same simulated remote in
// a directory. Each ends checking that the remote loads and is valid, that
// each replica is the remote followed by its queue byte for byte, and that no
// line written on any device has disappeared: it is in the remote, in a queue,
// held back, or discarded on purpose.

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CURRENT_LEDGER_SCHEMA,
  DEFAULT_SETTINGS,
  decodeLines,
  type LedgerEvent,
  projectLedger,
} from "@atlas/domain";
import { linesOfText, parseDiscarded, parseHeld, unresolvedHeld } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import {
  confirmHeldUnit,
  heldUnits,
  initialiseRemote,
  replaceFromRemote,
  syncDevice,
} from "../../src/sync/client.js";
import { Builder, base, linesOf } from "./builder.js";
import { clock, consoleDevice, type Device, webDevice } from "./devices.js";
import { defaultRules, SimulatedBucket } from "./simulated-remote.js";

interface World {
  bucket: SimulatedBucket;
  options: ReturnType<typeof clock>;
  laptop: Device;
  phone: Device;
  written: string[];
}

const world = async (
  shared: LedgerEvent[] = base(),
  at = "2027-08-30T09:00:00.000Z",
): Promise<World> => {
  const rules = () => ({ ...defaultRules(), now: new Date(Date.parse(at) + 3_600_000) });
  const bucket = SimulatedBucket.inDirectory(
    await mkdtemp(join(tmpdir(), "atlas-walk-014-")),
    rules,
  );
  const options = clock(at);
  const laptop = await consoleDevice(shared);
  const phone = webDevice(shared);
  await initialiseRemote(laptop.sync, bucket.as("laptop"), options);
  await syncDevice(phone.sync, bucket.as("phone"), options);
  return { bucket, options, laptop, phone, written: linesOf(shared) };
};

const record = async (w: World, device: Device, events: LedgerEvent[]): Promise<void> => {
  await device.record(events);
  w.written.push(...linesOf(events));
};

const sync = (w: World, device: Device) =>
  syncDevice(device.sync, w.bucket.as(device === w.laptop ? "laptop" : "phone"), w.options);

const heldOf = async (device: Device): Promise<string[]> =>
  unresolvedHeld(parseHeld(await device.held())).flatMap((unit) => unit.lines);

/** The three checks every walk ends with. */
const settled = async (w: World): Promise<void> => {
  const remote = await w.bucket.text();
  const events = decodeLines(linesOfText(remote), CURRENT_LEDGER_SCHEMA);
  expect(projectLedger(events, { collectErrors: true }).invalid).toEqual([]);
  const everywhere = new Set(linesOfText(remote));
  for (const device of [w.laptop, w.phone]) {
    const local = await device.text();
    expect(local.startsWith(remote), `${device.kind} is the remote followed by its queue`).toBe(
      true,
    );
    for (const line of linesOfText(local)) {
      everywhere.add(line);
    }
    for (const line of await heldOf(device)) {
      everywhere.add(line);
    }
    for (const record of parseDiscarded(await device.discarded())) {
      everywhere.add(record.line);
    }
    for (const archive of await device.archives()) {
      for (const line of linesOfText(archive)) {
        everywhere.add(line);
      }
    }
  }
  for (const line of w.written) {
    expect(everywhere.has(line), line).toBe(true);
  }
};

const buyOf = (events: LedgerEvent[]): LedgerEvent => events[events.length - 1] as LedgerEvent;

describe("the eleven cases of ADR-0026, walked", () => {
  it("1: the same operation recorded on both devices is held as a new duplicate, and goes up once confirmed", async () => {
    const w = await world();
    const same = {
      account_id: "acc_fund",
      value_date: "2027-02-01",
      amount: "80",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2027-02-01",
    };
    await record(w, w.laptop, [new Builder(100).event("cash_deposit", same)]);
    await record(w, w.phone, [new Builder(200).event("cash_deposit", same)]);
    await sync(w, w.laptop);
    expect(await sync(w, w.phone)).toMatchObject({ held: { code: "new_duplicate" } });
    const [held] = await heldUnits(w.phone.sync, w.options);
    await confirmHeldUnit(w.phone.sync, held?.unit.unit as string, w.options);
    expect(await sync(w, w.phone)).toMatchObject({ status: "synced", uploaded: 1 });
    await sync(w, w.laptop);
    await settled(w);
  });

  it("2: a reversal on one device and a sale consuming its lots on the other: the second is held", async () => {
    const shared = base();
    const w = await world(shared);
    await record(w, w.laptop, [new Builder(100).reversal(buyOf(shared))]);
    await record(w, w.phone, [new Builder(200).trade("sell", "5", "2027-06-10")]);
    await sync(w, w.laptop);
    expect(await sync(w, w.phone)).toMatchObject({ held: { code: "domain_rejected" } });
    await sync(w, w.laptop);
    await settled(w);
  });

  it("3: the same event rectified on both devices: the second correction is held whole", async () => {
    const shared = base();
    const w = await world(shared);
    await record(w, w.laptop, new Builder(100).correction(buyOf(shared), { fee: "1" }));
    await record(w, w.phone, new Builder(200).correction(buyOf(shared), { fee: "2" }));
    await sync(w, w.laptop);
    expect(await sync(w, w.phone)).toMatchObject({ held: { code: "pair_rejected" } });
    expect(await heldOf(w.phone)).toHaveLength(2);
    await sync(w, w.laptop);
    await settled(w);
  });

  it("4: concurrent photos: a settings change is held when the other device changed them too", async () => {
    const w = await world();
    await record(w, w.laptop, [
      new Builder(100).settings({ ...DEFAULT_SETTINGS, stale_price_days: 8 }),
    ]);
    await sync(w, w.laptop);
    // Recorded before seeing the laptop's: another asset goes up, the settings are held.
    const phone = new Builder(200);
    await record(w, w.phone, [
      phone.assetUpdated("ast_bonds", "Phone"),
      phone.settings({ ...DEFAULT_SETTINGS, stale_price_days: 9 }),
    ]);
    expect(await sync(w, w.phone)).toMatchObject({
      uploaded: 1,
      held: { code: "concurrent_settings" },
    });
    await sync(w, w.laptop);
    await settled(w);
  });

  it("5: a year the other device marked as filed makes a line held until confirmed", async () => {
    const shared = base();
    const w = await world(shared, "2028-07-01T09:00:00.000Z");
    await record(w, w.laptop, [new Builder(100).filed(2027, shared)]);
    await sync(w, w.laptop);
    await record(w, w.phone, [new Builder(200).deposit("40", "2027-05-05")]);
    expect(await sync(w, w.phone)).toMatchObject({ held: { code: "new_closed_year" } });
    const [held] = await heldUnits(w.phone.sync, w.options);
    await confirmHeldUnit(w.phone.sync, held?.unit.unit as string, w.options);
    expect(await sync(w, w.phone)).toMatchObject({ uploaded: 1 });
    await sync(w, w.laptop);
    await settled(w);
  });

  it("6: a remote of a newer version: this client uploads nothing, and its lines wait", async () => {
    const w = await world();
    await record(w, w.phone, [new Builder(200).deposit("40")]);
    const newer = linesOf([new Builder(300).deposit("1")])[0]?.replace(
      '"schema_version":1',
      '"schema_version":2',
    );
    await w.bucket.appendRaw([newer as string]);
    expect(await sync(w, w.phone)).toMatchObject({
      status: "stopped",
      stop: { code: "remote_schema_too_new" },
    });
    expect((await w.phone.text()).endsWith(`${w.written[w.written.length - 1]}\n`)).toBe(true);
  });

  it("7: a remote compacted keeping every id is detected, and downloading it again keeps back only what it lacks", async () => {
    const shared = base();
    const w = await world(shared);
    await record(w, w.phone, [new Builder(200).deposit("40")]);
    const compacted = linesOf(shared).map((line) =>
      line.replace('"schema_version":1,', '"schema_version": 1,'),
    );
    await w.bucket.rewrite(`${compacted.join("\n")}\n`);
    expect(await sync(w, w.phone)).toMatchObject({
      status: "stopped",
      stop: { code: "remote_rewritten" },
    });
    await replaceFromRemote(w.phone.sync, w.bucket.as("phone"), w.options, "redownload");
    expect(await heldOf(w.phone)).toEqual(w.written.slice(-1));
    await replaceFromRemote(w.laptop.sync, w.bucket.as("laptop"), w.options, "redownload");
    expect(await heldOf(w.laptop)).toEqual([]);
    await settled(w);
  });

  it("8: a clock ahead of the remote's: the remote refuses the line, and it is held with its reason", async () => {
    const w = await world();
    await record(w, w.phone, [new Builder(200).recordedOn("2027-09-15").deposit("40")]);
    expect(await sync(w, w.phone)).toMatchObject({ held: { code: "recorded_at_in_future" } });
    await settled(w);
  });

  it("9: a filing recorded without a connection is held when the remote grew, never moved", async () => {
    const shared = base();
    const w = await world(shared);
    await record(w, w.laptop, [new Builder(100).deposit("40")]);
    await sync(w, w.laptop);
    await record(w, w.phone, [new Builder(200).filed(2026, shared)]);
    expect(await sync(w, w.phone)).toMatchObject({ held: { code: "seals_prefix" } });
    await sync(w, w.laptop);
    await settled(w);
  });

  it("10: a correction that no longer fits holds the pair before its reversal: the sale never disappears", async () => {
    const w = await world();
    const phone = new Builder(200);
    const sale = phone.trade("sell", "2", "2027-06-10");
    await record(w, w.phone, [sale]);
    await sync(w, w.phone);
    await sync(w, w.laptop);
    await record(w, w.phone, phone.correction(sale, { quantity: "6" }));
    await record(w, w.laptop, [new Builder(100).trade("sell", "7", "2027-06-11")]);
    await sync(w, w.laptop);
    expect(await sync(w, w.phone)).toMatchObject({ held: { code: "pair_rejected" } });
    expect(await w.bucket.text()).toContain(linesOf([sale])[0]);
    expect(await w.bucket.text()).not.toContain('"reverses_id"');
    await settled(w);
  });

  it("11: behind a held pair, a later sale stays pending, not uploaded, although it would fit", async () => {
    const shared = base();
    const w = await world(shared);
    await record(w, w.laptop, new Builder(100).correction(buyOf(shared), { fee: "3" }));
    await sync(w, w.laptop);
    const phone = new Builder(200);
    await record(w, w.phone, [
      ...phone.correction(buyOf(shared), { quantity: "20" }),
      phone.trade("sell", "5", "2027-06-10"),
    ]);
    expect(await sync(w, w.phone)).toMatchObject({ held: { code: "pair_rejected" }, pending: 1 });
    expect(await sync(w, w.phone)).toMatchObject({ status: "synced", pending: 1 });
    expect(await w.bucket.text()).not.toContain('"quantity":"5"');
    await settled(w);
  });
});
