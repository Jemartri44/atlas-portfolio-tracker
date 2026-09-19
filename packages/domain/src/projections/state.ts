// Projected state of the ledger (data-model.md §3). Built from scratch on every
// load; nothing here is ever persisted.

import type { CivilDate } from "../dates/civil-date.js";
import type { ProjectionError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import type { Decimal } from "../money/decimal.js";
import type { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type { IsoInstant } from "../schema/envelope.js";
import type {
  AccountFields,
  AccountId,
  AssetFields,
  AssetId,
  IncomeBase,
  LedgerEvent,
  OrderSide,
  ValuationEvent,
} from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import type { KnownFxRate } from "./fx-rates.js";
import type { Acquisition } from "./wash-sale.js";

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

/** Why the FIFO took quantity out of a lot: a disposal, or a move that keeps date and cost. */
export type ConsumePurpose = "transmission" | "transfer" | "convert";

/**
 * One thing the single FIFO engine did to a lot, in the order it did it (feature
 * 009). The journal **decides nothing**: which lot is consumed is still the
 * FIFO's choice. It records those choices so that the tax engine can carry one
 * more magnitude along them —the loss the wash-sale rule defers— without a
 * second lot engine that could disagree with the first (constitution II,
 * ADR-0016). Never in the snapshot.
 *
 * - `open`: a lot was created; `source_lot_id` when it inherits from another.
 * - `consume`: `quantity` left the lot, which held `quantity_before`.
 * - `carve`: a `carve_out` moved `cost_share` of the lot's cost into `into_lot_id`.
 * - `scale`: the lot now holds `quantity_after` (split, reverse split, bonus shares),
 *   by the exact `ratio` of the event (`"2"`, `"1/4"`), so that units bought
 *   after it can be compared with units sold before it.
 * - `gain`: `state.gains[gain_index]` was booked; the `transmission` consumptions
 *   right before it are the lots it disposed of.
 */
export type LotJournalEntry =
  | {
      kind: "open";
      lot_id: string;
      asset_id: AssetId;
      event_id: Ulid;
      quantity: Quantity;
      source_lot_id?: string;
    }
  | {
      kind: "consume";
      lot_id: string;
      event_id: Ulid;
      quantity: Quantity;
      quantity_before: Quantity;
      purpose: ConsumePurpose;
    }
  | { kind: "carve"; lot_id: string; into_lot_id: string; event_id: Ulid; cost_share: Decimal }
  | { kind: "scale"; lot_id: string; event_id: Ulid; quantity_after: Quantity; ratio: string }
  | { kind: "gain"; gain_index: number };

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

/**
 * Income received in kind, without a transfer (ADR-0021): a fork, an airdrop,
 * shares from a spin-off outside the neutrality regime, a dividend in kind.
 *
 * It is projected **apart** from `InvestmentIncome`, and on purpose. That one
 * is movable capital income of the savings base and feeds the tax figures; this
 * one feeds **nothing**: it is what the ledger recorded, so that phase 5 can
 * read it when the criterion is settled. Mixing them would answer the question
 * `docs/fiscal-questions.md` #8 by accident.
 */
export interface InKindIncome {
  event_id: Ulid;
  asset_id: AssetId;
  /** Date the lot is acquired, which is when the income is received. */
  fiscal_date: CivilDate;
  year: number;
  amount_eur: Money;
  base: IncomeBase;
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

export type ThesisStatus = "open" | "closed";

/**
 * One trade linked to a thesis. The ids alone were enough until the feature
 * 005: measuring a thesis against the index needs the cost **and the fiscal
 * date** of each purchase, and a projection that only receives the state cannot
 * go back to the raw events to find them. The snapshot still serialises only
 * the ids, so the golden file does not move because of this.
 */
export interface ThesisLeg {
  event_id: Ulid;
  fiscal_date: CivilDate;
  quantity: Quantity;
  /** Acquisition cost (buy, fee included) or transmission value (sell, fee deducted), in euros. */
  amount_eur: Money;
  fee_eur: Money;
  /** Only on sales: the gain the operation booked, exact. */
  gain_eur?: Money;
}

export interface Thesis {
  thesis_id: string;
  account_id: AccountId;
  asset_id: AssetId;
  hypothesis: string;
  expected_horizon_days: number;
  invalidation: string;
  planned_size_eur: Money;
  status: ThesisStatus;
  opened_event_id: Ulid;
  /** File position of the `thesis_opened`: a bucket buy must come later in the file. */
  opened_position: number;
  /** `recorded_at` of the opening in Europe/Madrid (administrative date, not a business date). */
  opened_at: CivilDate;
  closed_event_id?: Ulid;
  closed_position?: number;
  closed_at?: CivilDate;
  closing_notes?: string;
  buys: ThesisLeg[];
  sells: ThesisLeg[];
  quantity_bought: Quantity;
  quantity_sold: Quantity;
  /** Σ cost_eur of the linked buys (fee included). */
  invested_eur: Money;
  /** Σ fee / fx_rate of the linked buys and sells. */
  fees_eur: Money;
  /** Σ gain_eur of the linked sells, exact. */
  result_eur: Money;
}

export interface ThesisView extends Thesis {
  result_eur_rounded: Money;
  /** Physical position of (account, asset) at the end of the ledger. */
  position: Quantity;
  /** Days from opening to closing, or to the date asked. */
  days_open: number;
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
  /** Last ECB rate the ledger knows per currency (feature 005). Never in the snapshot. */
  fxRates: Map<string, KnownFxRate>;
  /** Purchases per asset that count for the wash-sale rule (feature 005). Never in the snapshot. */
  acquisitions: Map<AssetId, Acquisition[]>;
  lots: Map<AssetId, AssetLots>;
  /** What the FIFO did to every lot, in order (feature 009). Never in the snapshot. */
  lotJournal: LotJournalEntry[];
  /** Lots created per source event, to number lot ids uniquely across assets. */
  lotCounts: Map<Ulid, number>;
  gains: RealizedGain[];
  income: InvestmentIncome[];
  /** Income in kind a grant declares; read by nobody yet (ADR-0021). */
  inKindIncome: InKindIncome[];
  valuations: ValuationEvent[];
  orders: Map<Ulid, PendingOrder>;
  transferRequests: Map<Ulid, PendingTransfer>;
  /** Bucket theses by thesis_id, in file order. */
  theses: Map<string, Thesis>;
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
  fxRates: new Map(),
  acquisitions: new Map(),
  lots: new Map(),
  lotJournal: [],
  lotCounts: new Map(),
  gains: [],
  income: [],
  inKindIncome: [],
  valuations: [],
  orders: new Map(),
  transferRequests: new Map(),
  theses: new Map(),
  reversed: new Map(),
  warnings: [],
  invalid: [],
  fingerprints: new Map(),
  positionOf: new Map(),
  usage: { accounts: new Set(), assets: new Set() },
});

export const addWarning = (
  state: LedgerState,
  code: string,
  eventId: Ulid,
  message: string,
  details: Record<string, unknown>,
): void => {
  state.warnings.push({ code, event_id: eventId, message, details });
};
