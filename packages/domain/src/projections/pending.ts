// Tracking events (ADR-0010, ADR-0012): orders and transfer requests. They
// never touch lots or cash; a later buy/sell/transfer closes them.

import type { CivilDate } from "../dates/civil-date.js";
import { ProjectionError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import type {
  AccountId,
  AssetId,
  OrderPlacedEvent,
  OrderSide,
  OrderUpdatedEvent,
  TransferRequestedEvent,
  TransferRequestUpdatedEvent,
} from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { assertSameBook, requireAccount, requireAsset } from "./catalogue.js";
import type { LedgerState, PendingOrder, PendingTransfer, Warning } from "./state.js";

const DAY_MS = 86_400_000;

export const daysBetween = (from: CivilDate, to: CivilDate): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

// --- Orders ---------------------------------------------------------------

const requireOrder = (state: LedgerState, orderId: Ulid, eventId: Ulid): PendingOrder => {
  const order = state.orders.get(orderId);
  if (order === undefined) {
    throw new ProjectionError("unknown_order", eventId, `order ${orderId} does not exist`, {
      order_id: orderId,
    });
  }
  if (order.stage !== "open") {
    throw new ProjectionError(
      "order_closed",
      eventId,
      `order ${orderId} is already ${order.stage}`,
      {
        order_id: orderId,
        stage: order.stage,
        closed_by: order.closed_by,
      },
    );
  }
  return order;
};

export const applyOrderPlaced = (state: LedgerState, event: OrderPlacedEvent): void => {
  const account = requireAccount(state, event.account_id, event.id);
  const asset = requireAsset(state, event.asset_id, event.id);
  assertSameBook(account, asset, event.id);
  state.orders.set(event.id, {
    order_id: event.id,
    account_id: event.account_id,
    asset_id: event.asset_id,
    side: event.side,
    ...(event.amount === undefined ? {} : { amount: event.amount }),
    ...(event.quantity === undefined ? {} : { quantity: event.quantity }),
    requested_date: event.requested_date,
    stage: "open",
    notes: event.notes === undefined ? [] : [event.notes],
  });
};

export const applyOrderUpdated = (state: LedgerState, event: OrderUpdatedEvent): void => {
  const order = requireOrder(state, event.order_id, event.id);
  if (event.stage === "cancelled") {
    order.stage = "cancelled";
    order.closed_by = event.id;
    order.closed_on = event.date;
  }
  if (event.notes !== undefined) {
    order.notes.push(event.notes);
  }
};

export interface OrderReference {
  id: Ulid;
  account_id: AccountId;
  asset_id: AssetId;
}

/** The open order a buy/sell closes; throws if it does not match the operation. */
export const lookupOpenOrder = (
  state: LedgerState,
  orderId: Ulid,
  event: OrderReference,
  side: OrderSide,
): PendingOrder => {
  const order = requireOrder(state, orderId, event.id);
  if (
    order.account_id !== event.account_id ||
    order.asset_id !== event.asset_id ||
    order.side !== side
  ) {
    throw new ProjectionError(
      "order_mismatch",
      event.id,
      `order ${orderId} is a ${order.side} of ${order.asset_id} in ${order.account_id}`,
      { order_id: orderId },
    );
  }
  return order;
};

export const fillOrder = (order: PendingOrder, eventId: Ulid, date: CivilDate): void => {
  order.stage = "filled";
  order.closed_by = eventId;
  order.closed_on = date;
};

// --- Transfer requests ----------------------------------------------------

const requireRequest = (state: LedgerState, requestId: Ulid, eventId: Ulid): PendingTransfer => {
  const request = state.transferRequests.get(requestId);
  if (request === undefined) {
    throw new ProjectionError(
      "unknown_request",
      eventId,
      `transfer request ${requestId} does not exist`,
      { request_id: requestId },
    );
  }
  if (request.stage === "completed" || request.stage === "cancelled") {
    throw new ProjectionError(
      "request_closed",
      eventId,
      `transfer request ${requestId} is already ${request.stage}`,
      { request_id: requestId, stage: request.stage, closed_by: request.closed_by },
    );
  }
  return request;
};

export const applyTransferRequested = (state: LedgerState, event: TransferRequestedEvent): void => {
  const fromAccount = requireAccount(state, event.from_account_id, event.id);
  const fromAsset = requireAsset(state, event.from_asset_id, event.id);
  const toAccount = requireAccount(state, event.to_account_id, event.id);
  const toAsset = requireAsset(state, event.to_asset_id, event.id);
  assertSameBook(fromAccount, fromAsset, event.id);
  assertSameBook(toAccount, toAsset, event.id);
  if (
    fromAsset.asset_id !== toAsset.asset_id &&
    !(fromAsset.transferable && toAsset.transferable)
  ) {
    throw new ProjectionError(
      "not_transferable",
      event.id,
      "fund transfers require both assets to be transferable",
      { from_asset_id: event.from_asset_id, to_asset_id: event.to_asset_id },
    );
  }
  state.transferRequests.set(event.id, {
    request_id: event.id,
    from_account_id: event.from_account_id,
    from_asset_id: event.from_asset_id,
    to_account_id: event.to_account_id,
    to_asset_id: event.to_asset_id,
    ...(event.quantity_out === undefined ? {} : { quantity_out: event.quantity_out }),
    ...(event.amount_eur === undefined ? {} : { amount_eur: event.amount_eur }),
    requested_date: event.requested_date,
    stage: "requested",
    updates: [],
  });
};

export const applyTransferRequestUpdated = (
  state: LedgerState,
  event: TransferRequestUpdatedEvent,
): void => {
  const request = requireRequest(state, event.request_id, event.id);
  request.updates.push({ event_id: event.id, stage: event.stage, date: event.date });
  request.stage = event.stage;
  if (event.stage === "cancelled") {
    request.closed_by = event.id;
  }
};

export interface RequestReference {
  id: Ulid;
  from_account_id: AccountId;
  from_asset_id: AssetId;
  to_account_id: AccountId;
  to_asset_id: AssetId;
}

export const lookupOpenRequest = (
  state: LedgerState,
  requestId: Ulid,
  event: RequestReference,
): PendingTransfer => {
  const request = requireRequest(state, requestId, event.id);
  if (
    request.from_account_id !== event.from_account_id ||
    request.from_asset_id !== event.from_asset_id ||
    request.to_account_id !== event.to_account_id ||
    request.to_asset_id !== event.to_asset_id
  ) {
    throw new ProjectionError(
      "request_mismatch",
      event.id,
      `transfer request ${requestId} refers to other accounts or assets`,
      { request_id: requestId },
    );
  }
  return request;
};

export const completeRequest = (request: PendingTransfer, eventId: Ulid, date: CivilDate): void => {
  request.updates.push({ event_id: eventId, stage: "completed", date });
  request.stage = "completed";
  request.closed_by = eventId;
};

// --- Queries --------------------------------------------------------------

export interface OpenOrder extends PendingOrder {
  days_open: number;
}

export interface OpenTransfer extends PendingTransfer {
  days_open: number;
}

export const pendingOrders = (state: LedgerState, at: CivilDate): OpenOrder[] =>
  [...state.orders.values()]
    .filter((order) => order.stage === "open")
    .map((order) => ({ ...order, days_open: daysBetween(order.requested_date, at) }));

export const pendingTransfers = (state: LedgerState, at: CivilDate): OpenTransfer[] =>
  [...state.transferRequests.values()]
    .filter((request) => request.stage !== "completed" && request.stage !== "cancelled")
    .map((request) => ({ ...request, days_open: daysBetween(request.requested_date, at) }));

export interface WatchedTransfer extends OpenTransfer {
  /** `days_open > transfer_max_days`; absent when the parameter is not configured. */
  overdue?: boolean;
  /** The limit it was compared against, so the interface can name it. */
  max_days?: number;
}

export interface TransferWatch {
  date: CivilDate;
  rows: WatchedTransfer[];
  /** One warning per overdue request; empty when `transfer_max_days` is not set. */
  warnings: Warning[];
}

/**
 * Open transfer requests at a date, with the rule of `Settings.transfer_max_days`
 * applied (ADR-0010: "a scheduled job warns if a request has been open for more
 * than `transfer_max_days`"). The parameter had existed since phase 1 with
 * nobody reading it.
 *
 * It **wraps** `pendingTransfers` instead of changing it, the same way
 * `bucketTheses` wraps `theses`: the inner one is a plain query over the
 * tracking events, and its three callers do not have to learn about a rule they
 * did not ask for.
 *
 * Three decisions, each written down because none is obvious:
 *
 *   1. The days are counted **to `at`**, never to today. Asking on 30/06/2027
 *      has to answer what was known that day (ADR-0016).
 *   2. The comparison is **strictly greater**: the parameter reads "more than N
 *      days", so the day the limit falls on is still within the limit.
 *   3. A request in stage `redeemed` **still counts**. That is the dangerous
 *      state — the money has left the origin fund and has not arrived anywhere —
 *      and it is exactly the transfer worth chasing.
 *
 * Without `transfer_max_days` the rule is not evaluated: no `overdue`, no
 * warning, and no invented default (constitution IV and V).
 */
export const transferWatch = (
  state: LedgerState,
  at: CivilDate,
  settings: Settings,
): TransferWatch => {
  const limit = settings.transfer_max_days;
  const warnings: Warning[] = [];
  const rows = pendingTransfers(state, at).map((request): WatchedTransfer => {
    if (limit === undefined) {
      return request;
    }
    const overdue = request.days_open > limit;
    if (overdue) {
      warnings.push({
        code: "transfer_overdue",
        event_id: request.request_id,
        message: `transfer request ${request.request_id} has been open ${request.days_open} days (limit ${limit})`,
        details: {
          request_id: request.request_id,
          days_open: request.days_open,
          max_days: limit,
          requested_date: request.requested_date,
          stage: request.stage,
          from_asset_id: request.from_asset_id,
          to_asset_id: request.to_asset_id,
        },
      });
    }
    return { ...request, overdue, max_days: limit };
  });
  return { date: at, rows, warnings };
};
