// Which assets get the calls of the day, and in which order (ADR-0031,
// «Presupuesto»): twenty or twenty-five calls a day force a priority, and it
// is **fixed** by the ADR, not configurable:
//
//   1. the positions of the bucket (the daily task will warn when a thesis
//      nears its invalidation);
//   2. the index of the bucket (`bucket_benchmark_asset_id`) and the reference
//      ETFs (`reference_etf_id`) of the assets held;
//   3. the rest of the core.
//
// Computed on the ledger **of the console**, which the caller projects at the
// day (`asOf`, P5): an asset without an open position spends no call unless it is a reference.

import { bucketAccountIds } from "../projections/bucket.js";
import type { LedgerState } from "../projections/state.js";
import type { AssetId } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";

export type PriorityGroup = "bucket" | "reference" | "core";

export interface PlannedAsset {
  readonly asset_id: AssetId;
  readonly group: PriorityGroup;
}

/** The assets to price today, bucket first, then references, then the core; by id within a group. */
export const downloadPlan = (state: LedgerState, settings: Settings): PlannedAsset[] => {
  const bucket = bucketAccountIds(state);
  const held = { bucket: new Set<AssetId>(), core: new Set<AssetId>() };
  for (const [key, quantity] of state.positions) {
    const [accountId, assetId] = key.split("|") as [string, AssetId];
    // Every account is of one book or the other (data-schema.md §6.1).
    if (quantity.isPositive()) {
      (bucket.has(accountId) ? held.bucket : held.core).add(assetId);
    }
  }
  const references = new Set<AssetId>();
  const benchmark = settings.bucket_benchmark_asset_id;
  if (benchmark !== undefined && state.assets.has(benchmark)) {
    references.add(benchmark);
  }
  for (const assetId of [...held.bucket, ...held.core]) {
    const reference = state.assets.get(assetId)?.reference_etf_id;
    if (reference !== undefined && state.assets.has(reference)) {
      references.add(reference);
    }
  }
  const plan: PlannedAsset[] = [];
  const seen = new Set<AssetId>();
  const add = (ids: Iterable<AssetId>, group: PriorityGroup): void => {
    for (const assetId of [...ids].sort()) {
      if (!seen.has(assetId)) {
        seen.add(assetId);
        plan.push({ asset_id: assetId, group });
      }
    }
  };
  add(held.bucket, "bucket");
  add(references, "reference");
  add(held.core, "core");
  return plan;
};
