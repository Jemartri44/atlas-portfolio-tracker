// Shape validation of a single event, without context (data-model.md §2):
// required fields, decimal strings, dates, currencies, enumerations, ULIDs,
// and the per-type consistency rules that need no projected state.

import { isCivilDate, isWeekend } from "../dates/civil-date.js";
import { madridDateOf } from "../dates/madrid.js";
import { ValidationError } from "../errors.js";
import { INSTANT_PATTERN, isRecord, SHA256_HEX, type UnknownRecord } from "../guards.js";
import { isUlid } from "../ids/ulid.js";
import { Decimal, isDecimalString } from "../money/decimal.js";
import { isCurrency } from "../money/money.js";
import { isRatioString } from "../money/ratio.js";
import { validateSettings } from "../settings/settings.js";
import { isReservedEventType, isSupportedEventType, type SupportedEventType } from "./envelope.js";
import {
  type EffectOp,
  FILING_CATEGORIES,
  FIRST_FILING_YEAR,
  type FilingCategory,
  type FilingModel,
  type LedgerEvent,
} from "./events.js";
import { CURRENT_LEDGER_SCHEMA, type LedgerSchema } from "./migrations/index.js";
import {
  CATEGORY_TOTAL,
  EFFECT_COMMON,
  EFFECT_RULES,
  FINGERPRINT_RULES,
  INFORMATIVE_FIGURES,
  ITEM_FIELDS,
  MODEL_CATEGORIES,
  PENDING_LOSS,
  PER_ACCOUNT_RULES,
  RENTA_FIGURES,
  RULES,
  type Rule,
  type RuleKind,
  type Rules,
  req,
} from "./rules.js";

const COUNTRY_PATTERN = /^[A-Z]{2}$/;

const isNonNegativeDecimal = (value: unknown): boolean =>
  isDecimalString(value) && !Decimal.parse(value).isNegative();

const isPositiveDecimal = (value: unknown): boolean =>
  isDecimalString(value) && Decimal.parse(value).isPositive();

const CHECKS: Record<RuleKind, (value: unknown, rule: Rule) => boolean> = {
  string: (value, rule) =>
    typeof value === "string" && (rule.optional === true || value.length > 0),
  decimal: (value) => isNonNegativeDecimal(value),
  // Any decimal string: the sign is judged by a rule of its own, with a code
  // that says what is wrong (`broker_settled_eur`).
  signed_decimal: (value) => isDecimalString(value),
  positive_decimal: (value) => isPositiveDecimal(value),
  // A pending loss carries its sign, and a balance that is not negative is not
  // a loss: saying so here is what keeps a declared figure from changing sign
  // on the way in.
  negative_decimal: (value) => isDecimalString(value) && Decimal.parse(value).isNegative(),
  non_positive_decimal: (value) => isDecimalString(value) && !Decimal.parse(value).isPositive(),
  object: (value) => isRecord(value),
  non_negative_integer: (value) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0,
  sha256: (value) => typeof value === "string" && SHA256_HEX.test(value),
  boolean: (value) => typeof value === "boolean",
  date: (value) => isCivilDate(value),
  currency: (value) => isCurrency(value),
  country: (value) => typeof value === "string" && COUNTRY_PATTERN.test(value),
  ulid: (value) => isUlid(value),
  enum: (value, rule) =>
    typeof value === "string" && (rule.values as readonly string[]).includes(value),
  array: (value) => Array.isArray(value),
  non_empty_array: (value) => Array.isArray(value) && value.length > 0,
  positive_integer: (value) => typeof value === "number" && Number.isInteger(value) && value > 0,
  ratio: (value) => isRatioString(value),
  unit_interval: (value) => isNonNegativeDecimal(value) && !Decimal.parse(value).gt(Decimal.ONE),
  all_or_positive_decimal: (value) => value === "all" || isPositiveDecimal(value),
};

const invalid = (
  code: string,
  message: string,
  details: Record<string, unknown>,
): ValidationError => new ValidationError(code, message, details);

/** Checks `record` against `rules`; `path` qualifies nested fields (`effects[0].ratio`) in messages and details. */
const checkFields = (record: UnknownRecord, rules: Rules, type: unknown, path = ""): void => {
  for (const [name, rule] of Object.entries(rules)) {
    const field = `${path}${name}`;
    const value = record[name];
    if (value === undefined) {
      if (rule.optional === true) {
        continue;
      }
      throw invalid("missing_field", `${type}: ${field} is required`, { type, field });
    }
    if (!CHECKS[rule.kind](value, rule)) {
      throw invalid("invalid_field", `${type}: ${field} is not a valid ${rule.kind}`, {
        type,
        field,
        value,
      });
    }
  }
};

const requireRecord = (value: unknown, type: unknown, field: string): UnknownRecord => {
  if (!isRecord(value)) {
    throw invalid("invalid_field", `${type}: ${field} must be an object`, { type, field, value });
  }
  return value;
};

/** Validates `effects[]` of a corporate action: op, per-op fields and `per_account[]` entries. */
const checkEffects = (raw: UnknownRecord): void => {
  (raw.effects as unknown[]).forEach((candidate, index) => {
    const path = `effects[${index}].`;
    const effect = requireRecord(candidate, raw.type, `effects[${index}]`);
    checkFields(effect, EFFECT_COMMON, raw.type, path);
    const op = effect.op as EffectOp;
    checkFields(effect, EFFECT_RULES[op], raw.type, path);
    checkFxPairs({ ...effect, type: raw.type }, FX_EFFECT_PAIRS[op] ?? [], path);
    checkFxDates({ ...effect, type: raw.type }, FX_EFFECT_DATES[op] ?? [], path);
    if (op === "grant") {
      checkGrantIncome(effect, raw.type, path);
    }
    const entryRules = PER_ACCOUNT_RULES[op];
    if (entryRules !== undefined) {
      (effect.per_account as unknown[]).forEach((entry, position) => {
        const entryPath = `${path}per_account[${position}]`;
        checkFields(
          requireRecord(entry, raw.type, entryPath),
          entryRules,
          raw.type,
          `${entryPath}.`,
        );
      });
    }
  });
};

/**
 * The amount and the base of income in kind travel together (ADR-0021). An
 * amount without a base is an amount nobody can declare, and a base without an
 * amount is a category with nothing in it; either half alone would be a figure
 * the tax engine would have to guess at, and guessing is what this whole
 * feature exists to avoid.
 */
const checkGrantIncome = (effect: UnknownRecord, type: unknown, path: string): void => {
  const hasAmount = effect.income_eur !== undefined;
  const hasBase = effect.income_base !== undefined;
  if (hasAmount === hasBase) {
    return;
  }
  const field = hasAmount ? "income_base" : "income_eur";
  throw invalid("missing_field", `${type}: ${path}${field} is required with the other`, {
    type,
    field: `${path}${field}`,
  });
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

/**
 * Currency/rate pairs each event type declares (data-schema.md §4). Declaring
 * them in one table keeps the two ECB rules below impossible to forget in a new
 * event type; `reserved-types.test.ts` and `validate.test.ts` check the cover.
 */
const FX_PAIRS: Partial<Record<SupportedEventType, readonly (readonly [string, string])[]>> = {
  buy: [["currency", "fx_rate"]],
  sell: [["currency", "fx_rate"]],
  swap: [["currency", "fx_rate"]],
  dividend: [["currency", "fx_rate"]],
  interest: [["currency", "fx_rate"]],
  fx_exchange: [
    ["sold_currency", "fx_rate_sold"],
    ["bought_currency", "fx_rate_bought"],
  ],
  cash_deposit: [["currency", "fx_rate"]],
  cash_withdrawal: [["currency", "fx_rate"]],
  standalone_fee: [["currency", "fx_rate"]],
  valuation: [["currency", "fx_rate"]],
};

/** Fields holding the date of an ECB rate; the ECB publishes on working days only. */
const FX_DATE_FIELDS: Partial<Record<SupportedEventType, readonly string[]>> = {
  buy: ["fx_rate_date"],
  sell: ["fx_rate_date"],
  swap: ["fx_rate_date"],
  dividend: ["fx_rate_date"],
  interest: ["fx_rate_date"],
  fx_exchange: ["fx_rate_date"],
  // Required in these four since ADR-0021; they were optional between features
  // 005 and 008, and the hardening had to happen while the real ledger was
  // still empty (ADR-0018, see the note in `events.ts`).
  valuation: ["fx_rate_date"],
  cash_deposit: ["fx_rate_date"],
  cash_withdrawal: ["fx_rate_date"],
  standalone_fee: ["fx_rate_date"],
};

/**
 * The ECB rates **inside the effects** of a corporate action, by operation of
 * the effect: a dimension of their own, because the two tables above go by
 * event type and an effect is not one. The
 * validation of `effects[]` reads it here, at the same point as before, and
 * the check against the ECB history walks it with the other two: **one
 * enumeration of the rate fields of the schema, and only one**.
 */
const FX_EFFECT_PAIRS: Partial<Record<EffectOp, readonly (readonly [string, string])[]>> = {
  forced_sale: [["currency", "fx_rate"]],
  grant: [["currency", "fx_rate"]],
};

const FX_EFFECT_DATES: Partial<Record<EffectOp, readonly string[]>> = {
  forced_sale: ["fx_rate_date"],
  grant: ["fx_rate_date"],
};

/** The euro is its own reference: the ECB publishes 1, not 1.0000. */
const checkFxPairs = (
  raw: UnknownRecord,
  pairs: readonly (readonly [string, string])[],
  path = "",
): void => {
  for (const [currencyField, rateField] of pairs) {
    if (raw[currencyField] === "EUR" && raw[rateField] !== "1") {
      throw invalid(
        "eur_fx_rate_not_one",
        `${raw.type}: ${path}${rateField} must be exactly "1" when ${path}${currencyField} is EUR`,
        { type: raw.type, field: `${path}${rateField}`, value: raw[rateField] },
      );
    }
  }
};

const checkFxDates = (raw: UnknownRecord, fields: readonly string[], path = ""): void => {
  for (const field of fields) {
    const value = raw[field];
    if (isCivilDate(value) && isWeekend(value)) {
      throw invalid(
        "fx_rate_date_weekend",
        `${raw.type}: ${path}${field} falls on a weekend; the ECB publishes no rate then`,
        { type: raw.type, field: `${path}${field}`, value },
      );
    }
  }
};

/**
 * The shape of what a filing declares and of what it computed, which the flat
 * rules cannot express: nested objects, a different shape per model, and the
 * two lists with no repeated key.
 */
const checkFiledFigures = (raw: UnknownRecord, field: "declared" | "computed"): void => {
  const type = "tax_return_filed";
  const model = raw.model as FilingModel;
  const figures = requireRecord(raw[field], type, field);
  const path = `${field}.`;
  if (model === "renta") {
    checkFields(figures, RENTA_FIGURES, type, path);
    const seen = new Set<string>();
    (figures.pending_losses as unknown[]).forEach((candidate, index) => {
      const entry = requireRecord(candidate, type, `${path}pending_losses[${index}]`);
      checkFields(entry, PENDING_LOSS, type, `${path}pending_losses[${index}].`);
      // A loss of a year later than the one being declared did not exist yet.
      if ((entry.origin_year as number) > (raw.tax_year as number)) {
        throw invalid(
          "invalid_field",
          `${type}: ${path}pending_losses[${index}].origin_year is after the tax year`,
          { type, field: `${path}pending_losses[${index}].origin_year`, value: entry.origin_year },
        );
      }
      const key = `${String(entry.origin_year)}|${String(entry.category)}`;
      if (seen.has(key)) {
        throw invalid("duplicate_pending_loss", `${type}: ${path}pending_losses repeats ${key}`, {
          type,
          field: `${path}pending_losses`,
          origin_year: entry.origin_year,
          category: entry.category,
        });
      }
      seen.add(key);
    });
    return;
  }
  checkFields(figures, INFORMATIVE_FIGURES, type, path);
  const allowed = MODEL_CATEGORIES[model];
  for (const category of FILING_CATEGORIES) {
    const total = figures[category];
    if (total === undefined) {
      continue;
    }
    // A category the model does not have is not a total the reader can trust.
    if (!allowed.includes(category)) {
      throw invalid("invalid_field", `${type}: a ${model} does not declare ${category}`, {
        type,
        field: `${path}${category}`,
        value: category,
      });
    }
    checkFields(
      requireRecord(total, type, `${path}${category}`),
      CATEGORY_TOTAL[category],
      type,
      `${path}${category}.`,
    );
  }
  const keys = new Set<string>();
  (figures.items as unknown[]).forEach((candidate, index) => {
    const where = `${path}items[${index}]`;
    const item = requireRecord(candidate, type, where);
    const category = item.category;
    if (!allowed.includes(category as FilingCategory)) {
      throw invalid("invalid_field", `${type}: ${where}.category is not a category of a ${model}`, {
        type,
        field: `${where}.category`,
        value: category,
      });
    }
    checkFields(item, ITEM_FIELDS[category as FilingCategory], type, `${where}.`);
    const key = `${category as string}|${String(item.account_id)}|${String(item.asset_id ?? "")}`;
    if (keys.has(key)) {
      throw invalid("duplicate_filed_item", `${type}: ${path}items repeats ${key}`, {
        type,
        field: `${path}items`,
        category,
        account_id: item.account_id,
        asset_id: item.asset_id,
      });
    }
    keys.add(key);
  });
};

const CONSISTENCY: Partial<Record<SupportedEventType, (raw: UnknownRecord) => void>> = {
  buy: (raw) => {
    checkBasis(raw);
    checkBrokerSettled(raw, false);
  },
  sell: (raw) => {
    checkBasis(raw);
    checkBrokerSettled(raw, false);
  },
  dividend: (raw) => checkBrokerSettled(raw, true),
  interest: (raw) => checkBrokerSettled(raw, true),
  standalone_fee: (raw) => checkBrokerSettled(raw, false),
  asset_created: (raw) => checkAssetClass(raw),
  asset_updated: (raw) => checkAssetClass(raw),
  settings_changed: (raw) => {
    validateSettings(raw.settings);
  },
  tax_return_filed: (raw) => {
    const type = "tax_return_filed";
    const model = raw.model as FilingModel;
    const year = raw.tax_year as number;
    const first = FIRST_FILING_YEAR[model];
    if (year < first) {
      throw invalid("filing_year_unsupported", `${type}: a ${model} cannot be filed for ${year}`, {
        type,
        model,
        tax_year: year,
        first_supported: first,
      });
    }
    // A return is filed after the year it declares has ended, and nobody
    // records today what they will file tomorrow.
    const filedAt = raw.filed_at as string;
    if (filedAt <= `${year}-12-31`) {
      throw invalid(
        "filed_at_not_after_year",
        `${type}: filed_at must be after 31/12 of the tax year`,
        { type, field: "filed_at", filed_at: filedAt, tax_year: year },
      );
    }
    const recordedAt = madridDateOf(raw.recorded_at as string);
    if (filedAt > recordedAt) {
      throw invalid("filed_at_in_future", `${type}: filed_at is after the day it was recorded`, {
        type,
        field: "filed_at",
        filed_at: filedAt,
        recorded_at: recordedAt,
      });
    }
    checkFiledFigures(raw, "declared");
    checkFiledFigures(raw, "computed");
    const computed = raw.computed as UnknownRecord;
    checkFields(
      computed,
      { as_of: req("date"), settings_origin: req("string"), settings: req("object") },
      type,
      "computed.",
    );
    // `computed.as_of` is the date the comparison of ADR-0020 re-reads the
    // prefix of the ledger with, so an absurd one splits the difference
    // between declared and computed into four causes that are false, with
    // nothing to say so.
    //
    // **The rule is that `as_of` covers the whole year it declares**: a
    // calculation made with a cut that leaves half the return out declares
    // incomplete figures. The cut of the ledger includes its own date (`asOf`
    // skips only what comes *after* it), so 31 December of the year covers it
    // whole and is valid.
    //
    // The upper bound is `recorded_at` and **not** `filed_at`. Recording a
    // return after filing it is the ordinary flow —file at the tax agency one
    // day, note it here another— and `as_of` is the day the application
    // computed, so it comes after `filed_at` every time. Two comparisons, and
    // only two: "not in the future" is the second one, not a third.
    const asOf = computed.as_of as string;
    if (asOf < `${year}-12-31`) {
      throw invalid(
        "as_of_before_year_end",
        `${type}: computed.as_of does not cover the whole tax year it declares`,
        { type, field: "computed.as_of", as_of: asOf, tax_year: year },
      );
    }
    if (asOf > recordedAt) {
      throw invalid(
        "as_of_in_future",
        `${type}: computed.as_of is after the day the line was recorded`,
        { type, field: "computed.as_of", as_of: asOf, recorded_at: recordedAt },
      );
    }
    validateSettings(computed.settings);
    checkFields(
      requireRecord(raw.ledger_fingerprint, type, "ledger_fingerprint"),
      FINGERPRINT_RULES,
      type,
      "ledger_fingerprint.",
    );
  },
  fx_exchange: (raw) => {
    if (raw.sold_currency === raw.bought_currency) {
      throw invalid("invalid_field", "fx_exchange: sold_currency and bought_currency must differ", {
        type: raw.type,
        field: "bought_currency",
        value: raw.sold_currency,
      });
    }
  },
  swap: (raw) => checkSwap(raw),
  order_placed: (raw) => exactlyOne(raw, "amount", "quantity"),
  transfer_requested: (raw) => exactlyOne(raw, "quantity_out", "amount_eur"),
  transfer: (raw) => checkTransfer(raw),
  corporate_action: (raw) => checkEffects(raw),
};

/**
 * `broker_settled_eur` (ADR-0030): the euros the
 * broker really moved for the event, as its statement prints them. Each wrong
 * case with its own code, never folded into another: in euros it would only
 * repeat the amount; negative, it contradicts the event type, which gives the
 * sign; zero, it is a known zero only where it can happen — a dividend or an
 * interest withheld whole — and describes no movement anywhere else. Absent
 * means **unknown**, never zero: that is why the field is optional and never
 * filled in by the application.
 */
function checkBrokerSettled(raw: UnknownRecord, zeroAllowed: boolean): void {
  const value = raw.broker_settled_eur;
  if (value === undefined) {
    return;
  }
  const details = { type: raw.type, field: "broker_settled_eur", value };
  if (raw.currency === "EUR") {
    throw invalid(
      "broker_settled_eur_in_eur",
      `${raw.type}: broker_settled_eur only exists for an operation in another currency`,
      details,
    );
  }
  const amount = Decimal.parse(value as string);
  if (amount.isNegative()) {
    throw invalid(
      "broker_settled_eur_negative",
      `${raw.type}: broker_settled_eur is never negative; the event type gives the sign`,
      details,
    );
  }
  if (!zeroAllowed && !amount.isPositive()) {
    throw invalid(
      "broker_settled_eur_zero",
      `${raw.type}: broker_settled_eur cannot be zero here; leave it out when it is not known`,
      details,
    );
  }
}

function checkBasis(raw: UnknownRecord): void {
  checkDates(raw);
  if (raw.amount === undefined && raw.unit_price === undefined) {
    throw invalid("missing_field", `${raw.type}: unit_price is required when amount is absent`, {
      type: raw.type,
      field: "unit_price",
    });
  }
}

/**
 * A swap of an asset for itself is not an operation: it would consume lots by
 * FIFO and open one with the same asset and a date of its own, quietly
 * resetting the antiquity of a position nobody sold.
 */
function checkSwap(raw: UnknownRecord): void {
  checkDates(raw);
  if (raw.from_asset_id === raw.to_asset_id) {
    throw invalid("invalid_field", "swap: an asset cannot be swapped for itself", {
      type: raw.type,
      field: "to_asset_id",
      value: raw.to_asset_id,
    });
  }
}

function checkDates(raw: UnknownRecord): void {
  if ((raw.value_date as string) < (raw.trade_date as string)) {
    throw invalid("invalid_field", `${raw.type}: value_date must not precede trade_date`, {
      type: raw.type,
      field: "value_date",
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
  if (raw.fee !== undefined) {
    throw invalid(
      "transfer_fee_not_allowed",
      "transfer: a transfer carries no fee; record the custodian charge as a standalone_fee",
      { type: raw.type, field: "fee", value: raw.fee },
    );
  }
  const custody = raw.from_asset_id === raw.to_asset_id;
  if (custody) {
    if (raw.from_account_id === raw.to_account_id) {
      throw invalid("invalid_field", "transfer: custody transfer needs two different accounts", {
        type: raw.type,
        field: "to_account_id",
      });
    }
    if (raw.nav_out !== undefined || raw.nav_in !== undefined) {
      throw invalid("invalid_field", "transfer: custody transfer carries no nav_out/nav_in", {
        type: raw.type,
        field: raw.nav_out === undefined ? "nav_in" : "nav_out",
      });
    }
    if (raw.quantity_in !== raw.quantity_out) {
      throw invalid("invalid_field", "transfer: custody transfer keeps the same quantity", {
        type: raw.type,
        field: "quantity_in",
        quantity_out: raw.quantity_out,
        quantity_in: raw.quantity_in,
      });
    }
    return;
  }
  if (raw.nav_out === undefined || raw.nav_in === undefined) {
    throw invalid("missing_field", "transfer: fund transfer requires nav_out and nav_in", {
      type: raw.type,
      field: raw.nav_out === undefined ? "nav_out" : "nav_in",
    });
  }
}

const checkEnvelope = (raw: UnknownRecord, schema: LedgerSchema): void => {
  if (raw.schema_version !== schema.version) {
    throw invalid("invalid_envelope", `schema_version must be ${schema.version}`, {
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

const ENVELOPE_FIELDS = ["schema_version", "id", "recorded_at", "type", "corrects_id"] as const;

/**
 * Where every ECB rate and rate date lives: by event type, and by operation of
 * an effect. **The** enumeration: the validation and the check against the ECB
 * history both read it, and a test holds it field by field, type by type.
 */
export const FX_FIELDS = {
  pairs: FX_PAIRS,
  dates: FX_DATE_FIELDS,
  effectPairs: FX_EFFECT_PAIRS,
  effectDates: FX_EFFECT_DATES,
} as const;

/** The fields an effect of `op` may carry. */
export const knownEffectFieldsOf = (op: EffectOp): readonly string[] => [
  ...Object.keys(EFFECT_COMMON),
  ...Object.keys(EFFECT_RULES[op]),
];

/** Top-level fields a line of `type` may carry: envelope plus the type's rules (`settings` for settings_changed). */
export const knownFieldsOf = (type: SupportedEventType): readonly string[] => [
  ...ENVELOPE_FIELDS,
  ...Object.keys(RULES[type]),
  ...(type === "settings_changed" ? ["settings"] : []),
];

/** Validates envelope (against `schema.version`) and per-type shape. Returns the same object, typed. */
export const validateShape = (
  raw: unknown,
  schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
): LedgerEvent => {
  if (!isRecord(raw)) {
    throw invalid("invalid_line", "an event must be a JSON object", { value: raw });
  }
  checkEnvelope(raw, schema);
  const type = raw.type;
  if (isReservedEventType(type)) {
    return raw as LedgerEvent;
  }
  if (!isSupportedEventType(type)) {
    throw invalid("unknown_event_type", `unknown event type ${String(type)}`, { value: type });
  }
  checkFields(raw, RULES[type], type);
  checkFxPairs(raw, FX_PAIRS[type] ?? []);
  checkFxDates(raw, FX_DATE_FIELDS[type] ?? []);
  CONSISTENCY[type]?.(raw);
  return raw as unknown as LedgerEvent;
};
