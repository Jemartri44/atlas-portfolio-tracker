// The (account, asset) pairs that lost ownership, in whole or in part, in a
// span of days: what makes a return filed before have to be filed again.
//
// What obliges is the **transmission**, not the net quantity at 31 December
// (DGT V2643-17, V0801-18 and V1030-25: "por cada venta parcial realizada en el
// ejercicio"): selling 100 in March and buying 150 back in June still lost
// ownership of 100. Counted as a loss of ownership: a sale, what a swap hands
// over, what leaves an account in a transfer (the pair that held it no longer
// does, and over-declaring an informative return is the prudent direction) and
// a forced sale of a corporate action. Not counted: a split, a conversion, a
// grant, a dividend or any event a reversal annulled.

import type { CivilDate } from "../dates/civil-date.js";
import type { AccountId, AssetId, LedgerEvent } from "../schema/events.js";

export const pairKey = (accountId: AccountId, assetId?: AssetId): string =>
  assetId === undefined ? accountId : `${accountId}|${assetId}`;

/** Pairs with a transmission dated after `after` and up to `until`, `until` included. */
export const disposedBetween = (
  events: readonly LedgerEvent[],
  after: CivilDate,
  until: CivilDate,
): Set<string> => {
  const annulled = new Set<string>();
  for (const event of events) {
    if (event.type === "reversal") {
      annulled.add(event.reverses_id);
    }
  }
  const within = (date: CivilDate): boolean => date > after && date <= until;
  const lost = new Set<string>();
  for (const event of events) {
    if (annulled.has(event.id)) {
      continue;
    }
    switch (event.type) {
      case "sell":
        if (within(event.trade_date)) {
          lost.add(pairKey(event.account_id, event.asset_id));
        }
        break;
      case "swap":
        if (within(event.trade_date)) {
          lost.add(pairKey(event.account_id, event.from_asset_id));
        }
        break;
      case "transfer":
        if (within(event.value_date_out)) {
          lost.add(pairKey(event.from_account_id, event.from_asset_id));
        }
        break;
      case "corporate_action":
        if (within(event.effective_date)) {
          for (const effect of event.effects) {
            if (effect.op === "forced_sale") {
              for (const entry of effect.per_account) {
                lost.add(pairKey(entry.account_id, effect.asset_id ?? event.asset_id));
              }
            }
          }
        }
        break;
      default:
        break;
    }
  }
  return lost;
};
