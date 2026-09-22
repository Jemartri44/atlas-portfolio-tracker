// Which assets of the core the configuration asks a target weight for.
//
// The defect round decided «only active assets», and the screen filtered on
// the `active` flag of the catalogue. That flag is not enough: a delisting is
// followed by an update that deactivates the asset, but a fund merger, a
// change of share class or a merger **converts** every unit into another asset
// and leaves the old one active in the catalogue, with nothing in it and no
// way to buy it. So «Small Cap Index Fund» and «Global Bond Index Fund» came
// back with an empty weight after their merger and their class change (review
// of 2026-09-19). An asset a corporate action converted away, and that holds
// nothing, is not asked for a weight.

import {
  type Asset,
  assets,
  type CivilDate,
  type LedgerEvent,
  type LedgerState,
  physicalPositions,
  type Settings,
} from "@atlas/domain";

/**
 * The assets a live corporate action, effective by `date`, turned into another
 * one and that hold no position any more: gone as an investment, though the
 * catalogue still lists them as active.
 */
export const absorbedAssets = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  date: CivilDate,
): ReadonlySet<string> => {
  const held = new Set(physicalPositions(state).map((row) => row.asset_id));
  const absorbed = new Set<string>();
  for (const event of events) {
    if (
      event.type !== "corporate_action" ||
      state.reversed.has(event.id) ||
      event.effective_date > date
    ) {
      continue;
    }
    const converted = event.effects.some(
      (effect) => effect.op === "convert" && effect.to_asset_id !== event.asset_id,
    );
    if (converted && !held.has(event.asset_id)) {
      absorbed.add(event.asset_id);
    }
  }
  return absorbed;
};

/**
 * The core assets the weights are asked for: the active ones that were not
 * converted away, plus any other one **while it still carries a weight**, so
 * that saving never drops a weight the user cannot see.
 */
export const weightedAssets = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  settings: Settings,
  date: CivilDate,
): Asset[] => {
  const absorbed = absorbedAssets(state, events, date);
  return assets(state).filter(
    (asset) =>
      asset.book === "core" &&
      ((asset.active && !absorbed.has(asset.asset_id)) ||
        (settings.target_weights?.[asset.asset_id] ?? "") !== ""),
  );
};
