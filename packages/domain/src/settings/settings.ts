// Settings (business-rules.md §7). Only `fiscal_date_rule`, `wash_sale_window`
// and `income_category` have documented defaults (ADR-0013, ADR-0014, ADR-0021,
// to be verified with the tax advisor); every other parameter is optional until
// the user sets it.

import { ValidationError } from "../errors.js";
import { isRecord, type UnknownRecord } from "../guards.js";
import { Decimal, type DecimalString, isDecimalString } from "../money/decimal.js";
import { ASSET_TYPES, type AssetType } from "../schema/events.js";

export const FISCAL_DATE_RULES = ["trade_date", "value_date"] as const;
export type FiscalDateRule = (typeof FISCAL_DATE_RULES)[number];

/**
 * What kind of income an asset type produces: a capital gain of article 33
 * LIRPF, or income from movable capital of article 25.2. They offset each other
 * differently —a loss against movable capital income is capped at 25% of its
 * positive balance (art. 49)— so it decides which box a disposal ends up in.
 *
 * It exists because an ETC is legally a debt note and not a collective
 * investment undertaking, so there is a case for its disposal being movable
 * capital income. That case is **unresolved** (`docs/fiscal-questions.md`), and
 * this feature does not resolve it: **nothing reads this setting yet**. The tax
 * engine of phase 5 will, and then answering the question will be a
 * `settings_changed` and not a migration (ADR-0021).
 */
export const INCOME_CATEGORIES = ["capital_gain", "movable_capital"] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

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
  /**
   * Partial as well, and **optional as a whole**: every `settings_changed`
   * written before ADR-0021 lacks it, and demanding it would make the loader
   * reject them — the hardening ADR-0018 forbids. Absent means the documented
   * default for every type. Read through `incomeCategoryOf`, never off the map.
   */
  income_category?: Partial<Record<AssetType, IncomeCategory>>;
  /** Legacy form, still accepted on load; `<n>` equals `"<n>d"` (ADR-0014). Never written by the CLI. */
  wash_sale_window_days?: Partial<Record<AssetType, number>>;
  /**
   * Whether a `transfer` **in** counts as an acquisition for the wash-sale rule
   * (business-rules.md §5.4, data-schema.md §8.4, fiscal question #2b). Absent
   * means `true`, the prudent reading: it acquires homogeneous securities even
   * though nothing is taxed at the origin, so it defers the loss. Read through
   * `washSaleTransferCounts`, never off the field.
   */
  wash_sale_transfer_counts?: boolean;
  /**
   * Share, in percent, of the positive balance of one category of the savings
   * base (capital gains, movable capital income) that a negative balance of the
   * other can offset (art. 49 LIRPF; fiscal criteria #10 and #22). It has been
   * 10, 15, 20 and 25 in four consecutive years, so it is configuration and not
   * a constant (constitution IV, feature 009 Q3). Absent means
   * `DEFAULT_SAVINGS_OFFSET_LIMIT_PCT`; read through `savingsOffsetLimitPctOf`.
   */
  savings_offset_limit_pct?: DecimalString;
  /**
   * Tax years a negative balance of the savings base can be carried forward
   * (art. 49 LIRPF). Absent means `DEFAULT_LOSS_CARRYFORWARD_YEARS`; read
   * through `lossCarryforwardYearsOf`.
   */
  loss_carryforward_years?: number;
  /**
   * The withholding rate, in percent, that the double taxation treaty with each
   * country allows at source, keyed by ISO 3166-1 alpha-2 of the payer (fiscal
   * criterion #16, feature 009 Q4). **No default on purpose**: each rate is a
   * figure of a treaty, to be verified one by one. A dividend from a country
   * missing here gets no deduction calculated, and the tax report says so;
   * deducting everything withheld abroad would be the aggressive reading.
   */
  treaty_withholding_pct?: Record<string, DecimalString>;
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

/** Same, for the income category: what the system does today, for every type (ADR-0021). */
export const DEFAULT_INCOME_CATEGORY: Record<AssetType, IncomeCategory> = {
  stock: "capital_gain",
  etf: "capital_gain",
  etc: "capital_gain",
  etp: "capital_gain",
  crypto: "capital_gain",
  fund: "capital_gain",
  money_market: "capital_gain",
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
  income_category: DEFAULT_INCOME_CATEGORY,
};

/** A `transfer` in counts as an acquisition for the wash-sale rule: the prudent reading (#2b). */
export const DEFAULT_WASH_SALE_TRANSFER_COUNTS = true;

/** Art. 49 LIRPF as understood in September 2026: 25 % since 2018. Verify; change with a `settings_changed`. */
export const DEFAULT_SAVINGS_OFFSET_LIMIT_PCT: DecimalString = "25";

/** Art. 49 LIRPF as understood in September 2026: four years. Verify; change with a `settings_changed`. */
export const DEFAULT_LOSS_CARRYFORWARD_YEARS = 4;

/** The offset limit in force (#10, #22): what the settings say, or its documented default. */
export const savingsOffsetLimitPctOf = (settings: Settings): Decimal =>
  Decimal.parse(settings.savings_offset_limit_pct ?? DEFAULT_SAVINGS_OFFSET_LIMIT_PCT);

/** The carry-forward period in force: what the settings say, or its documented default. */
export const lossCarryforwardYearsOf = (settings: Settings): number =>
  settings.loss_carryforward_years ?? DEFAULT_LOSS_CARRYFORWARD_YEARS;

/** The treaty rate for a country, or nothing when the settings do not know it (#16). */
export const treatyWithholdingPctOf = (
  settings: Settings,
  country: string | undefined,
): Decimal | undefined => {
  const rate = country === undefined ? undefined : settings.treaty_withholding_pct?.[country];
  return rate === undefined ? undefined : Decimal.parse(rate);
};

/** The rule in force for an asset type: what the settings say, or its default (ADR-0018). */
export const fiscalDateRuleOf = (settings: Settings, assetType: AssetType): FiscalDateRule =>
  settings.fiscal_date_rule[assetType] ?? DEFAULT_FISCAL_DATE_RULE[assetType];

/**
 * The income category in force for an asset type (ADR-0021). Resolved here and
 * not read off the map, so that an absent type —or an absent map, which is what
 * every line written before this feature has— takes the documented default and
 * never a category arrived at by elimination.
 *
 * Nothing in the system calls this yet. It is the door the tax engine opens.
 */
export const incomeCategoryOf = (settings: Settings, assetType: AssetType): IncomeCategory =>
  settings.income_category?.[assetType] ?? DEFAULT_INCOME_CATEGORY[assetType];

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
  "savings_offset_limit_pct",
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
  savings_offset_limit_pct: { min: "0", max: "100" },
};

/** Whole days, and zero days means nothing: a price is stale after a positive number of days. */
const INTEGER_FIELDS = [
  "stale_price_days",
  "transfer_max_days",
  "loss_carryforward_years",
] as const;

/** Criteria that are on or off. Absent is not `false`: each one has its own documented default. */
const BOOLEAN_FIELDS = ["wash_sale_transfer_counts"] as const;

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
    fail("wash_sale_window must be an object", { field: "wash_sale_window", value: windows });
  }
  if (legacy !== undefined && !isRecord(legacy)) {
    fail("wash_sale_window_days must be an object", {
      field: "wash_sale_window_days",
      value: legacy,
    });
  }
  if (windows === undefined && legacy === undefined) {
    fail("wash_sale_window is required (wash_sale_window_days is accepted as the legacy form)", {
      field: "wash_sale_window",
    });
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

/**
 * Checks the income category (ADR-0021). The map as a whole is **optional** —
 * every line written before this feature lacks it— and partial, like its two
 * siblings (ADR-0018). What is present must still name a category the engine
 * knows: the tolerance is to absence, not to nonsense.
 *
 * A wrong value has a code of its own, like the other two per-asset-type maps
 * (feature 009, Q13). It used to share `invalid_settings`, on the argument that
 * an enumeration of two values is what the generic message covers; but since
 * the tax engine reads it, this is the setting that moves a disposal from one
 * box of the return to another, and the message has to be able to say so.
 * A map that is not an object stays `invalid_settings`, as for the window.
 */
const checkIncomeCategory = (raw: UnknownRecord): void => {
  const categories = raw.income_category;
  if (categories !== undefined && !isRecord(categories)) {
    fail("income_category must be an object", { field: "income_category", value: categories });
  }
  for (const assetType of ASSET_TYPES) {
    const value = isRecord(categories) ? categories[assetType] : undefined;
    if (value !== undefined && !(INCOME_CATEGORIES as readonly unknown[]).includes(value)) {
      throw new ValidationError(
        "invalid_income_category",
        `income_category.${assetType} must be ${INCOME_CATEGORIES.join(" or ")}`,
        { asset_type: assetType, value },
      );
    }
  }
};

const COUNTRY_PATTERN = /^[A-Z]{2}$/;

/**
 * The treaty rates (#16): an object keyed by ISO 3166-1 alpha-2, each a
 * percentage in [0, 100]. The same two-capital-letter rule as `source_country`
 * and `issuer_country`: a real ISO list is another feature.
 */
const checkTreatyRates = (raw: UnknownRecord): void => {
  if (!("treaty_withholding_pct" in raw)) {
    return;
  }
  const rates = raw.treaty_withholding_pct;
  const invalid = (message: string, details: Record<string, unknown>): ValidationError =>
    new ValidationError("invalid_settings", message, details);
  if (!isRecord(rates)) {
    throw invalid("treaty_withholding_pct must be an object", {
      field: "treaty_withholding_pct",
      value: rates,
    });
  }
  for (const [country, rate] of Object.entries(rates)) {
    const field = `treaty_withholding_pct.${country}`;
    if (!COUNTRY_PATTERN.test(country)) {
      throw invalid(`${field}: the key must be an ISO 3166-1 alpha-2 code`, {
        field,
        value: country,
      });
    }
    if (!isDecimalString(rate)) {
      throw invalid(`${field} must be a decimal string`, { field, value: rate });
    }
    const parsed = Decimal.parse(rate);
    if (parsed.isNegative() || parsed.gt(Decimal.parse("100"))) {
      throw invalid(`${field} must be between 0 and 100`, {
        field,
        value: rate,
        min: "0",
        max: "100",
      });
    }
  }
};

/** Validates a complete settings object (the payload of `settings_changed`). Unknown keys are kept. */
export const validateSettings = (raw: unknown): Settings => {
  if (!isRecord(raw)) {
    return fail("settings must be an object", { field: "settings", value: raw });
  }
  const rules = raw.fiscal_date_rule;
  if (!isRecord(rules)) {
    return fail("fiscal_date_rule is required", { field: "fiscal_date_rule" });
  }
  // Partial map (ADR-0018): a missing asset type is fine and takes its default;
  // a present one must name a rule the engine knows. Its own code, like its
  // two siblings (feature 009, Q13): a missing map is still `invalid_settings`.
  for (const assetType of ASSET_TYPES) {
    const rule = rules[assetType];
    if (rule !== undefined && !(FISCAL_DATE_RULES as readonly unknown[]).includes(rule)) {
      throw new ValidationError(
        "invalid_fiscal_date_rule",
        `fiscal_date_rule.${assetType} must be trade_date or value_date`,
        { asset_type: assetType, value: rule },
      );
    }
  }
  checkWashSaleWindow(raw);
  checkIncomeCategory(raw);
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
      return fail("bucket_benchmark_asset_id must be a non-empty asset_id", {
        field: "bucket_benchmark_asset_id",
        value,
      });
    }
  }
  for (const field of INTEGER_FIELDS) {
    if (field in raw && !isPositiveInteger(raw[field])) {
      return fail(`${field} must be an integer greater than zero`, { field, value: raw[field] });
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    if (field in raw && typeof raw[field] !== "boolean") {
      return fail(`${field} must be true or false`, { field, value: raw[field] });
    }
  }
  checkTreatyRates(raw);
  if ("target_weights" in raw) {
    const weights = raw.target_weights;
    if (!isRecord(weights)) {
      return fail("target_weights must be an object", { field: "target_weights", value: weights });
    }
    let total = Decimal.ZERO;
    for (const [assetId, weight] of Object.entries(weights)) {
      if (!isDecimalString(weight)) {
        return fail(`target_weights.${assetId} must be a decimal string`, {
          field: `target_weights.${assetId}`,
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
      return fail("target_weights must add up to 100", {
        field: "target_weights",
        total: total.toString(),
      });
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
 * `income_category` needs no line of its own: it is optional, so the spread
 * already replaces it when the patch carries one and keeps the current one when
 * it does not. Its two siblings are declared because they are not optional and
 * the compiler cannot see that the spread has covered them.
 */
export const mergeSettings = (current: Settings, patch: Partial<Settings>): Settings => {
  const { wash_sale_window_days: _legacy, ...merged } = {
    ...current,
    ...patch,
    fiscal_date_rule: patch.fiscal_date_rule ?? current.fiscal_date_rule,
    wash_sale_window: patch.wash_sale_window ?? current.wash_sale_window,
  };
  return merged;
};
