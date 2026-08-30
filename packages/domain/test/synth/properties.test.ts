// Invariants of the synthetic generator for any seed (spec FR-005): the
// skeleton is fixed, so what the seed changes never breaks the ledger.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { snapshotOf } from "../../src/projections/snapshot.js";
import { encodeLine } from "../../src/schema/line.js";
import { generateLedger } from "../../src/synth/scenario.js";
import { compactLedger, planCompact } from "../../src/usecases/compact.js";
import { TestStore } from "../memory-store.js";
import { TEST_SCHEMA_V2 } from "../schema/test-schema.js";
import { checkInvariants } from "./invariants.js";

describe("generateLedger over seeds", () => {
  it("is a pure function of the seed, byte for byte", () => {
    fc.assert(
      fc.property(fc.nat({ max: 2 ** 32 - 1 }), (seed) => {
        const first = generateLedger({ seed }).map(encodeLine);
        expect(generateLedger({ seed }).map(encodeLine)).toEqual(first);
      }),
      { numRuns: 10 },
    );
  });

  it("projects cleanly prefix by prefix with the declared warnings and a stable snapshot", () => {
    fc.assert(
      fc.property(fc.nat({ max: 2 ** 32 - 1 }), (seed) => {
        const events = generateLedger({ seed });
        const state = checkInvariants(events, "all");
        expect(JSON.stringify(snapshotOf(projectLedger(events)))).toBe(
          JSON.stringify(snapshotOf(state)),
        );
      }),
      { numRuns: 20 },
    );
  });

  it("produces different ledgers for different seeds", () => {
    const a = generateLedger({ seed: 1 }).map(encodeLine).join("\n");
    const b = generateLedger({ seed: 2 }).map(encodeLine).join("\n");
    expect(a).not.toBe(b);
  });

  it("compact under the test schema preserves the snapshot of any synthetic ledger", async () => {
    const clock = { now: () => new Date("2029-02-01T10:00:00.000Z") };
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 2 ** 32 - 1 }), async (seed) => {
        const events = generateLedger({ seed });
        const before = JSON.stringify(snapshotOf(projectLedger(events)));
        // Every line is written at version 1; the store expects version 2, so all of them are outdated.
        const store = TestStore.fromLines(events.map(encodeLine), TEST_SCHEMA_V2);
        const original = store.text();
        const plan = await planCompact({ store, clock });
        expect(plan.outdated).toBe(events.length);
        const result = await compactLedger({ store, clock }, plan);
        expect(result.status).toBe("compacted");
        expect(store.archives.get(plan.archiveName)).toBe(original);
        const reloaded = await store.load();
        expect(reloaded.lines.every((line) => line.startsWith('{"schema_version":2,'))).toBe(true);
        expect(JSON.stringify(snapshotOf(projectLedger(reloaded.events)))).toBe(before);
      }),
      { numRuns: 10 },
    );
  });
});
