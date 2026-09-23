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
    case "swap":
      return [
        event.source,
        event.broker_ref ?? "",
        event.account_id,
        event.from_asset_id,
        event.type,
        event.value_date,
        event.quantity_out,
        event.market_value_out,
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
    case "corporate_action":
      return ["", "", "", event.asset_id, event.type, event.effective_date, event.kind, "", ""];
    // A filing is identified by what the tax agency returned: the same model,
    // year and receipt recorded twice is the same filing, not two. A
    // supplementary return has its own receipt, so it never collides.
    //
    // `filed_at` is **not** part of it, and that is the fix of feature 011:
    // with the date inside, the same receipt recorded twice on two different
    // days did not even ask for confirmation, and two filings stayed for one —
    // both feeding the chain of supplementary returns and the anchor of the
    // year. Changing a persisted tuple is a breaking change (ADR-0018) and it
    // is done **now**, inside `schema_version = 1`, because `tax_return_filed`
    // exists only since feature 010, merged on 2026-09-23: there cannot be a
    // line anywhere in the world whose fingerprint this moves. The argument
    // does not depend on any fact about the user's private ledger, which is
    // what makes it a good one; in a year it would cost a migration instead of
    // a line.
    case "tax_return_filed":
      return [
        "",
        "",
        "",
        "",
        event.type,
        event.model,
        String(event.tax_year),
        event.receipt_reference,
      ];
    default:
      return undefined;
  }
};

/** `sha256:<hex>` for fingerprinted types; `undefined` for catalogue, settings, tracking, valuation, theses and reversal. */
export const fingerprintOf = (event: FingerprintInput): string | undefined => {
  const tuple = tupleOf(event);
  return tuple === undefined ? undefined : `sha256:${sha256Hex(tuple.join("|"))}`;
};
