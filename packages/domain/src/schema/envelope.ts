// Line envelope (data-schema.md §2). The type discriminator is open: a later
// feature can list its types as "reserved" — accepted by the loader, rejected by
// the projection — until it implements them. Feature 002 emptied the list.

import type { Ulid } from "../ids/ulid.js";

export const CURRENT_SCHEMA_VERSION = 1;

export const SUPPORTED_EVENT_TYPES = [
  "account_created",
  "account_updated",
  "asset_created",
  "asset_updated",
  "settings_changed",
  "buy",
  "sell",
  "transfer",
  "order_placed",
  "order_updated",
  "transfer_requested",
  "transfer_request_updated",
  "dividend",
  "interest",
  "fx_exchange",
  "cash_deposit",
  "cash_withdrawal",
  "standalone_fee",
  "valuation",
  "corporate_action",
  "thesis_opened",
  "thesis_closed",
  "reversal",
] as const;

/** Types defined by data-schema.md but implemented by later features. Empty since feature 002. */
export const RESERVED_EVENT_TYPES = [] as const;

export type SupportedEventType = (typeof SUPPORTED_EVENT_TYPES)[number];
export type ReservedEventType = (typeof RESERVED_EVENT_TYPES)[number];
export type EventType = SupportedEventType | ReservedEventType;

/** ISO 8601 instant in UTC, e.g. 2026-09-01T18:22:05.000Z. */
export type IsoInstant = string;

export interface Envelope {
  schema_version: number;
  id: Ulid;
  recorded_at: IsoInstant;
  type: EventType;
  /** Present on an event that replaces a reversed one (data-schema.md §6.3). */
  corrects_id?: Ulid;
}

export const isSupportedEventType = (value: unknown): value is SupportedEventType =>
  typeof value === "string" && (SUPPORTED_EVENT_TYPES as readonly string[]).includes(value);

export const isReservedEventType = (value: unknown): value is ReservedEventType =>
  typeof value === "string" && (RESERVED_EVENT_TYPES as readonly string[]).includes(value);
