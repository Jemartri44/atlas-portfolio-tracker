// Integrity checks (data-schema.md §7): what a quarterly verification reports.

import { Quantity } from "../money/quantity.js";
import type { AccountId, AssetId } from "../schema/events.js";
import { openQuantity } from "./lots.js";
import type { LedgerState } from "./state.js";

export interface IntegrityFinding {
  severity: "error" | "warning";
  code: string;
  message: string;
  event_ids: string[];
}

export const integrity = (state: LedgerState): IntegrityFinding[] => {
  const findings: IntegrityFinding[] = [];
  const physicalByAsset = new Map<AssetId, Quantity>();
  for (const [key, quantity] of state.positions) {
    const [, assetId] = key.split("|") as [AccountId, AssetId];
    physicalByAsset.set(assetId, (physicalByAsset.get(assetId) ?? Quantity.ZERO).add(quantity));
    if (quantity.isNegative()) {
      findings.push({
        severity: "error",
        code: "negative_position",
        message: `${key} is ${quantity.toString()}`,
        event_ids: [],
      });
    }
  }
  const assetIds = new Set<AssetId>([...physicalByAsset.keys(), ...state.lots.keys()]);
  for (const assetId of assetIds) {
    const physical = physicalByAsset.get(assetId) ?? Quantity.ZERO;
    const lots = openQuantity(state, assetId);
    if (!physical.eq(lots)) {
      findings.push({
        severity: "error",
        code: "lots_mismatch",
        message: `${assetId}: open lots ${lots.toString()} differ from physical positions ${physical.toString()}`,
        event_ids: [],
      });
    }
  }
  for (const [fingerprint, ids] of state.fingerprints) {
    if (ids.length > 1) {
      findings.push({
        severity: "warning",
        code: "duplicate_fingerprint",
        message: `${ids.length} events share fingerprint ${fingerprint}`,
        event_ids: ids,
      });
    }
  }
  for (const { event, error } of state.invalid) {
    findings.push({
      severity: "error",
      code: error.code,
      message: error.message,
      event_ids: [event.id],
    });
  }
  return findings;
};
