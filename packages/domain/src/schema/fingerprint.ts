// Idempotency fingerprint (data-schema.md §4, ADR-0012): sha256 of the business
// tuple. The broker reference is part of it when present; the own `id` never is,
// so two identical manual entries collide and the user gets asked to confirm.

import { sha256Hex } from "../ids/sha256.js";
import type { Draft, SupportedEvent } from "./events.js";

type FingerprintInput = Draft<SupportedEvent> | SupportedEvent;

const tupleOf = (event: FingerprintInput): string[] | undefined => {
  switch (event.type) {
    case "buy":
    case "sell":
      return [
        event.source,
        event.broker_ref ?? "",
        event.account_id,
        event.asset_id,
        event.type,
        event.value_date,
        event.quantity,
        event.amount ?? event.unit_price ?? "",
        event.currency,
      ];
    case "transfer":
      return [
        "",
        "",
        event.from_account_id,
        event.from_asset_id,
        event.type,
        event.value_date_out,
        event.quantity_out,
        "",
        "",
      ];
    case "dividend":
      return [
        "",
        event.broker_ref ?? "",
        event.account_id,
        event.asset_id,
        event.type,
        event.value_date,
        "",
        event.gross,
        event.currency,
      ];
    case "interest":
      return [
        "",
        event.broker_ref ?? "",
        event.account_id,
        "",
        event.type,
        event.value_date,
        "",
        event.gross,
        event.currency,
      ];
    case "fx_exchange":
      return [
        "",
        event.broker_ref ?? "",
        event.account_id,
        "",
        event.type,
        event.value_date,
        event.sold_amount,
        event.bought_amount,
        event.sold_currency,
      ];
    case "cash_deposit":
    case "cash_withdrawal":
    case "standalone_fee":
      return [
        "",
        "",
        event.account_id,
        "",
        event.type,
        event.value_date,
        "",
        event.amount,
        event.currency,
      ];
    default:
      return undefined;
  }
};

/** `sha256:<hex>` for fingerprinted types; `undefined` for catalogue, settings, tracking, valuation and reversal. */
export const fingerprintOf = (event: FingerprintInput): string | undefined => {
  const tuple = tupleOf(event);
  return tuple === undefined ? undefined : `sha256:${sha256Hex(tuple.join("|"))}`;
};
