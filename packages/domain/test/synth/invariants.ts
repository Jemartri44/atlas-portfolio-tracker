// The invariants every synthetic ledger must satisfy (spec FR-005), shared by
// the golden-file tests and the seed property.

import { expect } from "vitest";
import { Quantity } from "../../src/money/quantity.js";
import { integrity } from "../../src/projections/integrity.js";
import { openQuantity } from "../../src/projections/lots.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { snapshotOf } from "../../src/projections/snapshot.js";
import type { LedgerState } from "../../src/projections/state.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { SYNTHETIC_EXPECTED_WARNINGS } from "../../src/synth/scenario.js";

export const checkInvariants = (
  ledger: readonly LedgerEvent[],
  prefixes: "all" | "none",
): LedgerState => {
  const full = projectLedger(ledger, { collectErrors: true });
  expect(full.invalid).toEqual([]);
  expect(integrity(full)).toEqual([]);
  // Bilateral (Q1): no warning outside the declared codes, and every declared code present.
  const codes = new Set(full.warnings.map((warning) => warning.code));
  expect([...codes].sort()).toEqual([...SYNTHETIC_EXPECTED_WARNINGS].sort());
  for (const [assetId] of full.lots) {
    let physical = Quantity.ZERO;
    for (const [key, quantity] of full.positions) {
      if (key.endsWith(`|${assetId}`)) {
        physical = physical.add(quantity);
      }
    }
    expect(openQuantity(full, assetId).eq(physical)).toBe(true);
  }
  expect(JSON.stringify(snapshotOf(projectLedger(ledger)))).toBe(JSON.stringify(snapshotOf(full)));
  if (prefixes === "all") {
    for (let k = 1; k <= ledger.length; k += 1) {
      const prefix = projectLedger(ledger.slice(0, k), { collectErrors: true });
      expect(prefix.invalid.map((entry) => `${k}:${entry.event.type}:${entry.error.code}`)).toEqual(
        [],
      );
    }
  }
  return full;
};
