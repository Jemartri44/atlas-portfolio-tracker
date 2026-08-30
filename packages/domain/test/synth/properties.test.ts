// Invariants of the synthetic generator for any seed (spec FR-005): the
// skeleton is fixed, so what the seed changes never breaks the ledger.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { snapshotOf } from "../../src/projections/snapshot.js";
import { encodeLine } from "../../src/schema/line.js";
import { generateLedger } from "../../src/synth/scenario.js";
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
});
