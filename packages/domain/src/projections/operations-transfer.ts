// The projection of a transfer between accounts or custodians: lots keep their
// acquisition date and cost; it is never a sell followed by a buy.

import { ProjectionError } from "../errors.js";
import { Quantity } from "../money/quantity.js";
import type { TransferEvent } from "../schema/events.js";
import { washSaleTransferCounts } from "../settings/wash-sale.js";
import { assertSameBook, requireAccount, requireAsset } from "./catalogue.js";
import { consume, openLot } from "./lots.js";
import { negative, requireAvailable, warnHolders } from "./operations.js";
import { completeRequest, lookupOpenRequest } from "./pending.js";
import { adjustPosition } from "./positions.js";
import type { LedgerState } from "./state.js";
import { enforceTransfer } from "./transfer-rule.js";
import { noteAcquisition, warnRepurchase } from "./wash-sale.js";

export const applyTransfer = (state: LedgerState, event: TransferEvent): void => {
  const fromAccount = requireAccount(state, event.from_account_id, event.id);
  const fromAsset = requireAsset(state, event.from_asset_id, event.id);
  const toAccount = requireAccount(state, event.to_account_id, event.id);
  const toAsset = requireAsset(state, event.to_asset_id, event.id);
  assertSameBook(fromAccount, fromAsset, event.id);
  assertSameBook(toAccount, toAsset, event.id);
  if (fromAsset.book !== toAsset.book) {
    throw new ProjectionError("book_mismatch", event.id, "a transfer cannot cross books", {
      from_asset_id: event.from_asset_id,
      to_asset_id: event.to_asset_id,
    });
  }
  const custody = event.from_asset_id === event.to_asset_id;
  const quantityOut = Quantity.parse(event.quantity_out);
  const quantityIn = Quantity.parse(event.quantity_in);
  const request =
    event.request_id === undefined ? undefined : lookupOpenRequest(state, event.request_id, event);
  if (!custody) {
    enforceTransfer(state, event.id, fromAsset, toAsset, event.recorded_at, event.request_id);
  }
  requireAvailable(state, event.from_account_id, event.from_asset_id, quantityOut, event.id);

  if (request !== undefined) {
    completeRequest(request, event.id, event.value_date_in);
  }
  adjustPosition(
    state,
    event.from_account_id,
    event.from_asset_id,
    negative(quantityOut),
    event.id,
  );
  adjustPosition(state, event.to_account_id, event.to_asset_id, quantityIn, event.id);
  if (custody) {
    warnHolders(state, event.to_asset_id, event.id);
    return;
  }
  const slices = consume(state, event.from_asset_id, quantityOut, event.id, "transfer");
  let assigned = Quantity.ZERO;
  slices.forEach((slice, index) => {
    const quantity =
      index === slices.length - 1
        ? quantityIn.sub(assigned)
        : Quantity.of(quantityIn.value.mul(slice.quantity.value).div(quantityOut.value));
    assigned = assigned.add(quantity);
    openLot(state, {
      asset_id: event.to_asset_id,
      acquisition_date: slice.acquisition_date,
      quantity,
      cost_eur: slice.cost_eur,
      source_event_id: event.id,
      // FIFO tie-break on equal dates keeps the position of the origin event of the consumed lot (data-schema.md §8.1).
      position: slice.position,
      source_lot_id: slice.lot_id,
    });
  });
  // The destination leg acquires homogeneous securities, so it counts for the
  // wash-sale rule unless the criterion is switched off (business-rules.md
  // §5.4, data-schema.md §8.4, fiscal question #2b). It counts on the date the
  // units are subscribed (`value_date_in`, the fiscal date of a fund), which is
  // **not** the acquisition date of the lots: those keep the original one
  // (data-schema.md §8.1), and mixing the two would break the antiquity.
  // A custody transfer returned above: moving the same asset between accounts
  // acquires nothing.
  if (washSaleTransferCounts(state.fiscalSettings)) {
    noteAcquisition(state, {
      event_id: event.id,
      asset_id: event.to_asset_id,
      fiscal_date: event.value_date_in,
      quantity: quantityIn,
    });
    warnRepurchase(
      state,
      event.id,
      event.to_asset_id,
      toAsset.asset_type,
      event.value_date_in,
      quantityIn,
    );
  }
};
