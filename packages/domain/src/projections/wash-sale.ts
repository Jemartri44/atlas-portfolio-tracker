// The warning of the wash-sale rule (business-rules.md §5.4, prompt 005 §3.6),
// in **both directions**: the rule looks at the window before *and* after the
// loss-making transmission.
//
// - acquiring an asset transmitted at a loss inside the window: `wash_sale_window_repurchase`;
// - transmitting at a loss an asset acquired inside the previous window: `wash_sale_window_prior_buy`.
//
// A transmission is a `sell` **or** a `forced_sale` (a fund liquidation, the
// cash in lieu of a reverse split, the cash leg of a merger): the rule looks at
// the loss, not at who decided it. An acquisition is what `noteAcquisition`
// says below.
//
// The second warning is the more useful of the two, because it arrives while
// the user can still decide not to sell. Both are **warnings on a projected
// event**, like `thesis_size_exceeded`, so they show up in `atlas check` and in
// the preview of `atlas add buy|sell` with no extra code.
//
// This is only the warning. Quantifying the deferred loss, splitting it across
// the repurchased lots and carrying it through transfers and swaps is the tax
// engine (`tax/wash-sale.ts`, feature 009), which walks the lot journal after
// the projection. The warning follows the same rule for what a prior purchase
// is (#18); how much each purchase defers only the engine knows, which is why
// the text says "may" and points at `atlas tax`.

import { type CivilDate, yearOf } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import type { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type { AssetId, AssetType } from "../schema/events.js";
import { washSaleWindowEnd, washSaleWindowOf, washSaleWindowStart } from "../settings/wash-sale.js";
import { type AssetLots, addWarning, type LedgerState } from "./state.js";

/** An acquisition that counts for the rule (data-schema.md §8.4). */
export interface Acquisition {
  event_id: Ulid;
  asset_id: AssetId;
  fiscal_date: CivilDate;
  quantity: Quantity;
}

/**
 * Records an acquisition for the rule: a `buy`, a `grant` with a cost and —
 * unless `Settings.wash_sale_transfer_counts` says otherwise — a `transfer`
 * **in**, which acquires homogeneous securities even though nothing is taxed at
 * the origin (data-schema.md §8.4, fiscal question #2b). A `scale` (free
 * shares) and a zero-cost `grant` are **not** acquisitions, because nothing is
 * paid, so they never get here.
 */
export const noteAcquisition = (state: LedgerState, acquisition: Acquisition): void => {
  const previous = state.acquisitions.get(acquisition.asset_id) ?? [];
  previous.push(acquisition);
  state.acquisitions.set(acquisition.asset_id, previous);
};

/**
 * Warns when an acquisition falls inside the window of a previous loss-making
 * transmission of the same asset. Runs while applying the buy (or the transfer
 * in), so `state.gains` holds exactly what happened before it in time.
 *
 * The warning names the purchase by its date and quantity and the sale by its
 * asset and date, and says the tax year with its number (feature 009): "this
 * year" read a year later is false. It says the loss **may** not be computable,
 * because a purchase only defers the part it covers — and none when earlier
 * purchases already covered it (#19). The figure is the tax engine's.
 */
export const warnRepurchase = (
  state: LedgerState,
  eventId: Ulid,
  assetId: AssetId,
  assetType: AssetType,
  fiscalDate: CivilDate,
  quantity: Quantity,
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
        `buying ${quantity.toString()} of ${assetId} on ${fiscalDate} within the wash-sale window of its loss-making sale of ${gain.fiscal_date} (loss ${gain.gain_eur.roundToCents().amount.toString()} EUR, window until ${end}): that loss may not be computable in ${yearOf(gain.fiscal_date)}`,
        {
          asset_id: assetId,
          buy_date: fiscalDate,
          buy_quantity: quantity.toString(),
          sale_event_id: gain.event_id,
          sale_date: gain.fiscal_date,
          loss_eur: gain.gain_eur.roundToCents().amount.toString(),
          tax_year: yearOf(gain.fiscal_date),
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
 *
 * Day zero belongs to both halves: a purchase with the **same fiscal date** as
 * the loss-making sale is inside the window. What keeps it from being warned
 * about twice is the position in the file, which is also the order pass B
 * applies: what is already in `state.acquisitions` when the sale is applied
 * came before it, so it is a prior buy; a purchase recorded after the sale
 * finds the loss in `state.gains` and is a repurchase.
 *
 * Only a purchase the sale leaves in the patrimony is named (criterion #18):
 * one whose lots this very sale consumed, or that is already gone, defers
 * nothing, and the tax engine agrees. It runs after the sale consumed its lots,
 * so "still held" is "still has an open lot of this asset".
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
  // The sale has just consumed lots of this asset, so its inventory exists.
  const open = (state.lots.get(assetId) as AssetLots).open;
  for (const acquisition of state.acquisitions.get(assetId) ?? []) {
    const held = open.some((lot) => lot.source_event_id === acquisition.event_id);
    if (held && acquisition.fiscal_date >= start && acquisition.fiscal_date <= fiscalDate) {
      addWarning(
        state,
        "wash_sale_window_prior_buy",
        eventId,
        `selling ${assetId} at a loss of ${loss.roundToCents().amount.toString()} EUR on ${fiscalDate} with a purchase of ${acquisition.quantity.toString()} on ${acquisition.fiscal_date} still held, inside the window that opened on ${start}: the loss may not be computable in ${yearOf(fiscalDate)}`,
        {
          asset_id: assetId,
          sale_date: fiscalDate,
          buy_event_id: acquisition.event_id,
          buy_date: acquisition.fiscal_date,
          buy_quantity: acquisition.quantity.toString(),
          loss_eur: loss.roundToCents().amount.toString(),
          tax_year: yearOf(fiscalDate),
          window_start: start,
          window,
        },
      );
    }
  }
};
