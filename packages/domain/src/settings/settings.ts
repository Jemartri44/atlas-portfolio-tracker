// Settings (business-rules.md §7). Only `fiscal_date_rule` and
// `wash_sale_window` have documented defaults (ADR-0013, ADR-0014, to be
// verified with the tax advisor); every other parameter is optional until the
// user sets it.

import { ValidationError } from "../errors.js";
import { isRecord, type UnknownRecord } from "../guards.js";
import { Decimal, type DecimalString, isDecimalString } from "../money/decimal.js";
import { ASSET_TYPES, type AssetType } from "../schema/events.js";

export const FISCAL_DATE_RULES = ["trade_date", "value_date"] as const;
export type FiscalDateRule = (typeof FISCAL_DATE_RULES)[number];

/**
 * Wash-sale window per asset type, counted date to date in whole months or
 * years (ADR-0014): `"2m"`, `"1y"` or an explicit number of days `"<n>d"`.
 * The tax engine (phase 5) reads it; nothing here interprets it. The type says
 * exactly what `isWashSaleWindow` accepts: any other month or year count is a
 * window the rule does not know, and the compiler must say so.
 */
export type WashSaleWindow = "2m" | "1y" | `${number}d`;

const WASH_SALE_WINDOW_PATTERN = /^(2m|1y|[1-9][0-9]*d)$/;

export const isWashSaleWindow = (value: unknown): value is WashSaleWindow =>
  typeof value === "string" && WASH_SALE_WINDOW_PATTERN.test(value);

export interface TaxBracket {
  up_to?: DecimalString;
  rate_pct: DecimalString;
}

export interface Settings {
  /**
   * Partial by design (ADR-0018): an asset type missing here takes its
   * documented default, so adding a value to the enum never invalidates a
   * `settings_changed` already written.
   */
  fiscal_date_rule: Partial<Record<AssetType, FiscalDateRule>>;
  /** Partial too, and for the same reason (ADR-0018). */
  wash_sale_window: Partial<Record<AssetType, WashSaleWindow>>;
  /** Legacy form, still accepted on load; `<n>` equals `"<n>d"` (ADR-0014). Never written by the CLI. */
  wash_sale_window_days?: Partial<Record<AssetType, number>>;
  target_weights?: Record<string, DecimalString>;
  deviation_threshold_pp?: DecimalString;
  satellite_min_weight_pct?: DecimalString;
  monthly_contribution_eur?: DecimalString;
  bucket_pct_of_contribution?: DecimalString;
  bucket_max_cumulative_contribution?: DecimalString;
  bucket_stop_loss_pct?: DecimalString;
  bucket_max_weight_pct?: DecimalString;
  /**
   * The asset that stands for "the boring alternative" of business rule 16. Any
   * `asset_id` of the catalogue, of either book (normally the global fund of
   * the core): it is a performance reference and takes part in no other
   * calculation of the bucket. Its existence is checked when projecting a
   * query, not when writing: the asset may be registered afterwards.
   */
  bucket_benchmark_asset_id?: string;
  stale_price_days?: number;
  model_720_alert_threshold_eur?: DecimalString;
  model_721_alert_threshold_eur?: DecimalString;
  savings_tax_brackets?: TaxBracket[];
  tax_residence?: string;
  notification_email?: string;
  job_frequencies?: Record<string, string>;
  transfer_max_days?: number;
}

/**
 * Value every asset type falls back to when the settings do not mention it
 * (ADR-0018). Complete by construction: the compiler refuses to forget a type
 * added to the enum, which is the whole point of resolving at the point of use
 * instead of demanding complete maps in the ledger.
 */
export const DEFAULT_FISCAL_DATE_RULE: Record<AssetType, FiscalDateRule> = {
  stock: "trade_date",
  etf: "trade_date",
  etc: "trade_date",
  etp: "trade_date",
  crypto: "trade_date",
  fund: "value_date",
  money_market: "value_date",
};

/** Same, for the wash-sale window (ADR-0013, ADR-0014; verify with the tax advisor). */
export const DEFAULT_WASH_SALE_WINDOW: Record<AssetType, WashSaleWindow> = {
  stock: "2m",
  etf: "2m",
  etc: "2m",
  etp: "2m",
  crypto: "1y",
  fund: "1y",
  money_market: "1y",
};

/** Provisional defaults (ADR-0013, ADR-0014). Verify with the tax advisor; change via `settings_changed`, not code. */
export const DEFAULT_SETTINGS: Settings = {
  fiscal_date_rule: DEFAULT_FISCAL_DATE_RULE,
  wash_sale_window: DEFAULT_WASH_SALE_WINDOW,
};

/** The rule in force for an asset type: what the settings say, or its default (ADR-0018). */
export const fiscalDateRuleOf = (settings: Settings, assetType: AssetType): FiscalDateRule =>
  settings.fiscal_date_rule[assetType] ?? DEFAULT_FISCAL_DATE_RULE[assetType];

const DECIMAL_FIELDS = [
  "deviation_threshold_pp",
  "satellite_min_weight_pct",
  "monthly_contribution_eur",
  "bucket_pct_of_contribution",
  "bucket_max_cumulative_contribution",
  "bucket_stop_loss_pct",
  "bucket_max_weight_pct",
  "model_720_alert_threshold_eur",
  "model_721_alert_threshold_eur",
] as const;

interface Range {
  min: string;
  /** Absent for a parameter that is only bounded below. */
  max?: string;
}

/**
 * Ranges the thresholds must be coherent with (specification §5.2). A
 * percentage outside [0, 100] is not a typo the user finds out about later: a
 * negative bucket share produces a negative budget and a core larger than the
 * contribution, and one above 100 makes the calculator ask for negative
 * allocations and die on its own invariant. The rest is bounded below only.
 */
const DECIMAL_RANGES: Partial<Record<(typeof DECIMAL_FIELDS)[number], Range>> = {
  deviation_threshold_pp: { min: "0" },
  satellite_min_weight_pct: { min: "0", max: "100" },
  monthly_contribution_eur: { min: "0" },
  bucket_pct_of_contribution: { min: "0", max: "100" },
  bucket_max_cumulative_contribution: { min: "0" },
  bucket_stop_loss_pct: { min: "0", max: "100" },
  bucket_max_weight_pct: { min: "0", max: "100" },
};

/** Whole days, and zero days means nothing: a price is stale after a positive number of days. */
const INTEGER_FIELDS = ["stale_price_days", "transfer_max_days"] as const;

const fail = (message: string, details: Record<string, unknown>): never => {
  throw new ValidationError("invalid_settings", message, details);
};

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number =>
  isNonNegativeInteger(value) && value > 0;

/**
 * Checks the wash-sale window in whichever form it comes (ADR-0014): the new
 * `wash_sale_window` wins and the legacy `wash_sale_window_days` is accepted
 * and means `"<n>d"`. Both maps are **partial** (ADR-0018): an asset type that
 * neither mentions takes its documented default, so adding a value to the enum
 * never invalidates a line already written. What is present must still be
 * valid: the tolerance is to absence, not to nonsense.
 */
const checkWashSaleWindow = (raw: UnknownRecord): void => {
  const windows = raw.wash_sale_window;
  const legacy = raw.wash_sale_window_days;
  if (windows !== undefined && !isRecord(windows)) {
    fail("wash_sale_window must be an object", { value: windows });
  }
  if (legacy !== undefined && !isRecord(legacy)) {
    fail("wash_sale_window_days must be an object", { value: legacy });
  }
  if (windows === undefined && legacy === undefined) {
    fail("wash_sale_window is required (wash_sale_window_days is accepted as the legacy form)", {});
  }
  for (const assetType of ASSET_TYPES) {
    const value = isRecord(windows) ? windows[assetType] : undefined;
    if (value !== undefined && !isWashSaleWindow(value)) {
      throw new ValidationError(
        "invalid_wash_sale_window",
        `wash_sale_window.${assetType} must be "2m", "1y" or "<n>d"`,
        { asset_type: assetType, value },
      );
    }
    const days = isRecord(legacy) ? legacy[assetType] : undefined;
    if (days !== undefined && !isPositiveInteger(days)) {
      throw new ValidationError(
        "invalid_wash_sale_window",
        `wash_sale_window_days.${assetType} must be a positive integer`,
        { asset_type: assetType, value: days },
      );
    }
  }
};

/** Validates a complete settings object (the payload of `settings_changed`). Unknown keys are kept. */
export const validateSettings = (raw: unknown): Settings => {
  if (!isRecord(raw)) {
    return fail("settings must be an object", { value: raw });
  }
  const rules = raw.fiscal_date_rule;
  if (!isRecord(rules)) {
    return fail("fiscal_date_rule is required", {});
  }
  // Partial map (ADR-0018): a missing asset type is fine and takes its default;
  // a present one must name a rule the engine knows.
  for (const assetType of ASSET_TYPES) {
    const rule = rules[assetType];
    if (rule !== undefined && !(FISCAL_DATE_RULES as readonly unknown[]).includes(rule)) {
      return fail(`fiscal_date_rule.${assetType} must be trade_date or value_date`, {
        asset_type: assetType,
        value: rule,
      });
    }
  }
  checkWashSaleWindow(raw);
  for (const field of DECIMAL_FIELDS) {
    if (!(field in raw)) {
      continue;
    }
    const value = raw[field];
    if (!isDecimalString(value)) {
      return fail(`${field} must be a decimal string`, { field, value });
    }
    const range = DECIMAL_RANGES[field];
    if (range === undefined) {
      continue;
    }
    const parsed = Decimal.parse(value);
    const belowMin = parsed.lt(Decimal.parse(range.min));
    const aboveMax = range.max !== undefined && parsed.gt(Decimal.parse(range.max));
    if (belowMin || aboveMax) {
      return fail(
        range.max === undefined
          ? `${field} must be ${range.min} or greater`
          : `${field} must be between ${range.min} and ${range.max}`,
        { field, value, min: range.min, max: range.max },
      );
    }
  }
  if ("bucket_benchmark_asset_id" in raw) {
    const value = raw.bucket_benchmark_asset_id;
    if (typeof value !== "string" || value.length === 0) {
      return fail("bucket_benchmark_asset_id must be a non-empty asset_id", { value });
    }
  }
  for (const field of INTEGER_FIELDS) {
    if (field in raw && !isPositiveInteger(raw[field])) {
      return fail(`${field} must be an integer greater than zero`, { field, value: raw[field] });
    }
  }
  if ("target_weights" in raw) {
    const weights = raw.target_weights;
    if (!isRecord(weights)) {
      return fail("target_weights must be an object", { value: weights });
    }
    let total = Decimal.ZERO;
    for (const [assetId, weight] of Object.entries(weights)) {
      if (!isDecimalString(weight)) {
        return fail(`target_weights.${assetId} must be a decimal string`, {
          asset_id: assetId,
          value: weight,
        });
      }
      const parsed = Decimal.parse(weight);
      if (parsed.isNegative()) {
        throw new ValidationError(
          "negative_target_weight",
          `target_weights.${assetId} must not be negative`,
          { asset_id: assetId, value: weight },
        );
      }
      total = total.add(parsed);
    }
    if (!total.eq(Decimal.parse("100"))) {
      return fail("target_weights must add up to 100", { total: total.toString() });
    }
  }
  return raw as unknown as Settings;
};

/**
 * The settings as a reader sees them: the legacy `wash_sale_window_days`
 * resolved into `"<n>d"` (ADR-0014) and every asset type present, filled with
 * its documented default (ADR-0018). Applied when **reading** (`settingsAt`),
 * never by rewriting the line: the ledger keeps the bytes it was written with
 * (data-schema.md §5), and the projected state keeps what the line says so the
 * snapshot does not move because of a tolerant read.
 */
export const normalizeSettings = (settings: Settings): Settings => {
  const legacy = settings.wash_sale_window_days;
  const windows = { ...settings.wash_sale_window } as Record<AssetType, WashSaleWindow>;
  const rules = { ...settings.fiscal_date_rule } as Record<AssetType, FiscalDateRule>;
  for (const assetType of ASSET_TYPES) {
    if (windows[assetType] === undefined) {
      const days = legacy?.[assetType];
      windows[assetType] = days === undefined ? DEFAULT_WASH_SALE_WINDOW[assetType] : `${days}d`;
    }
    if (rules[assetType] === undefined) {
      rules[assetType] = DEFAULT_FISCAL_DATE_RULE[assetType];
    }
  }
  return { ...settings, fiscal_date_rule: rules, wash_sale_window: windows };
};

/**
 * Applies a partial change on top of the current settings, merging the
 * per-asset-type maps. The legacy `wash_sale_window_days` never survives the
 * merge (ADR-0014): the caller resolved it into `wash_sale_window` when it read
 * the settings, and carrying it along would make every change written from now
 * on repeat the old form for ever.
 */
export const mergeSettings = (current: Settings, patch: Partial<Settings>): Settings => {
  const { wash_sale_window_days: _legacy, ...merged } = {
    ...current,
    ...patch,
    fiscal_date_rule: { ...current.fiscal_date_rule, ...patch.fiscal_date_rule },
    wash_sale_window: { ...current.wash_sale_window, ...patch.wash_sale_window },
  };
  return merged;
};
