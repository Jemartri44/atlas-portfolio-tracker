// Settings (business-rules.md §7). Only `fiscal_date_rule` and
// `wash_sale_window_days` have documented defaults (ADR-0013, to be verified
// with the tax advisor); every other parameter is optional until the user sets it.

import { ValidationError } from "../errors.js";
import { isRecord } from "../guards.js";
import { Decimal, type DecimalString, isDecimalString } from "../money/decimal.js";
import { ASSET_TYPES, type AssetType } from "../schema/events.js";

export const FISCAL_DATE_RULES = ["trade_date", "value_date"] as const;
export type FiscalDateRule = (typeof FISCAL_DATE_RULES)[number];

export interface TaxBracket {
  up_to?: DecimalString;
  rate_pct: DecimalString;
}

export interface Settings {
  fiscal_date_rule: Record<AssetType, FiscalDateRule>;
  wash_sale_window_days: Record<AssetType, number>;
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

/** Provisional defaults (ADR-0013). Verify with the tax advisor; change via `settings_changed`, not code. */
export const DEFAULT_SETTINGS: Settings = {
  fiscal_date_rule: {
    stock: "trade_date",
    etc: "trade_date",
    etp: "trade_date",
    crypto: "trade_date",
    fund: "value_date",
    money_market: "value_date",
  },
  wash_sale_window_days: {
    stock: 61,
    etc: 61,
    etp: 61,
    crypto: 365,
    fund: 365,
    money_market: 365,
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

/** Validates a complete settings object (the payload of `settings_changed`). Unknown keys are kept. */
export const validateSettings = (raw: unknown): Settings => {
  if (!isRecord(raw)) {
    return fail("settings must be an object", { value: raw });
  }
  const rules = raw.fiscal_date_rule;
  const windows = raw.wash_sale_window_days;
  if (!isRecord(rules) || !isRecord(windows)) {
    return fail("fiscal_date_rule and wash_sale_window_days are required", {});
  }
  for (const assetType of ASSET_TYPES) {
    const rule = rules[assetType];
    if (!(FISCAL_DATE_RULES as readonly unknown[]).includes(rule)) {
      return fail(`fiscal_date_rule.${assetType} must be trade_date or value_date`, {
        asset_type: assetType,
        value: rule,
      });
    }
    if (!isNonNegativeInteger(windows[assetType])) {
      return fail(`wash_sale_window_days.${assetType} must be a non-negative integer`, {
        asset_type: assetType,
        value: windows[assetType],
      });
    }
  }
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
      total = total.add(Decimal.parse(weight));
    }
    if (!total.eq(Decimal.parse("100"))) {
      return fail("target_weights must add up to 100", { total: total.toString() });
    }
  }
  return raw as unknown as Settings;
};

/** Applies a partial change on top of the current settings, merging the per-asset-type maps. */
export const mergeSettings = (current: Settings, patch: Partial<Settings>): Settings => ({
  ...current,
  ...patch,
  fiscal_date_rule: { ...current.fiscal_date_rule, ...patch.fiscal_date_rule },
  wash_sale_window_days: { ...current.wash_sale_window_days, ...patch.wash_sale_window_days },
});
