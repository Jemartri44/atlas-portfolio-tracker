// **No line is lost** (plan §7): two or three devices — consoles and a web —
// record, correct and reverse at random over the synthetic base, and sync in a
// random order, with random cuts inside step 6, lost answers and races on the
// remote. At the end: the remote loads and is valid, every replica is the
// remote byte for byte, and **every line ever written is in the remote, in a
// ledger, held back and unresolved, or discarded by a decision of the user**
// — an archive does not count, nor a held record already resolved: a line only
// there has left every place the user sees (review of PR #83, non-blocking 1).
// The devices also confirm, discard and redo, and a resolution is cut at any
// of its writes.
//
// Feature 015, E3, block 5, point 7 — the three holes of the roadmap, closed,
// each counted (how many runs reach the state that matters) and each seen to
// kill a mutant that survived without it (questions.md §24):
// 1. half of the runs **end with something held, unresolved**: nothing is
//    discarded to settle, and a line held is never also in the queue;
// 2. **the web is cut too**, a write of its one transaction failing, which
//    aborts and rolls back everything it wrote;
// 3. the devices **join again** (from the remote or with their lines, cut and
//    repeated in the same second), **download again** after an administration
//    rewrote the remote, and meet **a closed year**.

import { writeFile } from "node:fs/promises";
import {
  CURRENT_LEDGER_SCHEMA,
  correctEvent,
  createUlidGenerator,
  decodeLines,
  type LedgerEvent,
  projectLedger,
  recordEvent,
  reverseEvent,
  type UseCaseDeps,
} from "@atlas/domain";
import { linesOfText, parseDiscarded, parseHeld, unresolvedHeld } from "@atlas/domain/sync";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  confirmHeldUnit,
  discardHeldUnit,
  finishRedo,
  heldUnits,
  initialiseRemote,
  joinWithOwnLines,
  recordRedoPlan,
  replaceFromRemote,
  type SyncOptions,
  startRedo,
  syncDevice,
} from "../../src/sync/client.js";
import { Builder, base } from "./builder.js";
import { clock, consoleDevice, type Device, type WebDevice, webDevice } from "./devices.js";
import { type Recording, recording } from "./recording-ops.js";
import { defaultRules, SimulatedBucket } from "./simulated-remote.js";

type Step =
  | { kind: "deposit"; device: number; amount: number; old: boolean }
  | { kind: "sale"; device: number; quantity: number }
  | { kind: "correct"; device: number; amount: number }
  | { kind: "reverse"; device: number }
  | { kind: "sync"; device: number; trouble: "none" | "cut" | "lost" | "race"; cut: number }
  | {
      kind: "resolve";
      device: number;
      action: "confirm" | "discard" | "redo";
      cut: number | undefined;
      /** Which held unit, of those there are. */
      pick: number;
      /** Whether a redo started is recorded before finishing it (a user may leave it). */
      record: boolean;
    }
  // Point 7 of block 5 (feature 015): joining again, a rewrite of the remote
  // and downloading it again, and a year filed on one device.
  | { kind: "rejoin"; device: number; how: "remote" | "own"; cut: number | undefined }
  | { kind: "rewrite" }
  | { kind: "redownload"; device: number }
  | { kind: "file"; device: number };

/** Every write a resolution can make, to cut it there (B1 of the review of PR #83). */
const RESOLUTION_CUTS = [
  /^open sync\/held\.jsonl\.tmp/,
  /^open sync\/discarded\.jsonl\.tmp/,
  /^open archive\//,
  /^open ledger\.jsonl\.tmp/,
  /^rename ledger\.jsonl\.tmp/,
  /^open sync\/state\.json\.tmp/,
];

const CUTS = [
  /^open sync\/held\.jsonl\.tmp/,
  /^open ledger\.jsonl\.tmp/,
  /^rename ledger\.jsonl\.tmp/,
  /^open sync\/state\.json\.tmp/,
];

/**
 * Weighted towards what makes a line move: syncs (with trouble half of the
 * time), and sales that fit locally and not over the remote, which are held.
 */
const step = (devices: number): fc.Arbitrary<Step> =>
  fc.oneof(
    {
      weight: 2,
      arbitrary: fc.record({
        kind: fc.constant("deposit" as const),
        device: fc.nat(devices - 1),
        amount: fc.integer({ min: 1, max: 4 }),
        old: fc.boolean(),
      }),
    },
    {
      weight: 3,
      arbitrary: fc.record({
        kind: fc.constant("sale" as const),
        device: fc.nat(devices - 1),
        quantity: fc.integer({ min: 4, max: 9 }),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant("correct" as const),
        device: fc.nat(devices - 1),
        amount: fc.integer({ min: 1, max: 4 }),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({ kind: fc.constant("reverse" as const), device: fc.nat(devices - 1) }),
    },
    {
      weight: 6,
      arbitrary: fc.record({
        kind: fc.constant("sync" as const),
        device: fc.nat(devices - 1),
        trouble: fc.constantFrom(
          "none" as const,
          "cut" as const,
          "cut" as const,
          "lost" as const,
          "race" as const,
        ),
        cut: fc.nat(CUTS.length - 1),
      }),
    },
    {
      weight: 4,
      arbitrary: fc.record({
        kind: fc.constant("resolve" as const),
        device: fc.nat(devices - 1),
        action: fc.constantFrom("confirm" as const, "discard" as const, "redo" as const),
        cut: fc.option(fc.nat(RESOLUTION_CUTS.length - 1), { nil: undefined }),
        pick: fc.nat(3),
        record: fc.boolean(),
      }),
    },
    {
      weight: 2,
      arbitrary: fc.record({
        kind: fc.constant("rejoin" as const),
        device: fc.nat(devices - 1),
        how: fc.constantFrom("remote" as const, "own" as const),
        cut: fc.option(fc.nat(RESOLUTION_CUTS.length - 1), { nil: undefined }),
      }),
    },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant("rewrite" as const) }) },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant("redownload" as const),
        device: fc.nat(devices - 1),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({ kind: fc.constant("file" as const), device: fc.nat(devices - 1) }),
    },
  );

interface Harness {
  device: Device;
  name: string;
  rec?: Recording;
  web?: WebDevice;
  deps: UseCaseDeps;
}

/**
 * How many runs reached each state the extensions of point 7 are about: a
 * property that almost never reaches the state that matters proves nothing
 * (lesson of §10.7 of feature 014). Said in questions.md §24.
 */
const reached = {
  runs: 0,
  endedHeld: 0,
  webCuts: 0,
  rejoins: 0,
  rejoinsRepeated: 0,
  rewrites: 0,
  redownloads: 0,
  closedYearHeld: 0,
};

/** A line rewritten by an administration: its new bytes keep the old one. */
const reformat = (line: string): string =>
  line.replace('"schema_version":1,', '"schema_version": 1,');

const deposits = async (device: Device): Promise<LedgerEvent[]> => {
  const { events } = await device.store.load();
  const reversed = new Set(
    events.flatMap((event) => (event.type === "reversal" ? [event.reverses_id] : [])),
  );
  return events.filter((event) => event.type === "cash_deposit" && !reversed.has(event.id));
};

/** One run of the property: the devices, the steps, and how it ends. */
const scenario = async (count: number, steps: readonly Step[], endHeld: boolean): Promise<void> => {
  reached.runs += 1;
  const shared = base();
  const bucket = SimulatedBucket.inMemory(() => ({
    ...defaultRules(),
    now: new Date("2027-12-31T00:00:00.000Z"),
  }));
  const options = clock("2027-09-01T09:00:00.000Z");
  let tick = Date.parse("2027-09-01T10:00:00.000Z");
  let random = 0;
  const harnesses: Harness[] = [];
  for (let index = 0; index < count; index += 1) {
    let rec: Recording | undefined;
    const web = index === 1 ? webDevice(shared) : undefined;
    const device =
      web ??
      (await consoleDevice(shared, (dir) => {
        rec = recording(dir);
        return rec.ops;
      }));
    const deps: UseCaseDeps = {
      store: device.store,
      clock: {
        now: () => {
          tick += 1000;
          return new Date(tick);
        },
      },
      random: (target) => {
        random += 1;
        target.fill((random * 7 + index * 31) % 256);
      },
    };
    harnesses.push({
      device,
      name: `d${index}`,
      ...(rec === undefined ? {} : { rec }),
      ...(web === undefined ? {} : { web }),
      deps,
    });
  }
  const [first] = harnesses as [Harness];
  await initialiseRemote(first.device.sync, bucket.as(first.name), options);
  for (const h of harnesses.slice(1)) {
    await replaceFromRemote(h.device.sync, bucket.as(h.name), options, "join");
  }
  const written = new Set(linesOfText(await bucket.text()));
  /** A line an administration rewrote, and the bytes it has now. */
  const rewritten = new Map<string, string>();
  const noteLocal = async (h: Harness) => {
    for (const line of linesOfText(await h.device.text())) {
      written.add(line);
    }
  };
  const sell = (h: Harness, quantity: number) =>
    recordEvent(
      h.deps,
      {
        type: "sell",
        account_id: "acc_fund",
        asset_id: "ast_world",
        trade_date: "2027-06-10",
        value_date: "2027-06-10",
        quantity: String(quantity),
        unit_price: "100",
        currency: "EUR",
        fx_rate: "1",
        fx_rate_date: "2027-06-10",
        fee: "0",
        source: "manual",
      } as never,
      { confirmDuplicate: true },
    );
  const draftDeposit = (amount: number, date = "2027-02-01") => ({
    type: "cash_deposit" as const,
    account_id: "acc_fund",
    value_date: date,
    amount: String(amount),
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: date,
  });
  /** A second that does not move: a cut and its repeat take the same archive name. */
  const stopped = (): SyncOptions => {
    const at = new Date(tick);
    return { ...options, now: () => at };
  };
  // Prelude: the web device records a deposit every device receives;
  // then every device sells 6 of the 10 and corrects that deposit, and
  // the web device syncs first. Each console device starts with a
  // sale and a pair held back — the pair beside the web's correction
  // of the same deposit, case 3 of ADR-0026 — so the resolutions,
  // their cuts and the redo of a pair have something to act on.
  const order = [harnesses[1], harnesses[0], harnesses[2]].filter(
    (h): h is Harness => h !== undefined,
  );
  const web = order[0] as Harness;
  await recordEvent(web.deps, draftDeposit(3), { confirmDuplicate: true });
  await noteLocal(web);
  for (const h of order) {
    await syncDevice(h.device.sync, bucket.as(h.name), options);
  }
  for (const [index, h] of harnesses.entries()) {
    await sell(h, 6);
    const [shared] = await deposits(h.device);
    await correctEvent(h.deps, (shared as LedgerEvent).id, draftDeposit(5 + index), "typo", {
      confirmDuplicate: true,
    });
    await noteLocal(h);
  }
  for (const h of [...order, ...order.slice(1)]) {
    await syncDevice(h.device.sync, bucket.as(h.name), options);
  }
  let ghost = 5000;
  for (const s of steps) {
    let h = harnesses[("device" in s ? s.device : 0) % harnesses.length] as Harness;
    if (s.kind === "resolve") {
      // The first device, from the one drawn, that has something held.
      for (let offset = 0; offset < harnesses.length; offset += 1) {
        const candidate = harnesses[(s.device + offset) % harnesses.length] as Harness;
        if ((await heldUnits(candidate.device.sync, options)).length > 0) {
          h = candidate;
          break;
        }
      }
    }
    try {
      if (s.kind === "deposit") {
        await recordEvent(h.deps, draftDeposit(s.amount, s.old ? "2026-05-05" : "2027-02-01"), {
          confirmDuplicate: true,
        });
      } else if (s.kind === "sale") {
        await sell(h, s.quantity);
      } else if (s.kind === "correct" || s.kind === "reverse") {
        const own = await deposits(h.device);
        const target = own[own.length - 1];
        if (target !== undefined && s.kind === "correct") {
          await correctEvent(h.deps, target.id, draftDeposit(s.amount), "typo", {
            confirmDuplicate: true,
          });
        } else if (target !== undefined) {
          await reverseEvent(h.deps, target.id, "gone");
        }
      } else if (s.kind === "rejoin") {
        reached.rejoins += 1;
        const when = stopped();
        const rejoin = () =>
          s.how === "remote"
            ? replaceFromRemote(h.device.sync, bucket.as(h.name), when, "join")
            : joinWithOwnLines(h.device.sync, bucket.as(h.name), when);
        if (s.cut !== undefined && h.rec !== undefined) {
          h.rec.failAt(RESOLUTION_CUTS[s.cut] as RegExp);
          const cut = await rejoin().then(
            () => false,
            (error: unknown) => {
              if (!String(error).includes("cut at")) {
                throw error;
              }
              return true;
            },
          );
          h.rec.failAt(/^$never/);
          if (cut) {
            // The user repeats it, in the same second: an archive of
            // the cut is never overwritten, and it is not a refusal.
            reached.rejoinsRepeated += 1;
            await rejoin().catch((error: unknown) => {
              // Never refused for the archive of the cut (point 6): an
              // assertion, not a code, so that it is not taken for a refusal.
              expect((error as { code?: string }).code).not.toBe("archive_exists");
              throw error;
            });
          }
        } else {
          await rejoin();
        }
      } else if (s.kind === "rewrite") {
        // An administration rewrites the remote keeping every id
        // (case 7): other bytes, the same events.
        const before = linesOfText(await bucket.text());
        if (before.length > 0) {
          reached.rewrites += 1;
          const now = new Map(before.map((line) => [line, reformat(line)] as const));
          // A line rewritten twice: its first bytes keep its last ones.
          for (const [first, last] of rewritten) {
            rewritten.set(first, now.get(last) ?? last);
          }
          for (const [line, next] of now) {
            rewritten.set(line, next);
          }
          await bucket.rewrite(before.map((line) => `${reformat(line)}\n`).join(""));
        }
      } else if (s.kind === "redownload") {
        reached.redownloads += 1;
        await replaceFromRemote(h.device.sync, bucket.as(h.name), options, "redownload");
      } else if (s.kind === "file") {
        // A return filed for 2026 over what this device has: a
        // deposit of 2026 on another device meets a closed year.
        // What both devices hold is discarded first (nothing is uploaded
        // while something is held); then the filing, synced so that it seals
        // what the remote has; then the next device records in that year and
        // syncs: a closed year.
        const other = harnesses[(harnesses.indexOf(h) + 1) % harnesses.length] as Harness;
        for (const device of [h, other]) {
          for (const view of await heldUnits(device.device.sync, options)) {
            await discardHeldUnit(device.device.sync, view.unit.unit, options);
          }
        }
        await syncDevice(other.device.sync, bucket.as(other.name), options);
        await syncDevice(h.device.sync, bucket.as(h.name), options);
        const { events } = await h.device.store.load();
        ghost += 1;
        await h.device.record([new Builder(ghost * 5).filed(2026, events)]);
        await syncDevice(h.device.sync, bucket.as(h.name), options);
        await noteLocal(h);
        await recordEvent(other.deps, draftDeposit(2, "2026-05-05"), { confirmDuplicate: true });
        await noteLocal(other);
        const outcome = await syncDevice(other.device.sync, bucket.as(other.name), options);
        if (outcome.status === "synced" && outcome.held?.code === "new_closed_year") {
          reached.closedYearHeld += 1;
        }
      } else if (s.kind === "resolve") {
        const views = await heldUnits(h.device.sync, options);
        const view = views[s.pick % Math.max(views.length, 1)];
        if (view !== undefined) {
          const id = view.unit.unit;
          const action =
            s.action === "confirm" && !view.resolutions.includes("confirm")
              ? "discard"
              : s.action === "redo" && !view.resolutions.includes("redo")
                ? "discard"
                : s.action;
          if (action === "redo") {
            // Recorded as the user would, on the current state, with the
            // ids sealed; or left unrecorded. Then finished.
            const ids = createUlidGenerator(h.deps);
            const plan = await startRedo(h.device.sync, id, () => ids.next(), options);
            try {
              if (!s.record) {
                // The user leaves it: finishing has to refuse.
              } else {
                // As the product records it (feature 015, P6): the sealed plan.
                await recordRedoPlan(h.deps, plan, { confirmDuplicate: true });
              }
            } catch (error) {
              if (!(error instanceof Error) || !("code" in error)) {
                throw error;
              }
            }
            await noteLocal(h);
          }
          if (s.cut !== undefined && h.rec !== undefined) {
            h.rec.failAt(RESOLUTION_CUTS[s.cut] as RegExp);
          }
          const resolve =
            action === "confirm"
              ? confirmHeldUnit(h.device.sync, id, options)
              : action === "discard"
                ? discardHeldUnit(h.device.sync, id, options)
                : finishRedo(h.device.sync, id, options);
          await resolve.catch((error: unknown) => {
            if (
              !String(error).includes("cut at") &&
              (error as { code?: string }).code !== "redo_not_recorded"
            ) {
              throw error;
            }
          });
          h.rec?.failAt(/^$never/);
        }
      } else {
        if (s.trouble === "cut" && h.rec !== undefined) {
          h.rec.failAt(CUTS[s.cut] as RegExp);
        } else if (s.trouble === "cut" && h.web !== undefined) {
          // The web is cut too (point 7): one write of its one
          // transaction fails, and all of it rolls back.
          h.web.db.cutNextWrite();
          reached.webCuts += 1;
        } else if (s.trouble === "lost") {
          bucket.loseNextAnswer = true;
        } else if (s.trouble === "race") {
          let once = true;
          bucket.beforeWrite = async () => {
            if (once) {
              once = false;
              ghost += 1;
              const line = new Builder(ghost * 3).deposit(String(ghost));
              await bucket.appendRaw([JSON.stringify(line)]);
              written.add(JSON.stringify(line));
            }
          };
        }
        await syncDevice(h.device.sync, bucket.as(h.name), options).then(
          (outcome) => {
            if (outcome.status === "synced" && outcome.held?.code === "new_closed_year") {
              reached.closedYearHeld += 1;
            }
          },
          (error: unknown) => {
            if (
              !String(error).includes("cut at") &&
              (error as { name?: string }).name !== "StorageUnavailable"
            ) {
              throw error;
            }
          },
        );
        h.web?.db.takeCut();
        bucket.beforeWrite = undefined;
        bucket.loseNextAnswer = false;
        h.rec?.failAt(/^$never/);
      }
    } catch (error) {
      // The application refuses what the local ledger does not admit:
      // nothing written, nothing to keep.
      if (!(error instanceof Error) || !("code" in error)) {
        throw error;
      }
    }
    await noteLocal(h);
  }
  // Settle: sync until nothing moves — discarding what is held
  // back, or, in half of the runs, **leaving it held** (point 7).
  for (let round = 0; round < 6; round += 1) {
    for (const h of harnesses) {
      if (!endHeld) {
        for (const view of await heldUnits(h.device.sync, options)) {
          await discardHeldUnit(h.device.sync, view.unit.unit, options);
        }
      }
      const outcome = await syncDevice(h.device.sync, bucket.as(h.name), options);
      if (outcome.status === "stopped" && outcome.stop.code === "remote_rewritten") {
        await replaceFromRemote(h.device.sync, bucket.as(h.name), options, "redownload");
      }
    }
  }
  const remote = await bucket.text();
  const events = decodeLines(linesOfText(remote), CURRENT_LEDGER_SCHEMA);
  expect(projectLedger(events, { collectErrors: true }).invalid).toEqual([]);
  const kept = new Set(linesOfText(remote));
  const discardedRecords = [];
  let anyHeld = false;
  for (const h of harnesses) {
    const local = await h.device.text();
    const heldUnitsNow = unresolvedHeld(parseHeld(await h.device.held()));
    if (heldUnitsNow.length === 0) {
      expect(local).toBe(remote);
    } else {
      // Something held: the replica is the remote followed by its
      // queue, and a line held is never also in the queue.
      anyHeld = true;
      expect(local.startsWith(remote), `${h.name} starts with the remote`).toBe(true);
      const queue = new Set(linesOfText(local.slice(remote.length)));
      for (const unit of heldUnitsNow) {
        for (const line of unit.lines) {
          expect(queue.has(line), `${h.name} holds a line of its queue`).toBe(false);
        }
      }
      for (const line of linesOfText(local)) {
        kept.add(line);
      }
    }
    for (const unit of heldUnitsNow) {
      for (const line of unit.lines) {
        kept.add(line);
      }
    }
    discardedRecords.push(...parseDiscarded(await h.device.discarded()));
  }
  if (anyHeld) {
    reached.endedHeld += 1;
  }
  // A line redone counts as kept only if what replaced it is there by
  // its sealed id (R1 of the second review of PR #83): in the remote,
  // or itself discarded by a decision of the user.
  // Or in a queue: a run that ends with something held keeps the lines
  // behind it pending, the redo of another unit among them (point 7).
  const queued: string[] = [];
  for (const h of harnesses) {
    queued.push(...(await h.device.store.load()).events.map((event) => event.id));
    // Or held again, unresolved: a redone line downloaded over is held (point 7).
    for (const unit of unresolvedHeld(parseHeld(await h.device.held()))) {
      queued.push(...unit.lines.map((line) => (JSON.parse(line) as { id: string }).id));
    }
  }
  const there = new Set([
    ...events.map((event) => event.id),
    ...queued,
    ...discardedRecords
      .filter((record) => record.reason.code === "discarded_by_user")
      .map((record) => (JSON.parse(record.line) as { id: string }).id),
  ]);
  for (const record of discardedRecords) {
    if (
      record.reason.code !== "redone" ||
      (record.replaced_by !== undefined && there.has(record.replaced_by))
    ) {
      kept.add(record.line);
    }
  }
  for (const line of written) {
    const now = rewritten.get(line);
    expect(kept.has(line) || (now !== undefined && kept.has(now)), line).toBe(true);
  }
};

describe("no line is lost, whatever the order, the cuts and the answers", () => {
  it.each([14, 83, 2026, 4242])(
    "keeps every line written somewhere, the remote valid and the replicas identical (seed %i)",
    async (seed) => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 3 }),
          fc.array(step(3), { minLength: 6, maxLength: 20 }),
          fc.boolean(),
          scenario,
        ),
        { numRuns: 60, seed, endOnFailure: true },
      );
    },
    300_000,
  );

  it("reached each state the extensions of point 7 are about", async () => {
    const out = process.env.ATLAS_PROPERTY_REACHED;
    if (out !== undefined) {
      await writeFile(out, `${JSON.stringify(reached)}\n`);
    }
    for (const [state, count] of Object.entries(reached)) {
      expect(count, state).toBeGreaterThan(0);
    }
  });
});
