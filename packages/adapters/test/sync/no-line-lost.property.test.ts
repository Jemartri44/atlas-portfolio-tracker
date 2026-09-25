// **No line is lost** (plan §7): two or three devices — consoles and a web —
// record, correct and reverse at random over the synthetic base, and sync in a
// random order, with random cuts inside step 6, lost answers and races on the
// remote. At the end: the remote loads and is valid, every replica is the
// remote byte for byte, and **every line ever written is in the remote, in a
// ledger, held back or discarded** — an archive does not count: a line that is
// only there has left the ledger of the user.

import {
  CURRENT_LEDGER_SCHEMA,
  correctEvent,
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
import { discardHeldUnit, heldUnits, initialiseRemote, syncDevice } from "../../src/sync/client.js";
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
  | { kind: "resolve"; device: number };

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
      weight: 1,
      arbitrary: fc.record({ kind: fc.constant("resolve" as const), device: fc.nat(devices - 1) }),
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
  it("keeps every line written somewhere, the remote valid and the replicas identical", async () => {
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
            await syncDevice(h.device.sync, bucket.as(h.name), options);
          }
          const written = new Set(linesOfText(await bucket.text()));
          const noteLocal = async (h: Harness) => {
            for (const line of linesOfText(await h.device.text())) {
              written.add(line);
            }
          };
          let ghost = 5000;
          for (const s of steps) {
            const h = harnesses[s.device % harnesses.length] as Harness;
            const draftDeposit = (amount: number) => ({
              type: "cash_deposit" as const,
              account_id: "acc_fund",
              value_date: "2027-02-01",
              amount: String(amount),
              currency: "EUR",
              fx_rate: "1",
              fx_rate_date: "2027-02-01",
            });
            try {
              if (s.kind === "deposit") {
                await recordEvent(h.deps, draftDeposit(s.amount), { confirmDuplicate: true });
              } else if (s.kind === "sale") {
                await recordEvent(
                  h.deps,
                  {
                    type: "sell",
                    account_id: "acc_fund",
                    asset_id: "ast_world",
                    trade_date: "2027-06-10",
                    value_date: "2027-06-10",
                    quantity: String(s.quantity),
                    unit_price: "100",
                    currency: "EUR",
                    fx_rate: "1",
                    fx_rate_date: "2027-06-10",
                    fee: "0",
                    source: "manual",
                  } as never,
                  { confirmDuplicate: true },
                );
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
                const [held] = await heldUnits(h.device.sync, options);
                if (held !== undefined) {
                  await discardHeldUnit(h.device.sync, held.unit.unit, options);
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
          for (const h of harnesses) {
            expect(await h.device.text()).toBe(remote);
            for (const unit of unresolvedHeld(parseHeld(await h.device.held()))) {
              for (const line of unit.lines) {
                kept.add(line);
              }
            }
            for (const record of parseHeld(await h.device.held())) {
              if (record.kind === "held") {
                kept.add(record.line);
              }
            }
            for (const record of parseDiscarded(await h.device.discarded())) {
              kept.add(record.line);
            }
          }
          for (const line of written) {
            expect(kept.has(line), line).toBe(true);
          }
        },
      ),
      { numRuns: 120, seed: 14, endOnFailure: true },
    );
  }, 300_000);
});
