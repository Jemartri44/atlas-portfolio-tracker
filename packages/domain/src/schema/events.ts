// One interface per event type (data-schema.md §6). Numerics are decimal
// strings, business dates are YYYY-MM-DD, field names are snake_case as in
// the file. Optional fields are absent, never undefined.

import type { CivilDate } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import type { DecimalString } from "../money/decimal.js";
import type { Currency } from "../money/money.js";
import type { Settings } from "../settings/settings.js";
import type { Envelope, ReservedEventType } from "./envelope.js";

export type AccountId = string;
export type AssetId = string;

export const BOOKS = ["core", "bucket"] as const;
export type Book = (typeof BOOKS)[number];

export const ASSET_TYPES = ["fund", "etc", "etp", "stock", "crypto", "money_market"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_CLASSES = ["equity", "fixed_income", "gold", "crypto"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const ORDER_SIDES = ["buy", "sell"] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];

export const ORDER_STAGES = ["cancelled", "note"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export const TRANSFER_REQUEST_STAGES = ["redeemed", "subscribed", "cancelled"] as const;
export type TransferRequestStage = (typeof TRANSFER_REQUEST_STAGES)[number];

// --- Catalogue ------------------------------------------------------------

export interface AccountFields {
  account_id: AccountId;
  name: string;
  platform: string;
  book: Book;
  base_currency: Currency;
  /** ISO 3166-1 alpha-2, for the Modelo 720. */
  country: string;
  active: boolean;
}

export interface AccountCreatedEvent extends Envelope, AccountFields {
  type: "account_created";
}

export interface AccountUpdatedEvent extends Envelope, AccountFields {
  type: "account_updated";
}

export interface AssetFields {
  asset_id: AssetId;
  /** The asset's `type` of data-schema.md §6.1; named `asset_type` in the line because `type` is the event type. */
  asset_type: AssetType;
  book: Book;
  asset_class?: AssetClass;
  isin?: string;
  ticker?: string;
  name: string;
  currency: Currency;
  ter?: DecimalString;
  transferable: boolean;
  reference_etf_id?: AssetId;
  active: boolean;
}

export interface AssetCreatedEvent extends Envelope, AssetFields {
  type: "asset_created";
}

export interface AssetUpdatedEvent extends Envelope, AssetFields {
  type: "asset_updated";
}

export interface SettingsChangedEvent extends Envelope {
  type: "settings_changed";
  settings: Settings;
}

// --- Operations -----------------------------------------------------------

/** Common operation fields (data-schema.md §4). */
export interface OperationFields {
  account_id: AccountId;
  asset_id: AssetId;
  trade_date: CivilDate;
  value_date: CivilDate;
  quantity: DecimalString;
  /** Required without `amount`; informative and optional with it. Never derived (data-schema.md §4). */
  unit_price?: DecimalString;
  /** Gross settled amount; when present it is the cost or proceeds basis (ADR-0012). */
  amount?: DecimalString;
  currency: Currency;
  /** ECB rate as published: units of `currency` per EUR (ADR-0013). */
  fx_rate: DecimalString;
  fx_rate_date: CivilDate;
  fee: DecimalString;
  broker_ref?: string;
  fingerprint: string;
  source: string;
  notes?: string;
}

export interface BuyEvent extends Envelope, OperationFields {
  type: "buy";
  order_id?: Ulid;
  thesis_id?: string;
}

export interface SellEvent extends Envelope, OperationFields {
  type: "sell";
  order_id?: Ulid;
  withholding?: DecimalString;
  thesis_id?: string;
}

export interface TransferEvent extends Envelope {
  type: "transfer";
  request_id?: Ulid;
  from_account_id: AccountId;
  from_asset_id: AssetId;
  quantity_out: DecimalString;
  nav_out?: DecimalString;
  value_date_out: CivilDate;
  to_account_id: AccountId;
  to_asset_id: AssetId;
  quantity_in: DecimalString;
  nav_in?: DecimalString;
  value_date_in: CivilDate;
  fee?: DecimalString;
  fingerprint: string;
  notes?: string;
}

export interface DividendEvent extends Envelope {
  type: "dividend";
  account_id: AccountId;
  asset_id: AssetId;
  value_date: CivilDate;
  gross: DecimalString;
  withholding_origin: DecimalString;
  withholding_spain: DecimalString;
  currency: Currency;
  fx_rate: DecimalString;
  fx_rate_date: CivilDate;
  per_unit?: DecimalString;
  broker_ref?: string;
  fingerprint: string;
  notes?: string;
}

export interface InterestEvent extends Envelope {
  type: "interest";
  account_id: AccountId;
  value_date: CivilDate;
  gross: DecimalString;
  withholding_spain: DecimalString;
  currency: Currency;
  fx_rate: DecimalString;
  fx_rate_date: CivilDate;
  broker_ref?: string;
  fingerprint: string;
  notes?: string;
}

export interface FxExchangeEvent extends Envelope {
  type: "fx_exchange";
  account_id: AccountId;
  value_date: CivilDate;
  sold_amount: DecimalString;
  sold_currency: Currency;
  bought_amount: DecimalString;
  bought_currency: Currency;
  fee: DecimalString;
  fee_currency: Currency;
  fx_rate_sold: DecimalString;
  fx_rate_bought: DecimalString;
  fx_rate_date: CivilDate;
  broker_ref?: string;
  fingerprint: string;
  notes?: string;
}

export interface CashMovementFields {
  account_id: AccountId;
  value_date: CivilDate;
  amount: DecimalString;
  currency: Currency;
  fx_rate: DecimalString;
  notes?: string;
  fingerprint: string;
}

export interface CashDepositEvent extends Envelope, CashMovementFields {
  type: "cash_deposit";
}

export interface CashWithdrawalEvent extends Envelope, CashMovementFields {
  type: "cash_withdrawal";
}

export interface StandaloneFeeEvent extends Envelope {
  type: "standalone_fee";
  account_id: AccountId;
  value_date: CivilDate;
  amount: DecimalString;
  currency: Currency;
  fx_rate: DecimalString;
  description: string;
  fingerprint: string;
}

export interface ValuationEvent extends Envelope {
  type: "valuation";
  account_id: AccountId;
  asset_id: AssetId;
  date: CivilDate;
  quantity: DecimalString;
  unit_value: DecimalString;
  currency: Currency;
  fx_rate: DecimalString;
  source: string;
}

// --- Tracking (no effect on lots or cash) ---------------------------------

export interface OrderPlacedEvent extends Envelope {
  type: "order_placed";
  account_id: AccountId;
  asset_id: AssetId;
  side: OrderSide;
  amount?: DecimalString;
  quantity?: DecimalString;
  requested_date: CivilDate;
  notes?: string;
}

export interface OrderUpdatedEvent extends Envelope {
  type: "order_updated";
  order_id: Ulid;
  stage: OrderStage;
  date: CivilDate;
  notes?: string;
}

export interface TransferRequestedEvent extends Envelope {
  type: "transfer_requested";
  from_account_id: AccountId;
  from_asset_id: AssetId;
  to_account_id: AccountId;
  to_asset_id: AssetId;
  quantity_out?: DecimalString;
  amount_eur?: DecimalString;
  requested_date: CivilDate;
  notes?: string;
}

export interface TransferRequestUpdatedEvent extends Envelope {
  type: "transfer_request_updated";
  request_id: Ulid;
  stage: TransferRequestStage;
  date: CivilDate;
  nav_out?: DecimalString;
  quantity_out?: DecimalString;
  notes?: string;
}

// --- Corporate actions (data-schema.md §6.2, §6.5, §8.5; ADR-0011) ----------

export const CORPORATE_ACTION_KINDS = [
  "split",
  "reverse_split",
  "stock_dividend",
  "merger",
  "spin_off",
  "fund_merger",
  "share_class_change",
  "fund_liquidation",
  "issuer_liquidation",
  "delisting",
  "crypto_fork",
  "token_migration",
  "issuer_restructuring",
] as const;
export type CorporateActionKind = (typeof CORPORATE_ACTION_KINDS)[number];

export const EFFECT_OPS = ["scale", "convert", "carve_out", "forced_sale", "grant"] as const;
export type EffectOp = (typeof EFFECT_OPS)[number];

/** A decimal string (`"4"`, `"0.25"`) or a fraction of positive integers `"new/old"` (`"4/3"`). */
export type RatioString = string;

interface EffectBase {
  /** Asset the effect acts on; defaults to the event's `asset_id`. */
  asset_id?: AssetId;
}

export interface ScaleEffect extends EffectBase {
  op: "scale";
  ratio: RatioString;
}

export interface ConvertEffect extends EffectBase {
  op: "convert";
  to_asset_id: AssetId;
  ratio: RatioString;
}

export interface CarveOutEffect extends EffectBase {
  op: "carve_out";
  to_asset_id: AssetId;
  ratio: RatioString;
  /** Share of each origin lot's cost that moves to the new asset, in [0, 1]. */
  cost_share: DecimalString;
}

export interface ForcedSaleEntry {
  account_id: AccountId;
  /** Quantity sold in that account, or `"all"` for its whole physical position. */
  quantity: DecimalString | "all";
  fee?: DecimalString;
}

export interface ForcedSaleEffect extends EffectBase {
  op: "forced_sale";
  per_account: ForcedSaleEntry[];
  unit_price: DecimalString;
  currency: Currency;
  fx_rate: DecimalString;
  fx_rate_date: CivilDate;
}

export interface GrantEntry {
  account_id: AccountId;
  quantity: DecimalString;
}

export interface GrantEffect extends EffectBase {
  op: "grant";
  per_account: GrantEntry[];
  unit_cost: DecimalString;
  currency: Currency;
  fx_rate: DecimalString;
  fx_rate_date: CivilDate;
  acquisition_date: CivilDate;
}

export type Effect = ScaleEffect | ConvertEffect | CarveOutEffect | ForcedSaleEffect | GrantEffect;

export interface CorporateActionEvent extends Envelope {
  type: "corporate_action";
  kind: CorporateActionKind;
  asset_id: AssetId;
  effective_date: CivilDate;
  /** Key under `documents/` or the issuer's URL. Never empty. */
  source_document: string;
  effects: Effect[];
  notes?: string;
  fingerprint: string;
}

// --- Bucket theses (data-schema.md §6.4) ------------------------------------

export interface ThesisOpenedEvent extends Envelope {
  type: "thesis_opened";
  thesis_id: string;
  account_id: AccountId;
  asset_id: AssetId;
  hypothesis: string;
  /** Plain JSON integer: it is a duration, not an amount. */
  expected_horizon_days: number;
  invalidation: string;
  planned_size_eur: DecimalString;
}

export interface ThesisClosedEvent extends Envelope {
  type: "thesis_closed";
  thesis_id: string;
  closing_notes: string;
}

// --- Rectification --------------------------------------------------------

export interface ReversalEvent extends Envelope {
  type: "reversal";
  reverses_id: Ulid;
  reason: string;
}

// --- Reserved for later features ------------------------------------------

export type ReservedEvent = Envelope & { type: ReservedEventType } & Record<string, unknown>;

export type SupportedEvent =
  | AccountCreatedEvent
  | AccountUpdatedEvent
  | AssetCreatedEvent
  | AssetUpdatedEvent
  | SettingsChangedEvent
  | BuyEvent
  | SellEvent
  | TransferEvent
  | DividendEvent
  | InterestEvent
  | FxExchangeEvent
  | CashDepositEvent
  | CashWithdrawalEvent
  | StandaloneFeeEvent
  | ValuationEvent
  | OrderPlacedEvent
  | OrderUpdatedEvent
  | TransferRequestedEvent
  | TransferRequestUpdatedEvent
  | CorporateActionEvent
  | ThesisOpenedEvent
  | ThesisClosedEvent
  | ReversalEvent;

export type LedgerEvent = SupportedEvent | ReservedEvent;

export type EventOf<T extends SupportedEvent["type"]> = Extract<SupportedEvent, { type: T }>;

/** What a caller provides to record an event: the envelope and the fingerprint are filled in by the use case. */
export type Draft<T extends SupportedEvent = SupportedEvent> = T extends unknown
  ? Omit<T, "schema_version" | "id" | "recorded_at" | "fingerprint"> & { fingerprint?: string }
  : never;
