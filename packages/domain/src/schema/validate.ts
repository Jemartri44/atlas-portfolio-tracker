// Shape validation of a single event, without context (data-model.md §2):
// required fields, decimal strings, dates, currencies, enumerations, ULIDs,
// and the per-type consistency rules that need no projected state.

import { isCivilDate } from "../dates/civil-date.js";
import { ValidationError } from "../errors.js";
import { isRecord, type UnknownRecord } from "../guards.js";
import { isUlid } from "../ids/ulid.js";
import { Decimal, isDecimalString } from "../money/decimal.js";
import { isCurrency } from "../money/money.js";
import { validateSettings } from "../settings/settings.js";
import {
  CURRENT_SCHEMA_VERSION,
  isReservedEventType,
  isSupportedEventType,
  type SupportedEventType,
} from "./envelope.js";
import {
  ASSET_CLASSES,
  ASSET_TYPES,
  BOOKS,
  CORPORATE_ACTION_KINDS,
  type LedgerEvent,
  ORDER_SIDES,
  ORDER_STAGES,
  TRANSFER_REQUEST_STAGES,
} from "./events.js";

type RuleKind =
  | "string"
  | "decimal"
  | "positive_decimal"
  | "boolean"
  | "date"
  | "currency"
  | "country"
  | "ulid"
  | "enum"
  | "array"
  | "positive_integer";

interface Rule {
  kind: RuleKind;
  optional?: true;
  values?: readonly string[];
}

type Rules = Record<string, Rule>;

const req = (kind: RuleKind): Rule => ({ kind });
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
  active: req("boolean"),
};

const CASH_MOVEMENT: Rules = {
  account_id: req("string"),
  value_date: req("date"),
  amount: req("positive_decimal"),
  currency: req("currency"),
  fx_rate: req("positive_decimal"),
  notes: opt("string"),
  fingerprint: req("string"),
};

const RULES: Record<SupportedEventType, Rules> = {
  account_created: ACCOUNT,
  account_updated: ACCOUNT,
  asset_created: ASSET,
  asset_updated: ASSET,
  settings_changed: {},
  buy: { ...OPERATION, order_id: opt("ulid"), thesis_id: opt("string") },
  sell: {
    ...OPERATION,
    order_id: opt("ulid"),
    withholding: opt("decimal"),
    thesis_id: opt("string"),
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
    fee: opt("decimal"),
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
    per_unit: opt("decimal"),
    broker_ref: opt("string"),
    fingerprint: req("string"),
    notes: opt("string"),
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
    description: req("string"),
    fingerprint: req("string"),
  },
  valuation: {
    account_id: req("string"),
    asset_id: req("string"),
    date: req("date"),
    quantity: req("decimal"),
    unit_value: req("decimal"),
    currency: req("currency"),
    fx_rate: req("positive_decimal"),
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
  reversal: { reverses_id: req("ulid"), reason: req("string") },
};

const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

const isNonNegativeDecimal = (value: unknown): boolean =>
  isDecimalString(value) && !Decimal.parse(value).isNegative();

const isPositiveDecimal = (value: unknown): boolean =>
  isDecimalString(value) && Decimal.parse(value).isPositive();

const CHECKS: Record<RuleKind, (value: unknown, rule: Rule) => boolean> = {
  string: (value, rule) =>
    typeof value === "string" && (rule.optional === true || value.length > 0),
  decimal: (value) => isNonNegativeDecimal(value),
  positive_decimal: (value) => isPositiveDecimal(value),
  boolean: (value) => typeof value === "boolean",
  date: (value) => isCivilDate(value),
  currency: (value) => isCurrency(value),
  country: (value) => typeof value === "string" && COUNTRY_PATTERN.test(value),
  ulid: (value) => isUlid(value),
  enum: (value, rule) =>
    typeof value === "string" && (rule.values as readonly string[]).includes(value),
  array: (value) => Array.isArray(value),
  positive_integer: (value) => typeof value === "number" && Number.isInteger(value) && value > 0,
};

const invalid = (
  code: string,
  message: string,
  details: Record<string, unknown>,
): ValidationError => new ValidationError(code, message, details);

const checkFields = (raw: UnknownRecord, rules: Rules): void => {
  for (const [field, rule] of Object.entries(rules)) {
    const value = raw[field];
    if (value === undefined) {
      if (rule.optional === true) {
        continue;
      }
      throw invalid("missing_field", `${raw.type}: ${field} is required`, {
        type: raw.type,
        field,
      });
    }
    if (!CHECKS[rule.kind](value, rule)) {
      throw invalid("invalid_field", `${raw.type}: ${field} is not a valid ${rule.kind}`, {
        type: raw.type,
        field,
        value,
      });
    }
  }
};

const exactlyOne = (raw: UnknownRecord, first: string, second: string): void => {
  if ((raw[first] === undefined) === (raw[second] === undefined)) {
    throw invalid(
      "invalid_field",
      `${raw.type}: exactly one of ${first} or ${second} is required`,
      {
        type: raw.type,
        fields: [first, second],
      },
    );
  }
};

const CONSISTENCY: Partial<Record<SupportedEventType, (raw: UnknownRecord) => void>> = {
  buy: (raw) => checkBasis(raw),
  sell: (raw) => checkBasis(raw),
  asset_created: (raw) => checkAssetClass(raw),
  asset_updated: (raw) => checkAssetClass(raw),
  settings_changed: (raw) => {
    validateSettings(raw.settings);
  },
  fx_exchange: (raw) => {
    if (raw.sold_currency === raw.bought_currency) {
      throw invalid("invalid_field", "fx_exchange: sold_currency and bought_currency must differ", {
        type: raw.type,
        value: raw.sold_currency,
      });
    }
  },
  order_placed: (raw) => exactlyOne(raw, "amount", "quantity"),
  transfer_requested: (raw) => exactlyOne(raw, "quantity_out", "amount_eur"),
  transfer: (raw) => checkTransfer(raw),
};

function checkBasis(raw: UnknownRecord): void {
  checkDates(raw);
  if (raw.amount === undefined && raw.unit_price === undefined) {
    throw invalid("missing_field", `${raw.type}: unit_price is required when amount is absent`, {
      type: raw.type,
      field: "unit_price",
    });
  }
}

function checkDates(raw: UnknownRecord): void {
  if ((raw.value_date as string) < (raw.trade_date as string)) {
    throw invalid("invalid_field", `${raw.type}: value_date must not precede trade_date`, {
      type: raw.type,
      trade_date: raw.trade_date,
      value_date: raw.value_date,
    });
  }
}

function checkAssetClass(raw: UnknownRecord): void {
  const hasClass = raw.asset_class !== undefined;
  if (raw.book === "core" && !hasClass) {
    throw invalid("missing_field", `${raw.type}: asset_class is required for core assets`, {
      type: raw.type,
      field: "asset_class",
    });
  }
  if (raw.book === "bucket" && hasClass) {
    throw invalid("invalid_field", `${raw.type}: asset_class is not allowed for bucket assets`, {
      type: raw.type,
      field: "asset_class",
    });
  }
}

function checkTransfer(raw: UnknownRecord): void {
  const custody = raw.from_asset_id === raw.to_asset_id;
  if (custody) {
    if (raw.from_account_id === raw.to_account_id) {
      throw invalid("invalid_field", "transfer: custody transfer needs two different accounts", {
        type: raw.type,
      });
    }
    if (raw.nav_out !== undefined || raw.nav_in !== undefined) {
      throw invalid("invalid_field", "transfer: custody transfer carries no nav_out/nav_in", {
        type: raw.type,
      });
    }
    if (raw.quantity_in !== raw.quantity_out) {
      throw invalid("invalid_field", "transfer: custody transfer keeps the same quantity", {
        type: raw.type,
        quantity_out: raw.quantity_out,
        quantity_in: raw.quantity_in,
      });
    }
    return;
  }
  if (raw.nav_out === undefined || raw.nav_in === undefined) {
    throw invalid("missing_field", "transfer: fund transfer requires nav_out and nav_in", {
      type: raw.type,
    });
  }
}

const checkEnvelope = (raw: UnknownRecord): void => {
  if (raw.schema_version !== CURRENT_SCHEMA_VERSION) {
    throw invalid("invalid_envelope", `schema_version must be ${CURRENT_SCHEMA_VERSION}`, {
      field: "schema_version",
      value: raw.schema_version,
    });
  }
  if (!isUlid(raw.id)) {
    throw invalid("invalid_envelope", "id must be a ULID", { field: "id", value: raw.id });
  }
  const recordedAt = raw.recorded_at;
  if (
    typeof recordedAt !== "string" ||
    !INSTANT_PATTERN.test(recordedAt) ||
    Number.isNaN(Date.parse(recordedAt))
  ) {
    throw invalid("invalid_envelope", "recorded_at must be an ISO 8601 UTC instant", {
      field: "recorded_at",
      value: recordedAt,
    });
  }
  if (raw.corrects_id !== undefined && !isUlid(raw.corrects_id)) {
    throw invalid("invalid_envelope", "corrects_id must be a ULID", {
      field: "corrects_id",
      value: raw.corrects_id,
    });
  }
};

/** Validates envelope and per-type shape. Returns the same object, typed. */
export const validateShape = (raw: unknown): LedgerEvent => {
  if (!isRecord(raw)) {
    throw invalid("invalid_line", "an event must be a JSON object", { value: raw });
  }
  checkEnvelope(raw);
  const type = raw.type;
  if (isReservedEventType(type)) {
    return raw as LedgerEvent;
  }
  if (!isSupportedEventType(type)) {
    throw invalid("unknown_event_type", `unknown event type ${String(type)}`, { value: type });
  }
  checkFields(raw, RULES[type]);
  CONSISTENCY[type]?.(raw);
  return raw as unknown as LedgerEvent;
};
