// One interface per event type (data-schema.md §6). Numerics are decimal
// strings, business dates are YYYY-MM-DD, field names are snake_case as in
// the file. Optional fields are absent, never undefined.

import type { CivilDate } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import type { DecimalString } from "../money/decimal.js";
import type { Currency } from "../money/money.js";
import type { IncomeCategory, Settings } from "../settings/settings.js";
import type { Envelope, ReservedEventType } from "./envelope.js";

export type AccountId = string;
export type AssetId = string;

export const BOOKS = ["core", "bucket"] as const;
export type Book = (typeof BOOKS)[number];

export const ASSET_TYPES = [
  "fund",
  "etf",
  "etc",
  "etp",
  "stock",
  "crypto",
  "money_market",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_CLASSES = ["equity", "fixed_income", "gold", "crypto"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const ORDER_SIDES = ["buy", "sell"] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];

export const ORDER_STAGES = ["cancelled", "note"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export const TRANSFER_REQUEST_STAGES = ["redeemed", "subscribed", "cancelled"] as const;
export type TransferRequestStage = (typeof TRANSFER_REQUEST_STAGES)[number];

/**
 * What a standalone fee is (ADR-0021). None of these change a capital gain —
 * article 35 LIRPF only admits costs inherent to the acquisition or the
 * disposal— but article 26.1.a) does allow **administration and custody of
 * negotiable securities** to be deducted from movable capital income, and does
 * not allow discretionary management or market data. Today `standalone_fee`
 * carries free text and nothing can tell one from the other.
 *
 * Nothing reads it yet: classifying is the tax engine of phase 5.
 */
/**
 * Which base income in kind goes into (ADR-0021). The savings base is where
 * capital gains and movable capital income live; the **general** base is the
 * one for income not derived from a transfer, and the project has never had the
 * notion — which is precisely the hole: DGT doctrine treats the free receipt of
 * crypto-assets as a gain **not derived from a transfer**, integrated in the
 * general base, and the criterion in force here (cost zero, nothing declared on
 * receipt) is the opposite reading (`docs/fiscal-questions.md` #8).
 */
export const INCOME_BASES = ["general", "savings"] as const;
export type IncomeBase = (typeof INCOME_BASES)[number];

export const FEE_KINDS = [
  "custody",
  "administration",
  "connectivity",
  "discretionary_management",
  "other",
] as const;
export type FeeKind = (typeof FEE_KINDS)[number];

/** The kind of a standalone fee: what it says, or `other` (ADR-0021), resolved at the point of use. */
export const feeKindOf = (event: { fee_kind?: FeeKind }): FeeKind => event.fee_kind ?? "other";

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
  /**
   * Where it trades: MIC code or the market's name (ADR-0021). Optional.
   *
   * It exists because the wash-sale window of article 33.5.f) LIRPF talks
   * about regulated markets **of the EU**, so a Nasdaq share may well fall
   * under letter g) and its one-year window instead of the two months the
   * project applies by default. That question is still open
   * (`docs/fiscal-questions.md` #2), and it cannot be answered either way if
   * the catalogue does not say where the thing trades.
   *
   * The tax engine **reads it** (feature 009): each transmission line carries
   * it, and the doubtful item of criterion `2:listed` lists the markets at
   * stake, so that the reading of the dispute can be checked market by market.
   * Nothing chooses a window with it yet: that is the criterion's to decide.
   */
  market?: string;
  /**
   * Where the issuer sits: ISO 3166-1 alpha-2 (ADR-0021). Optional, and nothing
   * reads it yet. Article 95 LIRPF treats undertakings domiciled in
   * non-cooperative jurisdictions apart, and several gold ETCs and crypto ETPs
   * are domiciled in Jersey, Guernsey or the Cayman Islands. It also decides
   * how a holding is classified in forms 720 and 721.
   */
  issuer_country?: string;
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

/**
 * Swapping one asset for another, inside one account: crypto for crypto is the
 * case that motivates it, and `fx_exchange` is only for currencies.
 *
 * **A swap is not a transfer, and the difference is the expensive one.** A
 * transfer between funds keeps the acquisition date and the cost of the origin
 * lots and is taxed nowhere (trap 1 of `CLAUDE.md`); a swap is a **disposal**
 * of what is handed over and an **acquisition** of what is received, both on
 * the day of the swap. It keeps no antiquity and no cost, because it is neither
 * a transfer nor an exchange covered by the neutrality regime.
 *
 * It is valued by article 37.1.h LIRPF: **the greater** of the market value of
 * what is handed over and of what is received. That is why both are recorded
 * and neither is derived from the other.
 *
 * The vocabulary is deliberately the one of `transfer` (`from_*`,
 * `quantity_out`, `to_*`, `quantity_in`): they are the two two-legged
 * operations of the ledger, and naming them differently would only mean having
 * to remember which is which. What tells them apart is where it can be seen:
 * the type, the two `market_value_*` a transfer does not have, and the absence
 * of `nav_*`.
 */
export interface SwapEvent extends Envelope {
  type: "swap";
  account_id: AccountId;
  trade_date: CivilDate;
  value_date: CivilDate;
  from_asset_id: AssetId;
  quantity_out: DecimalString;
  /** Market value of what is handed over, in `currency`. */
  market_value_out: DecimalString;
  to_asset_id: AssetId;
  quantity_in: DecimalString;
  /** Market value of what is received, in `currency`. */
  market_value_in: DecimalString;
  currency: Currency;
  /** ECB rate as published: units of `currency` per EUR (ADR-0013). */
  fx_rate: DecimalString;
  fx_rate_date: CivilDate;
  fee: DecimalString;
  /** Required in a bucket account, for the asset **received**: the position it opens (rule 15). */
  thesis_id?: string;
  broker_ref?: string;
  fingerprint: string;
  source: string;
  notes?: string;
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
  /** ISO 3166-1 alpha-2 of the payer (data-schema.md §6.2, fiscal question #16). */
  source_country?: string;
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
  /** Date of the ECB rate applied. Required since ADR-0021; see the note below. */
  fx_rate_date: CivilDate;
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
  /** Date of the ECB rate applied. Required since ADR-0021; see the note below. */
  fx_rate_date: CivilDate;
  description: string;
  /** What the charge is (ADR-0021). Absent means `other`; read through `feeKindOf`. */
  fee_kind?: FeeKind;
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
  /**
   * Date of the ECB rate applied. Required since ADR-0021; see the note below.
   *
   * This is where the hole was found (challenge 3, finding 6): form 720 values
   * at the 31/12 price **converted at the ECB rate of that day**, and 31/12
   * falls on a weekend two years out of seven, so a valuation in a foreign
   * currency without the date of its rate is not reproducible from the official
   * table.
   */
  fx_rate_date: CivilDate;
  source: string;
}

/**
 * **Why these four became required, and why it had to be now.**
 *
 * `cash_deposit`, `cash_withdrawal`, `standalone_fee` and `valuation` gained
 * `fx_rate_date` as an optional field in feature 005. Making it required is a
 * **hardening**, and ADR-0018 allows one inside schema version 1 only while the
 * real ledger is empty: the loader judges old lines by today's rules, so
 * hardening with data inside leaves the ledger not degraded but **unreadable in
 * full**. The real ledger is empty today and stops being so with the first real
 * operation, which is why ADR-0021 brought all nine provisions forward.
 *
 * That window closed with this feature. Any further hardening needs
 * `schema_version = 2` and its migration.
 */

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
  /**
   * Tax withheld by that broker, in the effect's `currency` (ADR-0021). Same
   * treatment as `sell.withholding`: it leaves the cash that comes in and it
   * touches neither the disposal value nor the cost of the lots.
   *
   * It lives **per account** and not on the effect, unlike what ADR-0021 first
   * said: a forced sale settles account by account and each broker withholds
   * its own, so a single amount would have to be split between accounts and the
   * split would be a figure the system invented. It is the same reason the fee
   * moved here (challenge 2026-08-31, finding 8).
   */
  withholding?: DecimalString;
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
  /**
   * Income the grant hands over **at the moment of receiving it**, in euros,
   * and the base it goes into (ADR-0021). The two travel together: one without
   * the other is refused.
   *
   * A `grant` creates lots and declares nothing. These two fields say that what
   * was received **is income when it is received** — a fork, an airdrop, shares
   * from a spin-off outside the neutrality regime, a dividend in kind. They are
   * stored and shown; **they become no calculation**. Who is taxed on what is
   * phase 5 and is a criterion in dispute (`docs/fiscal-questions.md` #8).
   */
  income_eur?: DecimalString;
  income_base?: IncomeBase;
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
  /**
   * Whether the operation takes the neutrality regime, i.e. the tax deferral of
   * a merger, exchange or spin-off (ADR-0021). Optional. It does not decide
   * which primitives an exchange composes into —that is still the user's
   * choice, and `KIND_RULES` does not look at this field— but the tax engine
   * **reads it** (feature 009): an exchange that says nothing about the regime
   * is exposed as doubtful under criteria #7 and #13, and one that says the
   * regime does **not** apply while keeping date and cost gets its own note,
   * `tax_neutrality_contradiction`.
   *
   * It exists because the deferral is conditional —the AEAT manual requires the
   * acquiring entity to be Spanish or within Directive 2009/133/EC— so a merger
   * between two US companies does not qualify, and without the regime the
   * exchange is a fully taxable swap under article 37.1.h. The project models
   * it as `convert`, which keeps date and cost and declares nothing: if the
   * regime did not apply, that omits the whole gain of the exchange. It is the
   * largest single figure that can be wrong in the system
   * (`docs/fiscal-questions.md` #7 and #13), and until now the ledger did not
   * record which of the two readings the user was relying on.
   */
  neutrality_regime?: boolean;
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

// --- What was filed (ADR-0020) ---------------------------------------------

/** The returns the ledger keeps a record of having filed. */
export const FILING_MODELS = ["renta", "720", "721"] as const;
export type FilingModel = (typeof FILING_MODELS)[number];

/**
 * The categories an informative return declares separately, each with its own
 * threshold: cash accounts and securities in the 720, and the single one of
 * the 721. A category absent from a filing is a category **not declared**.
 */
export const FILING_CATEGORIES = ["accounts", "securities", "crypto"] as const;
export type FilingCategory = (typeof FILING_CATEGORIES)[number];

/**
 * The first tax year each model may be filed for, **one figure per model**,
 * because the three have nothing to do with each other:
 *
 * - `renta`: 2018, which is the regime of offsetting the engine implements
 *   (`FIRST_SUPPORTED_YEAR`). A test keeps the two level; the schema cannot
 *   import the tax module.
 * - `720`: **2012**, the first year it existed (Ley 7/2012 and RD 1558/2012,
 *   filed between February and April 2013). It used to take 2018 as well, on
 *   the argument of the offsetting regime — which has nothing to say about an
 *   informative return: there is no reason for the ledger to refuse a 720 of
 *   2015 that the user wants to record.
 * - `721`: 2023, the first year of the model (Orden HFP/886/2023).
 */
export const FIRST_FILING_YEAR: Record<FilingModel, number> = {
  renta: 2018,
  "720": 2012,
  "721": 2023,
};

/** A negative balance still pending, as the return declares it: by origin year and category. */
export interface FiledPendingLoss {
  origin_year: number;
  category: IncomeCategory;
  /** Negative, with its sign, as the engine and `FiledAnchor` carry it. */
  amount_eur: DecimalString;
}

/** What a `renta` declares of the savings base. */
export interface FiledRentaFigures {
  savings_base_eur: DecimalString;
  pending_losses: FiledPendingLoss[];
  /** Losses still deferred by the wash-sale rule at 31/12. Negative; for comparison only (feature 009, Q9). */
  deferred_losses_eur: DecimalString;
}

/**
 * One asset as an informative return declares it. Cash is **the account**; a
 * security is **(account, asset)**. Without this list there is no way to know
 * when the taxpayer stopped holding something that was declared, which is the
 * second trigger of having to file again (prompt 010, P3).
 */
export interface FiledItem {
  category: FilingCategory;
  account_id: AccountId;
  /** Absent on a cash account: the item is the account itself. */
  asset_id?: AssetId;
  /** Cash: the balance at 31/12 and the average of the fourth quarter (P2). */
  balance_eur?: DecimalString;
  q4_average_eur?: DecimalString;
  /** Securities and crypto: the value at 31/12. */
  value_eur?: DecimalString;
}

/** What a `720` or a `721` declares, by category and asset by asset. */
export interface FiledInformativeFigures {
  accounts?: { balance_eur: DecimalString; q4_average_eur: DecimalString };
  securities?: { value_eur: DecimalString };
  crypto?: { value_eur: DecimalString };
  items: FiledItem[];
}

export type FiledFigures = FiledRentaFigures | FiledInformativeFigures;

/**
 * What the application computed the day the filing was recorded, in the same
 * shape as what was declared, plus what it takes to reproduce it: the day of
 * the calculation and the **whole resolved configuration**, because the
 * `settings_changed` in force alone does not reproduce a reading that fell
 * back to the code for anything (`settings.from_code`).
 */
export type FiledComputed<F extends FiledFigures = FiledFigures> = F & {
  as_of: CivilDate;
  /** Id of the `settings_changed` in force, or `"default"`. */
  settings_origin: string;
  settings: Settings;
};

/**
 * The ledger as it stood **before** the filing. Not the raw bytes: those change
 * with the first `compact`, and a false alarm there would be worse than no
 * check at all. The digest is taken over the `lines` first lines migrated to
 * `schema_version` and written canonically, and `compact` verifies every
 * fingerprint before rewriting and seals them again afterwards.
 */
export interface LedgerFingerprint {
  schema_version: number;
  /** How many lines of the file the digest covers: every event before this one. */
  lines: number;
  /** Lower-case hex SHA-256. */
  sha256: string;
}

/**
 * The record of a return actually filed (ADR-0020). It is **a fact, not a
 * calculation**: what it declares is what was filed, even when the application
 * computes something else today. Comparing the two is the point.
 *
 * A supplementary return is a new event with `supersedes`, never a `reversal`:
 * the first filing did happen. A `reversal` of a filing is for a return that
 * was never filed at all, and one that another filing supersedes cannot be
 * reversed, like anything else already consumed (ADR-0003).
 */
export interface TaxReturnFiledEvent extends Envelope {
  type: "tax_return_filed";
  model: FilingModel;
  tax_year: number;
  /** The day it was filed. After 31/12 of `tax_year`, and never in the future. */
  filed_at: CivilDate;
  /** The reference of the receipt the tax agency returns. */
  receipt_reference: string;
  /** The filing this one replaces: a supplementary return. */
  supersedes?: Ulid;
  declared: FiledFigures;
  computed: FiledComputed;
  ledger_fingerprint: LedgerFingerprint;
  notes?: string;
  fingerprint: string;
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
  | SwapEvent
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
  | TaxReturnFiledEvent
  | ReversalEvent;

export type LedgerEvent = SupportedEvent | ReservedEvent;

export type EventOf<T extends SupportedEvent["type"]> = Extract<SupportedEvent, { type: T }>;

/** What a caller provides to record an event: the envelope and the fingerprint are filled in by the use case. */
export type Draft<T extends SupportedEvent = SupportedEvent> = T extends unknown
  ? Omit<T, "schema_version" | "id" | "recorded_at" | "fingerprint"> & { fingerprint?: string }
  : never;
