// Projected state of the ledger (data-model.md §3). Built from scratch on every
// load; nothing here is ever persisted.

import type { CivilDate } from "../dates/civil-date.js";
import type { ProjectionError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import type { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type { IsoInstant } from "../schema/envelope.js";
import type {
  AccountFields,
  AccountId,
  AssetFields,
  AssetId,
  LedgerEvent,
  OrderSide,
  ValuationEvent,
} from "../schema/events.js";
import type { Settings } from "../settings/settings.js";

export interface Account extends AccountFields {
  /** Ids of the account events applied, in file order. */
  history: Ulid[];
}

export interface IdentifierHistoryEntry {
  isin?: string;
  ticker?: string;
  /** The `asset_updated` that replaced these identifiers. */
  until_event_id: Ulid;
}

export interface Asset extends AssetFields {
  identifier_history: IdentifierHistoryEntry[];
}

export interface SettingsEntry {
  event_id: Ulid;
  recorded_at: IsoInstant;
  madrid_date: CivilDate;
  settings: Settings;
}

export interface LotConsumption {
  event_id: Ulid;
  quantity: Quantity;
  cost_eur: Money;
}

export interface FiscalLot {
  /** `<source_event_id>#<n>`. */
  id: string;
  asset_id: AssetId;
  acquisition_date: CivilDate;
  original_quantity: Quantity;
  /** Remaining quantity; zero when closed. */
  quantity: Quantity;
  /** Remaining cost, exact. */
  cost_eur: Money;
  original_cost_eur: Money;
  source_event_id: Ulid;
  source_lot_id?: string;
  /** File position of the event that created the lot: FIFO tie-break on equal dates. */
  position: number;
  closed: boolean;
  consumptions: LotConsumption[];
}

export interface GainByLot {
  lot_id: string;
  quantity: Quantity;
  proceeds_eur: Money;
  cost_eur: Money;
  gain_eur: Money;
}

export interface RealizedGain {
  event_id: Ulid;
  asset_id: AssetId;
  account_id: AccountId;
  fiscal_date: CivilDate;
  year: number;
  quantity: Quantity;
  proceeds_eur: Money;
  cost_eur: Money;
  gain_eur: Money;
  /** Rounded half-up to cents, once per operation. */
  gain_eur_rounded: Money;
  by_lot: GainByLot[];
}

export interface InvestmentIncome {
  event_id: Ulid;
  kind: "dividend" | "interest";
  account_id: AccountId;
  asset_id?: AssetId;
  fiscal_date: CivilDate;
  year: number;
  gross: Money;
  withholding_origin: Money;
  withholding_spain: Money;
  net: Money;
  gross_eur: Money;
  withholding_origin_eur: Money;
  withholding_spain_eur: Money;
  net_eur: Money;
}

export type OrderStageProjected = "open" | "filled" | "cancelled";

export interface PendingOrder {
  order_id: Ulid;
  account_id: AccountId;
  asset_id: AssetId;
  side: OrderSide;
  amount?: string;
  quantity?: string;
  requested_date: CivilDate;
  stage: OrderStageProjected;
  notes: string[];
  closed_by?: Ulid;
  closed_on?: CivilDate;
}

export type TransferStageProjected =
  | "requested"
  | "redeemed"
  | "subscribed"
  | "completed"
  | "cancelled";

export interface TransferUpdate {
  event_id: Ulid;
  stage: TransferStageProjected;
  date: CivilDate;
}

export interface PendingTransfer {
  request_id: Ulid;
  from_account_id: AccountId;
  from_asset_id: AssetId;
  to_account_id: AccountId;
  to_asset_id: AssetId;
  quantity_out?: string;
  amount_eur?: string;
  requested_date: CivilDate;
  stage: TransferStageProjected;
  updates: TransferUpdate[];
  closed_by?: Ulid;
}

export interface Warning {
  code: string;
  event_id: Ulid;
  message: string;
  details: Record<string, unknown>;
}

export interface InvalidEvent {
  event: LedgerEvent;
  error: ProjectionError;
}

export interface AssetLots {
  open: FiscalLot[];
  closed: FiscalLot[];
}

export interface LedgerState {
  accounts: Map<AccountId, Account>;
  assets: Map<AssetId, Asset>;
  settingsHistory: SettingsEntry[];
  /** Settings used to derive fiscal dates (Q3: the latest, or an explicit override). */
  fiscalSettings: Settings;
  /** Quantity per `account_id|asset_id`. */
  positions: Map<string, Quantity>;
  /** Balance per `account_id|currency`. */
  cash: Map<string, Money>;
  lots: Map<AssetId, AssetLots>;
  gains: RealizedGain[];
  income: InvestmentIncome[];
  valuations: ValuationEvent[];
  orders: Map<Ulid, PendingOrder>;
  transferRequests: Map<Ulid, PendingTransfer>;
  /** reversed event id → reversal id. */
  reversed: Map<Ulid, Ulid>;
  warnings: Warning[];
  /** Only filled in `collectErrors` mode. */
  invalid: InvalidEvent[];
  /** fingerprint → ids of the (non-reversed) events carrying it. */
  fingerprints: Map<string, Ulid[]>;
  /** event id → file position. */
  positionOf: Map<Ulid, number>;
  /** Accounts and assets referenced by any non-reversed operation or tracking event. */
  usage: { accounts: Set<AccountId>; assets: Set<AssetId> };
}

export const positionKey = (accountId: AccountId, assetId: AssetId): string =>
  `${accountId}|${assetId}`;

export const cashKey = (accountId: AccountId, currency: string): string =>
  `${accountId}|${currency}`;

export const createEmptyState = (fiscalSettings: Settings): LedgerState => ({
  accounts: new Map(),
  assets: new Map(),
  settingsHistory: [],
  fiscalSettings,
  positions: new Map(),
  cash: new Map(),
  lots: new Map(),
  gains: [],
  income: [],
  valuations: [],
  orders: new Map(),
  transferRequests: new Map(),
  reversed: new Map(),
  warnings: [],
  invalid: [],
  fingerprints: new Map(),
  positionOf: new Map(),
  usage: { accounts: new Set(), assets: new Set() },
});
