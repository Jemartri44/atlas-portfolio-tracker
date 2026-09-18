// The warning of the wash-sale rule (business-rules.md §5.4, prompt 005 §3.6),
// in **both directions**: the rule looks at the window before *and* after the
// loss-making sale.
//
// - buying an asset sold at a loss inside the window: `wash_sale_window_repurchase`;
// - selling at a loss an asset bought inside the previous window: `wash_sale_window_prior_buy`.
//
// The second is the more useful of the two, because it arrives while the user
// can still decide not to sell. Both are **warnings on a projected event**, like
// `thesis_size_exceeded`, so they show up in `atlas check` and in the preview of
// `atlas add buy|sell` with no extra code.
//
// This is only the warning. Quantifying the deferred loss, splitting it across
// the repurchased lots and carrying it through transfers and swaps is the tax
// engine of phase 5 (decision (g)): nothing here prepares structures for it.

import type { CivilDate } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import type { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type { AssetId, AssetType } from "../schema/events.js";
import { washSaleWindowEnd, washSaleWindowOf, washSaleWindowStart } from "../settings/wash-sale.js";
import { addWarning, type LedgerState } from "./state.js";

/** A purchase that counts as an acquisition for the rule (data-schema.md §8.4). */
export interface Acquisition {
  event_id: Ulid;
  asset_id: AssetId;
  fiscal_date: CivilDate;
  quantity: Quantity;
}

/**
 * Records a purchase for the rule. A `transfer` in, a `scale` and a zero-cost
 * `grant` are **not** acquisitions (data-schema.md §8.4), so they never get here.
 */
export const noteAcquisition = (state: LedgerState, acquisition: Acquisition): void => {
  const previous = state.acquisitions.get(acquisition.asset_id) ?? [];
  previous.push(acquisition);
  state.acquisitions.set(acquisition.asset_id, previous);
};

/**
 * Warns when a purchase falls inside the window of a previous loss-making sale
 * of the same asset. Runs while applying the buy, so `state.gains` holds
 * exactly what happened before it in time.
 */
export const warnRepurchase = (
  state: LedgerState,
  eventId: Ulid,
  assetId: AssetId,
  assetType: AssetType,
  fiscalDate: CivilDate,
): void => {
  const window = washSaleWindowOf(state.fiscalSettings, assetType);
  for (const gain of state.gains) {
    if (gain.asset_id !== assetId || !gain.gain_eur.amount.isNegative()) {
      continue;
    }
    const end = washSaleWindowEnd(gain.fiscal_date, window);
    if (fiscalDate <= end) {
      addWarning(
        state,
        "wash_sale_window_repurchase",
        eventId,
        `buying ${assetId} within the wash-sale window of the sale ${gain.event_id} (${gain.fiscal_date}, loss ${gain.gain_eur.roundToCents().amount.toString()} EUR, window until ${end})`,
        {
          asset_id: assetId,
          sale_event_id: gain.event_id,
          sale_date: gain.fiscal_date,
          quantity: gain.quantity.toString(),
          loss_eur: gain.gain_eur.roundToCents().amount.toString(),
          window_end: end,
          window,
        },
      );
    }
  }
};

/**
 * Warns when a loss-making sale has purchases of the same asset inside the
 * window **before** it: the other half of the rule, and the one that arrives in
 * time to matter.
 */
export const warnPriorBuys = (
  state: LedgerState,
  eventId: Ulid,
  assetId: AssetId,
  assetType: AssetType,
  fiscalDate: CivilDate,
  loss: Money,
): void => {
  const window = washSaleWindowOf(state.fiscalSettings, assetType);
  const start = washSaleWindowStart(fiscalDate, window);
  for (const acquisition of state.acquisitions.get(assetId) ?? []) {
    if (acquisition.fiscal_date >= start && acquisition.fiscal_date < fiscalDate) {
      addWarning(
        state,
        "wash_sale_window_prior_buy",
        eventId,
        `selling ${assetId} at a loss of ${loss.roundToCents().amount.toString()} EUR with a purchase (${acquisition.event_id}, ${acquisition.fiscal_date}) inside the window that opened on ${start}`,
        {
          asset_id: assetId,
          buy_event_id: acquisition.event_id,
          buy_date: acquisition.fiscal_date,
          quantity: acquisition.quantity.toString(),
          loss_eur: loss.roundToCents().amount.toString(),
          window_start: start,
          window,
        },
      );
    }
  }
};
