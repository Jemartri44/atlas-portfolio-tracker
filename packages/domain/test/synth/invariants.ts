// The invariants every synthetic ledger must satisfy (spec FR-005), shared by
// the golden-file tests and the seed property.

import { expect } from "vitest";
import { isWeekend } from "../../src/dates/civil-date.js";
import { Decimal } from "../../src/money/decimal.js";
import { Quantity } from "../../src/money/quantity.js";
import { integrity } from "../../src/projections/integrity.js";
import { openQuantity } from "../../src/projections/lots.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { snapshotOf } from "../../src/projections/snapshot.js";
import type { LedgerState } from "../../src/projections/state.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { SYNTHETIC_EXPECTED_WARNINGS } from "../../src/synth/scenario.js";

type Priced = {
  currency: string | undefined;
  fx_rate: string | undefined;
  fx_rate_date: string | undefined;
};

/** Every currency/rate pair and rate date a line carries, effects included. */
const pricedPartsOf = (event: LedgerEvent): Priced[] => {
  const raw = event as unknown as Priced & {
    sold_currency?: string;
    fx_rate_sold?: string;
    bought_currency?: string;
    fx_rate_bought?: string;
    effects?: Priced[];
  };
  return [
    raw,
    { currency: raw.sold_currency, fx_rate: raw.fx_rate_sold, fx_rate_date: raw.fx_rate_date },
    { currency: raw.bought_currency, fx_rate: raw.fx_rate_bought, fx_rate_date: raw.fx_rate_date },
    ...(raw.effects ?? []),
  ];
};

/**
 * The hardened validation of the block 0 (challenge 2026-08-31): the ECB never
 * publishes on a weekend, and the euro is its own reference. `validateShape`
 * already rejects both, so this states what the scenario must produce.
 */
const checkEcbRules = (ledger: readonly LedgerEvent[]): void => {
  for (const event of ledger) {
    for (const part of pricedPartsOf(event)) {
      if (part.fx_rate_date !== undefined) {
        expect({
          id: event.id,
          date: part.fx_rate_date,
          weekend: isWeekend(part.fx_rate_date),
        }).toEqual({ id: event.id, date: part.fx_rate_date, weekend: false });
      }
      if (part.currency === "EUR" && part.fx_rate !== undefined) {
        expect({ id: event.id, rate: part.fx_rate }).toEqual({ id: event.id, rate: "1" });
      }
    }
  }
};

/** Target weights are keyed by `asset_id` of core assets and add up to exactly 100 (feature 004). */
const checkTargetWeights = (state: LedgerState): void => {
  for (const entry of state.settingsHistory) {
    const weights = entry.settings.target_weights;
    expect(weights).toBeDefined();
    let total = Decimal.ZERO;
    for (const [assetId, weight] of Object.entries(weights ?? {})) {
      expect(state.assets.get(assetId)?.book).toBe("core");
      total = total.add(Decimal.parse(weight));
    }
    expect(total.toString()).toBe("100");
  }
};

export const checkInvariants = (
  ledger: readonly LedgerEvent[],
  prefixes: "all" | "none",
): LedgerState => {
  const full = projectLedger(ledger, { collectErrors: true });
  expect(full.invalid).toEqual([]);
  checkEcbRules(ledger);
  checkTargetWeights(full);
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
