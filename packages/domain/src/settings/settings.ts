// Settings (business-rules.md §7). Only `fiscal_date_rule`, `wash_sale_window`
// and `income_category` have documented defaults (ADR-0013, ADR-0014, ADR-0021,
// to be verified with the tax advisor); every other parameter is optional until
// the user sets it.

import { ASSET_TYPES, type AssetType } from "../schema/events.js";
import {
  DEFAULT_FISCAL_DATE_RULE,
  DEFAULT_INCOME_CATEGORY,
  DEFAULT_SAVINGS_OFFSET_LIMIT_PCT,
  DEFAULT_WASH_SALE_TRANSFER_COUNTS,
  DEFAULT_WASH_SALE_WINDOW,
  type FiscalDateRule,
  type IncomeCategory,
  lossCarryforwardYearsOf,
  modelAlertThresholdOf,
  modelIncreaseOf,
  modelThresholdOf,
  rentaSeasonOf,
  type Settings,
  type WashSaleWindow,
} from "./defaults.js";

export * from "./defaults.js";
export { validateSettings } from "./validation.js";

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
  const categories = { ...settings.income_category } as Record<AssetType, IncomeCategory>;
  for (const assetType of ASSET_TYPES) {
    if (windows[assetType] === undefined) {
      const days = legacy?.[assetType];
      windows[assetType] = days === undefined ? DEFAULT_WASH_SALE_WINDOW[assetType] : `${days}d`;
    }
    if (rules[assetType] === undefined) {
      rules[assetType] = DEFAULT_FISCAL_DATE_RULE[assetType];
    }
    if (categories[assetType] === undefined) {
      categories[assetType] = DEFAULT_INCOME_CATEGORY[assetType];
    }
  }
  // The scalar criteria are materialised too, so that the next
  // `settings_changed` written from what was read records them (ADR-0022): a
  // tax year recomputed in 2040 must not depend on what the code said then.
  return {
    ...settings,
    fiscal_date_rule: rules,
    wash_sale_window: windows,
    income_category: categories,
    wash_sale_transfer_counts:
      settings.wash_sale_transfer_counts ?? DEFAULT_WASH_SALE_TRANSFER_COUNTS,
    savings_offset_limit_pct: settings.savings_offset_limit_pct ?? DEFAULT_SAVINGS_OFFSET_LIMIT_PCT,
    loss_carryforward_years: lossCarryforwardYearsOf(settings),
    model_720_threshold_eur: modelThresholdOf(settings, "720").toString(),
    model_720_increase_eur: modelIncreaseOf(settings, "720").toString(),
    model_720_alert_threshold_eur: modelAlertThresholdOf(settings, "720").toString(),
    model_721_threshold_eur: modelThresholdOf(settings, "721").toString(),
    model_721_increase_eur: modelIncreaseOf(settings, "721").toString(),
    model_721_alert_threshold_eur: modelAlertThresholdOf(settings, "721").toString(),
    renta_season_start: rentaSeasonOf(settings).start,
    renta_season_end: rentaSeasonOf(settings).end,
  };
};

/**
 * Applies a partial change on top of the current settings.
 *
 * A per-asset-type map the patch carries **replaces** the one in force; it is
 * not merged into it. That is what makes *removing* a type expressible, and
 * removing is a documented operation: ADR-0018 made these maps partial, and an
 * absent type takes the default of ADR-0013 and ADR-0014.
 *
 * It used to merge, and the consequence was not cosmetic. The configuration
 * screen would take a type out of the draft, the field would show empty, the
 * save would report success — and the key came straight back in from `current`,
 * so the **fiscal rule in force never changed** while the user had read
 * "guardado". The fiscal date, the tax year, the date of the exchange rate and
 * the wash-sale window all kept using the old rule.
 *
 * Both callers already hand over the whole map (`atlas settings set` composes
 * `{...current, ...assignments}` itself), so replacing is what they both meant.
 * It is also what `target_weights` has always done, for the same reason: a set
 * of values only means something as a set.
 *
 * The legacy `wash_sale_window_days` never survives (ADR-0014): the caller
 * resolved it into `wash_sale_window` when it read the settings, and carrying it
 * along would make every change written from now on repeat the old form for
 * ever.
 *
 * `notification_email` never survives either: the recipient of the mail lives
 * outside the ledger, in SSM (ADR-0028, ADR-0034), and a setting no figure
 * reads is not a setting (constitution IV, 1.6.0). The loader still reads it in
 * the lines already written — the ledger is append-only and the validator never
 * hardens (ADR-0018) — but every snapshot written from now on, by the web or
 * the console, goes without it.
 *
 * `income_category` needs no line of its own: it is optional, so the spread
 * already replaces it when the patch carries one and keeps the current one when
 * it does not. Its two siblings are declared because they are not optional and
 * the compiler cannot see that the spread has covered them.
 */
export const mergeSettings = (current: Settings, patch: Partial<Settings>): Settings => {
  const {
    wash_sale_window_days: _legacy,
    notification_email: _retired,
    ...merged
  } = {
    ...current,
    ...patch,
    fiscal_date_rule: patch.fiscal_date_rule ?? current.fiscal_date_rule,
    wash_sale_window: patch.wash_sale_window ?? current.wash_sale_window,
  };
  return merged;
};
