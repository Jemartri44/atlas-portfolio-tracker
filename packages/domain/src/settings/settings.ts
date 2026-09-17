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
 * The tax engine (phase 5) reads it; nothing here interprets it.
 */
export type WashSaleWindow = `${number}m` | `${number}y` | `${number}d`;

const WASH_SALE_WINDOW_PATTERN = /^(2m|1y|[1-9][0-9]*d)$/;

export const isWashSaleWindow = (value: unknown): value is WashSaleWindow =>
  typeof value === "string" && WASH_SALE_WINDOW_PATTERN.test(value);

export interface TaxBracket {
  up_to?: DecimalString;
  rate_pct: DecimalString;
}

export interface Settings {
  fiscal_date_rule: Record<AssetType, FiscalDateRule>;
  wash_sale_window: Record<AssetType, WashSaleWindow>;
  /** Legacy form, still accepted on load; `<n>` equals `"<n>d"` (ADR-0014). Never written by the CLI. */
  wash_sale_window_days?: Record<AssetType, number>;
  target_weights?: Record<string, DecimalString>;
  deviation_threshold_pp?: DecimalString;
  satellite_min_weight_pct?: DecimalString;
  monthly_contribution_eur?: DecimalString;
  bucket_pct_of_contribution?: DecimalString;
  bucket_max_cumulative_contribution?: DecimalString;
  bucket_stop_loss_pct?: DecimalString;
  bucket_max_weight_pct?: DecimalString;
  stale_price_days?: number;
  model_720_alert_threshold_eur?: DecimalString;
  model_721_alert_threshold_eur?: DecimalString;
  savings_tax_brackets?: TaxBracket[];
  tax_residence?: string;
  notification_email?: string;
  job_frequencies?: Record<string, string>;
  transfer_max_days?: number;
}

/** Provisional defaults (ADR-0013, ADR-0014). Verify with the tax advisor; change via `settings_changed`, not code. */
export const DEFAULT_SETTINGS: Settings = {
  fiscal_date_rule: {
    stock: "trade_date",
    etc: "trade_date",
    etp: "trade_date",
    crypto: "trade_date",
    fund: "value_date",
    money_market: "value_date",
  },
  wash_sale_window: {
    stock: "2m",
    etc: "2m",
    etp: "2m",
    crypto: "1y",
    fund: "1y",
    money_market: "1y",
  },
};

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
 * `wash_sale_window` wins, the legacy `wash_sale_window_days` is accepted and
 * means `"<n>d"`, and at least one of the two must cover every asset type.
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
    if (value !== undefined) {
      if (!isWashSaleWindow(value)) {
        throw new ValidationError(
          "invalid_wash_sale_window",
          `wash_sale_window.${assetType} must be "2m", "1y" or "<n>d"`,
          { asset_type: assetType, value },
        );
      }
      continue;
    }
    const days = isRecord(legacy) ? legacy[assetType] : undefined;
    if (!isPositiveInteger(days)) {
      throw new ValidationError(
        "invalid_wash_sale_window",
        `wash_sale_window.${assetType} is missing and wash_sale_window_days.${assetType} is not a positive integer`,
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
  for (const assetType of ASSET_TYPES) {
    const rule = rules[assetType];
    if (!(FISCAL_DATE_RULES as readonly unknown[]).includes(rule)) {
      return fail(`fiscal_date_rule.${assetType} must be trade_date or value_date`, {
        asset_type: assetType,
        value: rule,
      });
    }
  }
  checkWashSaleWindow(raw);
  for (const field of DECIMAL_FIELDS) {
    if (field in raw && !isDecimalString(raw[field])) {
      return fail(`${field} must be a decimal string`, { field, value: raw[field] });
    }
  }
  for (const field of INTEGER_FIELDS) {
    if (field in raw && !isNonNegativeInteger(raw[field])) {
      return fail(`${field} must be a non-negative integer`, { field, value: raw[field] });
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
 * Fills in `wash_sale_window` from the legacy `wash_sale_window_days` where it
 * is missing (ADR-0014). Applied when projecting, never by rewriting the line:
 * the ledger keeps the bytes it was written with (data-schema.md §5).
 */
export const normalizeSettings = (settings: Settings): Settings => {
  const legacy = settings.wash_sale_window_days;
  if (legacy === undefined) {
    return settings;
  }
  const windows = { ...settings.wash_sale_window } as Record<AssetType, WashSaleWindow>;
  for (const assetType of ASSET_TYPES) {
    if (windows[assetType] === undefined) {
      windows[assetType] = `${legacy[assetType] as number}d`;
    }
  }
  return { ...settings, wash_sale_window: windows };
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
