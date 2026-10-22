// The field rules of every event type, effect and filing figure: pure tables,
// read by the checks of `validate.ts`.

import { INCOME_CATEGORIES } from "../settings/settings.js";
import type { SupportedEventType } from "./envelope.js";
import {
  ASSET_CLASSES,
  ASSET_TYPES,
  BOOKS,
  CORPORATE_ACTION_KINDS,
  EFFECT_OPS,
  type EffectOp,
  FEE_KINDS,
  FILING_MODELS,
  type FilingCategory,
  type FilingModel,
  INCOME_BASES,
  ORDER_SIDES,
  ORDER_STAGES,
  TRANSFER_REQUEST_STAGES,
} from "./events.js";

export type RuleKind =
  | "string"
  | "decimal"
  | "signed_decimal"
  | "positive_decimal"
  | "negative_decimal"
  | "non_positive_decimal"
  | "object"
  | "non_negative_integer"
  | "sha256"
  | "boolean"
  | "date"
  | "currency"
  | "country"
  | "ulid"
  | "enum"
  | "array"
  | "non_empty_array"
  | "positive_integer"
  | "ratio"
  | "unit_interval"
  | "all_or_positive_decimal";

export interface Rule {
  kind: RuleKind;
  optional?: true;
  values?: readonly string[];
}

export type Rules = Record<string, Rule>;

export const req = (kind: RuleKind): Rule => ({ kind });
const opt = (kind: RuleKind): Rule => ({ kind, optional: true });
const oneOf = (values: readonly string[]): Rule => ({ kind: "enum", values });

const OPERATION: Rules = {
  account_id: req("string"),
  asset_id: req("string"),
  trade_date: req("date"),
  value_date: req("date"),
  quantity: req("positive_decimal"),
  unit_price: opt("decimal"),
  amount: opt("decimal"),
  currency: req("currency"),
  fx_rate: req("positive_decimal"),
  fx_rate_date: req("date"),
  fee: req("decimal"),
  broker_ref: opt("string"),
  fingerprint: req("string"),
  source: req("string"),
  notes: opt("string"),
};

const ACCOUNT: Rules = {
  account_id: req("string"),
  name: req("string"),
  platform: req("string"),
  book: oneOf(BOOKS),
  base_currency: req("currency"),
  country: req("country"),
  active: req("boolean"),
};

const ASSET: Rules = {
  asset_id: req("string"),
  asset_type: oneOf(ASSET_TYPES),
  book: oneOf(BOOKS),
  asset_class: { kind: "enum", optional: true, values: ASSET_CLASSES },
  isin: opt("string"),
  ticker: opt("string"),
  name: req("string"),
  currency: req("currency"),
  ter: opt("decimal"),
  transferable: req("boolean"),
  reference_etf_id: opt("string"),
  market: opt("string"),
  issuer_country: opt("country"),
  active: req("boolean"),
};

const CASH_MOVEMENT: Rules = {
  account_id: req("string"),
  value_date: req("date"),
  amount: req("positive_decimal"),
  currency: req("currency"),
  fx_rate: req("positive_decimal"),
  fx_rate_date: req("date"),
  notes: opt("string"),
  fingerprint: req("string"),
};

export const EFFECT_COMMON: Rules = { op: oneOf(EFFECT_OPS), asset_id: opt("string") };

const PRICED: Rules = {
  currency: req("currency"),
  fx_rate: req("positive_decimal"),
  fx_rate_date: req("date"),
};

/** Shape of each primitive (data-schema.md §6.5). `per_account` entries have their own rules. */
export const EFFECT_RULES: Record<EffectOp, Rules> = {
  scale: { ...EFFECT_COMMON, ratio: req("ratio") },
  convert: { ...EFFECT_COMMON, to_asset_id: req("string"), ratio: req("ratio") },
  carve_out: {
    ...EFFECT_COMMON,
    to_asset_id: req("string"),
    ratio: req("ratio"),
    cost_share: req("unit_interval"),
  },
  forced_sale: {
    ...EFFECT_COMMON,
    per_account: req("non_empty_array"),
    unit_price: req("decimal"),
    ...PRICED,
  },
  grant: {
    ...EFFECT_COMMON,
    per_account: req("non_empty_array"),
    unit_cost: req("decimal"),
    ...PRICED,
    acquisition_date: req("date"),
    income_eur: opt("decimal"),
    income_base: { kind: "enum", optional: true, values: INCOME_BASES },
  },
};

export const PER_ACCOUNT_RULES: Partial<Record<EffectOp, Rules>> = {
  forced_sale: {
    account_id: req("string"),
    quantity: req("all_or_positive_decimal"),
    fee: opt("decimal"),
    withholding: opt("decimal"),
  },
  grant: { account_id: req("string"), quantity: req("positive_decimal") },
};

/** Why a fingerprint could not be verified (ADR-0025, as amended): three reasons, never folded into one another. */
const WAIVER_REASONS = ["lines", "digest", "unreadable"] as const;

export const RULES: Record<SupportedEventType, Rules> = {
  account_created: ACCOUNT,
  account_updated: ACCOUNT,
  asset_created: ASSET,
  asset_updated: ASSET,
  settings_changed: {},
  buy: {
    ...OPERATION,
    order_id: opt("ulid"),
    thesis_id: opt("string"),
    broker_settled_eur: opt("signed_decimal"),
  },
  sell: {
    ...OPERATION,
    order_id: opt("ulid"),
    withholding: opt("decimal"),
    thesis_id: opt("string"),
    broker_settled_eur: opt("signed_decimal"),
  },
  swap: {
    account_id: req("string"),
    trade_date: req("date"),
    value_date: req("date"),
    from_asset_id: req("string"),
    quantity_out: req("positive_decimal"),
    market_value_out: req("decimal"),
    to_asset_id: req("string"),
    quantity_in: req("positive_decimal"),
    market_value_in: req("decimal"),
    currency: req("currency"),
    fx_rate: req("positive_decimal"),
    fx_rate_date: req("date"),
    fee: req("decimal"),
    thesis_id: opt("string"),
    broker_ref: opt("string"),
    fingerprint: req("string"),
    source: req("string"),
    notes: opt("string"),
  },
  transfer: {
    request_id: opt("ulid"),
    from_account_id: req("string"),
    from_asset_id: req("string"),
    quantity_out: req("positive_decimal"),
    nav_out: opt("positive_decimal"),
    value_date_out: req("date"),
    to_account_id: req("string"),
    to_asset_id: req("string"),
    quantity_in: req("positive_decimal"),
    nav_in: opt("positive_decimal"),
    value_date_in: req("date"),
    fingerprint: req("string"),
    notes: opt("string"),
  },
  dividend: {
    account_id: req("string"),
    asset_id: req("string"),
    value_date: req("date"),
    gross: req("decimal"),
    withholding_origin: req("decimal"),
    withholding_spain: req("decimal"),
    currency: req("currency"),
    fx_rate: req("positive_decimal"),
    fx_rate_date: req("date"),
    source_country: opt("country"),
    per_unit: opt("decimal"),
    broker_ref: opt("string"),
    fingerprint: req("string"),
    notes: opt("string"),
    broker_settled_eur: opt("signed_decimal"),
  },
  interest: {
    account_id: req("string"),
    value_date: req("date"),
    gross: req("decimal"),
    withholding_spain: req("decimal"),
    currency: req("currency"),
    fx_rate: req("positive_decimal"),
    fx_rate_date: req("date"),
    broker_ref: opt("string"),
    fingerprint: req("string"),
    notes: opt("string"),
    broker_settled_eur: opt("signed_decimal"),
  },
  fx_exchange: {
    account_id: req("string"),
    value_date: req("date"),
    sold_amount: req("positive_decimal"),
    sold_currency: req("currency"),
    bought_amount: req("positive_decimal"),
    bought_currency: req("currency"),
    fee: req("decimal"),
    fee_currency: req("currency"),
    fx_rate_sold: req("positive_decimal"),
    fx_rate_bought: req("positive_decimal"),
    fx_rate_date: req("date"),
    broker_ref: opt("string"),
    fingerprint: req("string"),
    notes: opt("string"),
  },
  cash_deposit: CASH_MOVEMENT,
  cash_withdrawal: CASH_MOVEMENT,
  standalone_fee: {
    account_id: req("string"),
    value_date: req("date"),
    amount: req("positive_decimal"),
    currency: req("currency"),
    fx_rate: req("positive_decimal"),
    fx_rate_date: req("date"),
    description: req("string"),
    fee_kind: { kind: "enum", optional: true, values: FEE_KINDS },
    fingerprint: req("string"),
    broker_settled_eur: opt("signed_decimal"),
  },
  valuation: {
    account_id: req("string"),
    asset_id: req("string"),
    date: req("date"),
    quantity: req("decimal"),
    unit_value: req("decimal"),
    currency: req("currency"),
    fx_rate: req("positive_decimal"),
    fx_rate_date: req("date"),
    source: req("string"),
  },
  order_placed: {
    account_id: req("string"),
    asset_id: req("string"),
    side: oneOf(ORDER_SIDES),
    amount: opt("positive_decimal"),
    quantity: opt("positive_decimal"),
    requested_date: req("date"),
    notes: opt("string"),
  },
  order_updated: {
    order_id: req("ulid"),
    stage: oneOf(ORDER_STAGES),
    date: req("date"),
    notes: opt("string"),
  },
  transfer_requested: {
    from_account_id: req("string"),
    from_asset_id: req("string"),
    to_account_id: req("string"),
    to_asset_id: req("string"),
    quantity_out: opt("positive_decimal"),
    amount_eur: opt("positive_decimal"),
    requested_date: req("date"),
    notes: opt("string"),
  },
  transfer_request_updated: {
    request_id: req("ulid"),
    stage: oneOf(TRANSFER_REQUEST_STAGES),
    date: req("date"),
    nav_out: opt("positive_decimal"),
    quantity_out: opt("positive_decimal"),
    notes: opt("string"),
  },
  corporate_action: {
    kind: oneOf(CORPORATE_ACTION_KINDS),
    asset_id: req("string"),
    effective_date: req("date"),
    source_document: req("string"),
    effects: req("array"),
    neutrality_regime: opt("boolean"),
    notes: opt("string"),
    fingerprint: req("string"),
  },
  thesis_opened: {
    thesis_id: req("string"),
    account_id: req("string"),
    asset_id: req("string"),
    hypothesis: req("string"),
    expected_horizon_days: req("positive_integer"),
    invalidation: req("string"),
    planned_size_eur: req("positive_decimal"),
  },
  thesis_closed: { thesis_id: req("string"), closing_notes: req("string") },
  tax_return_filed: {
    model: oneOf(FILING_MODELS),
    tax_year: req("positive_integer"),
    filed_at: req("date"),
    receipt_reference: req("string"),
    supersedes: opt("ulid"),
    declared: req("object"),
    computed: req("object"),
    ledger_fingerprint: req("object"),
    notes: opt("string"),
    fingerprint: req("string"),
  },
  filing_fingerprint_waived: {
    filing_id: req("ulid"),
    reason: oneOf(WAIVER_REASONS),
    declared_schema_version: req("positive_integer"),
    declared_lines: req("non_negative_integer"),
    notes: opt("string"),
  },
  reversal: { reverses_id: req("ulid"), reason: req("string") },
};

/** The figures of a `renta`, declared and computed alike. */
export const RENTA_FIGURES: Rules = {
  savings_base_eur: req("decimal"),
  pending_losses: req("array"),
  deferred_losses_eur: req("non_positive_decimal"),
};

export const PENDING_LOSS: Rules = {
  origin_year: req("positive_integer"),
  category: oneOf(INCOME_CATEGORIES),
  amount_eur: req("negative_decimal"),
};

/** The figures of a `720` or a `721`: totals per category, plus the assets one by one. */
export const INFORMATIVE_FIGURES: Rules = { items: req("array") };

export const CATEGORY_TOTAL: Record<FilingCategory, Rules> = {
  accounts: { balance_eur: req("decimal"), q4_average_eur: req("decimal") },
  securities: { value_eur: req("decimal") },
  crypto: { value_eur: req("decimal") },
};

/** Which categories each model may declare. A `renta` declares none of them. */
export const MODEL_CATEGORIES: Record<FilingModel, readonly FilingCategory[]> = {
  renta: [],
  "720": ["accounts", "securities"],
  "721": ["crypto"],
};

export const ITEM_FIELDS: Record<FilingCategory, Rules> = {
  accounts: {
    account_id: req("string"),
    balance_eur: req("decimal"),
    q4_average_eur: req("decimal"),
  },
  securities: { account_id: req("string"), asset_id: req("string"), value_eur: req("decimal") },
  crypto: { account_id: req("string"), asset_id: req("string"), value_eur: req("decimal") },
};

export const FINGERPRINT_RULES: Rules = {
  schema_version: req("positive_integer"),
  lines: req("non_negative_integer"),
  sha256: req("sha256"),
};
