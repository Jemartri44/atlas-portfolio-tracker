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
import {
  linesOfText,
  parseDiscarded,
  parseHeld,
  sealedIds,
  unresolvedHeld,
} from "@atlas/domain/sync";
import fc from "fast-check";
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
import { Builder, base } from "./builder.js";
import { clock, consoleDevice, type Device, webDevice } from "./devices.js";
import { type Recording, recording } from "./recording-ops.js";
import { defaultRules, SimulatedBucket } from "./simulated-remote.js";

type Step =
  | { kind: "deposit"; device: number; amount: number }
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
    };

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
  );

interface Harness {
  device: Device;
  name: string;
  rec?: Recording;
  deps: UseCaseDeps;
}

const deposits = async (device: Device): Promise<LedgerEvent[]> => {
  const { events } = await device.store.load();
  const reversed = new Set(
    events.flatMap((event) => (event.type === "reversal" ? [event.reverses_id] : [])),
  );
  return events.filter((event) => event.type === "cash_deposit" && !reversed.has(event.id));
};

describe("no line is lost, whatever the order, the cuts and the answers", () => {
  it.each([14, 83, 2026, 4242])(
    "keeps every line written somewhere, the remote valid and the replicas identical (seed %i)",
    async (seed) => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 3 }),
          fc.array(step(3), { minLength: 6, maxLength: 20 }),
          async (count, steps) => {
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
              const device =
                index === 1
                  ? webDevice(shared)
                  : await consoleDevice(shared, (dir) => {
                      rec = recording(dir);
                      return rec.ops;
                    });
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
                deps,
              });
            }
            const [first] = harnesses as [Harness];
            await initialiseRemote(first.device.sync, bucket.as(first.name), options);
            for (const h of harnesses.slice(1)) {
              await replaceFromRemote(h.device.sync, bucket.as(h.name), options, "join");
            }
            const written = new Set(linesOfText(await bucket.text()));
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
            const draftDeposit = (amount: number) => ({
              type: "cash_deposit" as const,
              account_id: "acc_fund",
              value_date: "2027-02-01",
              amount: String(amount),
              currency: "EUR",
              fx_rate: "1",
              fx_rate_date: "2027-02-01",
            });
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
              await correctEvent(
                h.deps,
                (shared as LedgerEvent).id,
                draftDeposit(5 + index),
                "typo",
                {
                  confirmDuplicate: true,
                },
              );
              await noteLocal(h);
            }
            for (const h of [...order, ...order.slice(1)]) {
              await syncDevice(h.device.sync, bucket.as(h.name), options);
            }
            let ghost = 5000;
            for (const s of steps) {
              let h = harnesses[s.device % harnesses.length] as Harness;
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
                  await recordEvent(h.deps, draftDeposit(s.amount), { confirmDuplicate: true });
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
                        } else if (plan.kind === "correct") {
                          await correctEvent(h.deps, plan.target_id, plan.draft, "redo", {
                            ids: sealedIds(plan),
                            confirmDuplicate: true,
                          });
                        } else {
                          // A line, or a lone reversal: its draft, with its sealed id.
                          await recordEvent(h.deps, plan.draft, {
                            id: plan.id,
                            confirmDuplicate: true,
                          });
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
                  await syncDevice(h.device.sync, bucket.as(h.name), options).catch(
                    (error: unknown) => {
                      if (!String(error).includes("cut at")) {
                        throw error;
                      }
                    },
                  );
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
            // Settle: discard what is held back and sync until nothing moves.
            for (let round = 0; round < 6; round += 1) {
              for (const h of harnesses) {
                for (const view of await heldUnits(h.device.sync, options)) {
                  await discardHeldUnit(h.device.sync, view.unit.unit, options);
                }
                await syncDevice(h.device.sync, bucket.as(h.name), options);
              }
            }
            const remote = await bucket.text();
            const events = decodeLines(linesOfText(remote), CURRENT_LEDGER_SCHEMA);
            expect(projectLedger(events, { collectErrors: true }).invalid).toEqual([]);
            const kept = new Set(linesOfText(remote));
            const discardedRecords = [];
            for (const h of harnesses) {
              expect(await h.device.text()).toBe(remote);
              for (const unit of unresolvedHeld(parseHeld(await h.device.held()))) {
                for (const line of unit.lines) {
                  kept.add(line);
                }
              }
              discardedRecords.push(...parseDiscarded(await h.device.discarded()));
            }
            // A line redone counts as kept only if what replaced it is there by
            // its sealed id (R1 of the second review of PR #83): in the remote,
            // or itself discarded by a decision of the user.
            const there = new Set([
              ...events.map((event) => event.id),
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
              expect(kept.has(line), line).toBe(true);
            }
          },
        ),
        { numRuns: 60, seed, endOnFailure: true },
      );
    },
    300_000,
  );
});
