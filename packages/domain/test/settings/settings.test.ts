import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { fiscalDateOf } from "../../src/settings/fiscal-date.js";
import {
  DEFAULT_FISCAL_DATE_RULE,
  DEFAULT_INCOME_CATEGORY,
  DEFAULT_LOSS_CARRYFORWARD_YEARS,
  DEFAULT_SAVINGS_OFFSET_LIMIT_PCT,
  DEFAULT_SETTINGS,
  DEFAULT_WASH_SALE_WINDOW,
  fiscalDateRuleOf,
  INFORMATIVE_MODELS,
  incomeCategoryOf,
  lossCarryforwardYearsOf,
  mergeSettings,
  modelAlertThresholdOf,
  modelIncreaseOf,
  modelThresholdOf,
  normalizeSettings,
  rentaSeasonOf,
  type Settings,
  savingsOffsetLimitPctOf,
  treatyWithholdingPctOf,
  validateSettings,
} from "../../src/settings/settings.js";

/** The legacy shape a ledger written before ADR-0014 carries (days per asset type). */
const LEGACY_DAYS = { stock: 61, etc: 61, etp: 61, crypto: 365, fund: 365, money_market: 365 };
const { wash_sale_window: _window, ...WITHOUT_WINDOW } = DEFAULT_SETTINGS;
const LEGACY_SETTINGS = { ...WITHOUT_WINDOW, wash_sale_window_days: LEGACY_DAYS };

describe("DEFAULT_SETTINGS", () => {
  it("follows ADR-0013: listed securities by trade date, funds by value date", () => {
    expect(DEFAULT_SETTINGS.fiscal_date_rule.etc).toBe("trade_date");
    expect(DEFAULT_SETTINGS.fiscal_date_rule.fund).toBe("value_date");
    expect(DEFAULT_SETTINGS.wash_sale_window.stock).toBe("2m");
    // Two months for a fund since the correction of criterion #2 (2026-09-22):
    // a fund that publishes its net asset value daily is a security admitted to
    // trading. A monetary fund stays on a year, which is a noted inconsistency.
    expect(DEFAULT_SETTINGS.wash_sale_window.fund).toBe("2m");
    expect(DEFAULT_SETTINGS.wash_sale_window.money_market).toBe("1y");
    expect(DEFAULT_SETTINGS.wash_sale_window.crypto).toBe("1y");
    expect(DEFAULT_SETTINGS.wash_sale_window_days).toBeUndefined();
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  /**
   * ADR-0021 left the income category as configuration so that criterion #24
   * could be answered with a value instead of a migration, and feature 010
   * answered it: an ETC and an ETP are movable capital income (binding ruling
   * V0267-25), everything else is a capital gain.
   */
  it("makes an ETC and an ETP movable capital income, and everything else a capital gain (#24)", () => {
    expect(DEFAULT_INCOME_CATEGORY.etc).toBe("movable_capital");
    expect(DEFAULT_INCOME_CATEGORY.etp).toBe("movable_capital");
    expect(
      Object.entries(DEFAULT_INCOME_CATEGORY)
        .filter(([type]) => type !== "etc" && type !== "etp")
        .map(([, category]) => category),
    ).toEqual(Array(5).fill("capital_gain"));
    expect(DEFAULT_SETTINGS.income_category).toEqual(DEFAULT_INCOME_CATEGORY);
  });
});

describe("incomeCategoryOf", () => {
  it("resolves the default at the point of use, map absent or type absent", () => {
    const { income_category: _all, ...without } = DEFAULT_SETTINGS;
    // A ledger written before ADR-0021 carries no map at all.
    expect(incomeCategoryOf(without as Settings, "etc")).toBe("movable_capital");
    expect(incomeCategoryOf(without as Settings, "stock")).toBe("capital_gain");
    // A map that mentions other types only.
    const partial = { ...DEFAULT_SETTINGS, income_category: { fund: "movable_capital" as const } };
    expect(incomeCategoryOf(partial, "etc")).toBe("movable_capital");
    expect(incomeCategoryOf(partial, "stock")).toBe("capital_gain");
    expect(incomeCategoryOf(partial, "fund")).toBe("movable_capital");
    // And what the ledger says wins over the default, in both directions.
    const pinned = { ...DEFAULT_SETTINGS, income_category: { etc: "capital_gain" as const } };
    expect(incomeCategoryOf(pinned, "etc")).toBe("capital_gain");
  });
});

describe("validateSettings", () => {
  const withDefaults = (extra: Record<string, unknown>): Record<string, unknown> => ({
    ...DEFAULT_SETTINGS,
    ...extra,
  });

  it("rejects non-objects and a per-type map that is missing altogether", () => {
    expect(() => validateSettings("x")).toThrow(ValidationError);
    expect(() => validateSettings({ fiscal_date_rule: DEFAULT_SETTINGS.fiscal_date_rule })).toThrow(
      ValidationError,
    );
    expect(() =>
      validateSettings({
        ...DEFAULT_SETTINGS,
        fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, fund: "settlement" },
      }),
    ).toThrow(ValidationError);
  });

  /**
   * ADR-0018: the maps are partial. Adding `etf` to the enum must not turn every
   * `settings_changed` already written into an invalid line, so a type the map
   * does not mention is valid and takes its documented default.
   */
  it("accepts partial per-type maps and resolves the missing types to their default", () => {
    const partial = validateSettings({
      ...DEFAULT_SETTINGS,
      fiscal_date_rule: { stock: "trade_date" },
      wash_sale_window: { stock: "2m" },
    });
    expect(partial.fiscal_date_rule.fund).toBeUndefined();
    expect(fiscalDateRuleOf(partial, "fund")).toBe("value_date");
    expect(fiscalDateRuleOf(partial, "etf")).toBe("trade_date");
    const normalized = normalizeSettings(partial);
    expect(normalized.fiscal_date_rule).toEqual(DEFAULT_FISCAL_DATE_RULE);
    expect(normalized.wash_sale_window).toEqual(DEFAULT_WASH_SALE_WINDOW);
    // Empty maps are the extreme case of the same rule.
    expect(() =>
      validateSettings({ ...DEFAULT_SETTINGS, fiscal_date_rule: {}, wash_sale_window: {} }),
    ).not.toThrow();
  });

  it("keeps rejecting a value that is present and wrong: the tolerance is to absence", () => {
    expect(() =>
      validateSettings({ ...DEFAULT_SETTINGS, fiscal_date_rule: { etf: "settlement" } }),
    ).toThrow(expect.objectContaining({ code: "invalid_fiscal_date_rule" }));
    try {
      validateSettings({ ...DEFAULT_SETTINGS, fiscal_date_rule: { etf: "settlement" } });
    } catch (error) {
      expect((error as ValidationError).details).toEqual({
        asset_type: "etf",
        value: "settlement",
      });
    }
    expect(() =>
      validateSettings({ ...DEFAULT_SETTINGS, wash_sale_window: { etf: "3m" } }),
    ).toThrow(ValidationError);
  });

  it("checks decimal and integer parameters when present", () => {
    expect(
      validateSettings(withDefaults({ deviation_threshold_pp: "5" })).deviation_threshold_pp,
    ).toBe("5");
    expect(() => validateSettings(withDefaults({ deviation_threshold_pp: 5 }))).toThrow(
      ValidationError,
    );
    expect(validateSettings(withDefaults({ stale_price_days: 5 })).stale_price_days).toBe(5);
    expect(() => validateSettings(withDefaults({ stale_price_days: "5" }))).toThrow(
      ValidationError,
    );
  });

  it("keeps every percentage inside [0, 100], at the limits and outside them", () => {
    const codeOf = (extra: Record<string, unknown>): string => {
      try {
        validateSettings(withDefaults(extra));
      } catch (error) {
        return (error as ValidationError).code;
      }
      return "accepted";
    };
    for (const field of [
      "bucket_pct_of_contribution",
      "satellite_min_weight_pct",
      "bucket_stop_loss_pct",
      "bucket_max_weight_pct",
    ]) {
      expect(codeOf({ [field]: "0" })).toBe("accepted");
      expect(codeOf({ [field]: "100" })).toBe("accepted");
      expect(codeOf({ [field]: "-0.01" })).toBe("invalid_settings");
      expect(codeOf({ [field]: "100.01" })).toBe("invalid_settings");
    }
    // Bounded below only: a threshold or an amount has no ceiling.
    for (const field of [
      "deviation_threshold_pp",
      "monthly_contribution_eur",
      "bucket_max_cumulative_contribution",
    ]) {
      expect(codeOf({ [field]: "0" })).toBe("accepted");
      expect(codeOf({ [field]: "1000000" })).toBe("accepted");
      expect(codeOf({ [field]: "-0.01" })).toBe("invalid_settings");
    }
    // Free of range, as they were: only the shape is checked.
    expect(codeOf({ model_720_alert_threshold_eur: "50000" })).toBe("accepted");
    expect(codeOf({ model_721_alert_threshold_eur: "50000" })).toBe("accepted");
  });

  it("requires the day counts to be whole and greater than zero", () => {
    for (const field of ["stale_price_days", "transfer_max_days"]) {
      expect(validateSettings(withDefaults({ [field]: 1 }))).toBeDefined();
      expect(() => validateSettings(withDefaults({ [field]: 0 }))).toThrow(ValidationError);
      expect(() => validateSettings(withDefaults({ [field]: -1 }))).toThrow(ValidationError);
      expect(() => validateSettings(withDefaults({ [field]: 1.5 }))).toThrow(ValidationError);
    }
  });

  it("requires wash_sale_transfer_counts to be true or false, and accepts its absence", () => {
    // Absent is not false: it means the documented default (`true`), resolved
    // by `washSaleTransferCounts` and never by reading the field.
    expect(validateSettings(DEFAULT_SETTINGS).wash_sale_transfer_counts).toBeUndefined();
    expect(validateSettings(withDefaults({ wash_sale_transfer_counts: false }))).toMatchObject({
      wash_sale_transfer_counts: false,
    });
    expect(validateSettings(withDefaults({ wash_sale_transfer_counts: true }))).toMatchObject({
      wash_sale_transfer_counts: true,
    });
    expect(() => validateSettings(withDefaults({ wash_sale_transfer_counts: "false" }))).toThrow(
      ValidationError,
    );
  });

  it("requires target weights to be non-negative and add up to 100", () => {
    expect(
      validateSettings(withDefaults({ target_weights: { a: "60", b: "25.5", c: "14.5" } }))
        .target_weights,
    ).toEqual({ a: "60", b: "25.5", c: "14.5" });
    expect(() => validateSettings(withDefaults({ target_weights: { a: "60", b: "30" } }))).toThrow(
      ValidationError,
    );
    expect(() => validateSettings(withDefaults({ target_weights: { a: 100 } }))).toThrow(
      ValidationError,
    );
    expect(() => validateSettings(withDefaults({ target_weights: ["100"] }))).toThrow(
      ValidationError,
    );
    expect(() =>
      validateSettings(withDefaults({ target_weights: { a: "-50", b: "150" } })),
    ).toThrow(ValidationError);
  });

  it("keeps unknown keys so a newer settings object survives a round trip", () => {
    const settings = validateSettings(withDefaults({ future_flag: true }));
    expect((settings as unknown as Record<string, unknown>).future_flag).toBe(true);
  });
});

describe("wash_sale_window (ADR-0014)", () => {
  it("accepts the new form and rejects anything that is not 2m, 1y or <n>d", () => {
    const settings = validateSettings({
      ...DEFAULT_SETTINGS,
      wash_sale_window: { ...DEFAULT_SETTINGS.wash_sale_window, stock: "45d" },
    });
    expect(settings.wash_sale_window.stock).toBe("45d");
    for (const bad of ["3m", "2y", "0d", "61", "2 m", "", 61, null]) {
      expect(() =>
        validateSettings({
          ...DEFAULT_SETTINGS,
          wash_sale_window: { ...DEFAULT_SETTINGS.wash_sale_window, stock: bad },
        }),
      ).toThrow(ValidationError);
    }
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, wash_sale_window: "2m" })).toThrow(
      ValidationError,
    );
  });

  it("accepts the legacy form and normalizes it to <n>d", () => {
    const settings = validateSettings(LEGACY_SETTINGS);
    expect(settings.wash_sale_window_days).toEqual(LEGACY_DAYS);
    const normalized = normalizeSettings(settings);
    expect(normalized.wash_sale_window.stock).toBe("61d");
    expect(normalized.wash_sale_window.fund).toBe("365d");
    expect(normalizeSettings(normalized)).toEqual(normalized);
  });

  it("lets the new form win when both are present, per asset type", () => {
    const mixed = validateSettings({
      ...WITHOUT_WINDOW,
      wash_sale_window: { stock: "2m" },
      wash_sale_window_days: LEGACY_DAYS,
    });
    const normalized = normalizeSettings(mixed);
    expect(normalized.wash_sale_window.stock).toBe("2m");
    expect(normalized.wash_sale_window.fund).toBe("365d");
  });

  it("rejects a legacy value that is not a positive integer, and both forms missing", () => {
    expect(() =>
      validateSettings({ ...WITHOUT_WINDOW, wash_sale_window_days: { ...LEGACY_DAYS, fund: -1 } }),
    ).toThrow(ValidationError);
    expect(() =>
      validateSettings({ ...WITHOUT_WINDOW, wash_sale_window_days: { ...LEGACY_DAYS, fund: 0 } }),
    ).toThrow(ValidationError);
    expect(() => validateSettings(WITHOUT_WINDOW)).toThrow(ValidationError);
    // A partial new form is valid on its own (ADR-0018): what it does not say
    // takes the default, not the legacy map.
    expect(() =>
      validateSettings({ ...WITHOUT_WINDOW, wash_sale_window: { stock: "2m" } }),
    ).not.toThrow();
    expect(() => validateSettings({ ...WITHOUT_WINDOW, wash_sale_window_days: 365 })).toThrow(
      ValidationError,
    );
  });

  it("returns complete maps even without the legacy form, and is idempotent", () => {
    const normalized = normalizeSettings(DEFAULT_SETTINGS);
    expect(normalized.fiscal_date_rule).toEqual(DEFAULT_FISCAL_DATE_RULE);
    expect(normalized.wash_sale_window).toEqual(DEFAULT_WASH_SALE_WINDOW);
    expect(normalized.income_category).toEqual(DEFAULT_INCOME_CATEGORY);
    expect(normalizeSettings(normalized)).toEqual(normalized);
  });

  /**
   * The map is optional as a whole, unlike its two siblings: every
   * `settings_changed` written before ADR-0021 lacks it, and rejecting those
   * would be the retroactive hardening ADR-0018 forbids. Reading fills it
   * (ADR-0022), writing materialises it, and the stored line is untouched.
   */
  it("accepts settings without the income category and completes it on read", () => {
    const { income_category: _absent, ...without } = DEFAULT_SETTINGS;
    expect(() => validateSettings(without)).not.toThrow();
    expect(normalizeSettings(validateSettings(without)).income_category).toEqual(
      DEFAULT_INCOME_CATEGORY,
    );
    const partial = validateSettings({ ...without, income_category: { etc: "movable_capital" } });
    const normalized = normalizeSettings(partial);
    expect(normalized.income_category?.etc).toBe("movable_capital");
    expect(normalized.income_category?.fund).toBe("capital_gain");
  });

  it("rejects an income category that is not one of the two, and a map that is not an object", () => {
    expect(() =>
      validateSettings({ ...DEFAULT_SETTINGS, income_category: { etc: "rendimiento" } }),
    ).toThrow(expect.objectContaining({ code: "invalid_income_category" }));
    try {
      validateSettings({ ...DEFAULT_SETTINGS, income_category: { etc: "rendimiento" } });
    } catch (error) {
      expect((error as ValidationError).details).toEqual({
        asset_type: "etc",
        value: "rendimiento",
      });
    }
    expect(() =>
      validateSettings({ ...DEFAULT_SETTINGS, income_category: "capital_gain" }),
    ).toThrow(expect.objectContaining({ code: "invalid_settings" }));
    expect(() =>
      validateSettings({ ...DEFAULT_SETTINGS, income_category: { not_a_type: "nonsense" } }),
    ).not.toThrow();
  });
});

describe("mergeSettings", () => {
  it("merges per-type maps instead of replacing them", () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, etc: "value_date" },
      stale_price_days: 7,
    });
    expect(merged.fiscal_date_rule.etc).toBe("value_date");
    expect(merged.fiscal_date_rule.fund).toBe("value_date");
    expect(merged.wash_sale_window).toEqual(DEFAULT_SETTINGS.wash_sale_window);
    expect(merged.stale_price_days).toBe(7);
    expect(mergeSettings(DEFAULT_SETTINGS, {})).toEqual(DEFAULT_SETTINGS);
  });

  it("never carries the legacy window along: what it returns only has the new form", () => {
    // A ledger written before ADR-0014 reads back with both forms (that is what
    // `settingsAt` hands over); every change written from here on must carry
    // only `wash_sale_window`, or the old form lives for ever.
    const current = normalizeSettings(validateSettings(LEGACY_SETTINGS));
    expect(current.wash_sale_window_days).toEqual(LEGACY_DAYS);
    const merged = mergeSettings(current, { stale_price_days: 7 });
    expect("wash_sale_window_days" in merged).toBe(false);
    expect(merged.wash_sale_window).toEqual({
      stock: "61d",
      // `etf` had no legacy value to inherit, so it keeps its documented default.
      etf: "2m",
      etc: "61d",
      etp: "61d",
      crypto: "365d",
      fund: "365d",
      money_market: "365d",
    });
    // Not even when the patch itself carries it.
    expect(
      "wash_sale_window_days" in
        mergeSettings(DEFAULT_SETTINGS, { wash_sale_window_days: LEGACY_DAYS }),
    ).toBe(false);
  });
});

describe("bucket_benchmark_asset_id (business rule 16)", () => {
  it("accepts an asset_id and rejects an empty or non-string one", () => {
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, bucket_benchmark_asset_id: "ast_world" }),
    ).toMatchObject({ bucket_benchmark_asset_id: "ast_world" });
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, bucket_benchmark_asset_id: "" })).toThrow(
      ValidationError,
    );
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, bucket_benchmark_asset_id: 7 })).toThrow(
      ValidationError,
    );
    // It is optional: a ledger without a benchmark is perfectly valid.
    expect(() => validateSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe("fiscalDateOf", () => {
  const dates = { trade_date: "2026-12-30", value_date: "2027-01-02" };

  it("picks the date by asset type and follows a changed rule", () => {
    expect(fiscalDateOf(dates, "etc", DEFAULT_SETTINGS)).toBe("2026-12-30");
    expect(fiscalDateOf(dates, "fund", DEFAULT_SETTINGS)).toBe("2027-01-02");
    const flipped = mergeSettings(DEFAULT_SETTINGS, {
      fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, etc: "value_date" },
    });
    expect(fiscalDateOf(dates, "etc", flipped)).toBe("2027-01-02");
  });

  /**
   * The trap ADR-0018 closes: a type the map does not mention must take its
   * documented default, not fall into `value_date` because `undefined` is not
   * `"trade_date"`. An ETF taxed by value date would be a wrong tax year found
   * out years later.
   */
  it("uses the documented default for an asset type the settings do not mention", () => {
    const partial = { ...DEFAULT_SETTINGS, fiscal_date_rule: { fund: "value_date" as const } };
    expect(fiscalDateOf(dates, "etf", partial)).toBe("2026-12-30");
    expect(fiscalDateOf(dates, "stock", partial)).toBe("2026-12-30");
    expect(fiscalDateOf(dates, "fund", partial)).toBe("2027-01-02");
  });
});

/**
 * Removing an asset type from a per-type map, which ADR-0018 made a documented
 * operation when it made the maps partial.
 *
 * It used to be impossible: `mergeSettings` merged the map into the one in
 * force, so a key taken out of the patch came straight back. The screen showed
 * the field empty, reported "guardado", and the **fiscal rule in force never
 * changed** — the fiscal date, the tax year, the date of the exchange rate and
 * the wash-sale window all kept using the old rule while the user believed
 * otherwise.
 */
describe("mergeSettings: a per-asset-type map replaces, it does not merge", () => {
  const current: Settings = {
    ...DEFAULT_SETTINGS,
    fiscal_date_rule: { fund: "value_date", stock: "trade_date" },
    wash_sale_window: { fund: "1y", stock: "2m" },
  };

  it("removes a type the patch leaves out", () => {
    const next = mergeSettings(current, { fiscal_date_rule: { stock: "trade_date" } });

    expect(next.fiscal_date_rule).toEqual({ stock: "trade_date" });
    expect(next.fiscal_date_rule.fund).toBeUndefined();
  });

  it("does the same for the wash-sale window", () => {
    const next = mergeSettings(current, { wash_sale_window: { stock: "2m" } });

    expect(next.wash_sale_window).toEqual({ stock: "2m" });
  });

  it("empties a map entirely when the patch says so", () => {
    const next = mergeSettings(current, { fiscal_date_rule: {} });

    expect(next.fiscal_date_rule).toEqual({});
  });

  it("leaves the map alone when the patch does not mention it", () => {
    const next = mergeSettings(current, { monthly_contribution_eur: "700" });

    expect(next.fiscal_date_rule).toEqual(current.fiscal_date_rule);
    expect(next.wash_sale_window).toEqual(current.wash_sale_window);
    expect(next.monthly_contribution_eur).toBe("700");
  });

  /**
   * An absent type takes the documented default, which is the whole point of
   * removing it. Both types are set to the **opposite** of their default here,
   * so "it went back to the default" cannot be confused with "nothing changed".
   */
  it("hands the removed type back to its documented default", () => {
    const flipped: Settings = {
      ...DEFAULT_SETTINGS,
      fiscal_date_rule: { fund: "trade_date", stock: "value_date" },
    };

    const next = mergeSettings(flipped, { fiscal_date_rule: { stock: "value_date" } });

    expect(fiscalDateRuleOf(next, "fund")).toBe(DEFAULT_FISCAL_DATE_RULE.fund);
    expect(fiscalDateRuleOf(next, "fund")).not.toBe("trade_date");
    // And the type that stayed keeps the value that was chosen for it.
    expect(fiscalDateRuleOf(next, "stock")).toBe("value_date");
  });
});

/**
 * Feature 009, Q3 and Q4: the 25 % and the four years of article 49, and the
 * treaty rates of the double taxation deduction, are configuration. The first
 * two have documented defaults resolved where they are read; the rates have no
 * default at all, on purpose.
 */
describe("the tax engine settings", () => {
  it("resolve the offset limit and the carry-forward period to their defaults", () => {
    expect(savingsOffsetLimitPctOf(DEFAULT_SETTINGS).toString()).toBe(
      DEFAULT_SAVINGS_OFFSET_LIMIT_PCT,
    );
    expect(DEFAULT_SAVINGS_OFFSET_LIMIT_PCT).toBe("25");
    expect(lossCarryforwardYearsOf(DEFAULT_SETTINGS)).toBe(DEFAULT_LOSS_CARRYFORWARD_YEARS);
    expect(DEFAULT_LOSS_CARRYFORWARD_YEARS).toBe(4);
    const custom = {
      ...DEFAULT_SETTINGS,
      savings_offset_limit_pct: "20",
      loss_carryforward_years: 5,
    };
    expect(savingsOffsetLimitPctOf(custom).toString()).toBe("20");
    expect(lossCarryforwardYearsOf(custom)).toBe(5);
  });

  it("know a treaty rate only when it is written down", () => {
    const withUs = { ...DEFAULT_SETTINGS, treaty_withholding_pct: { US: "15" } };
    expect(treatyWithholdingPctOf(withUs, "US")?.toString()).toBe("15");
    expect(treatyWithholdingPctOf(withUs, "CH")).toBeUndefined();
    expect(treatyWithholdingPctOf(withUs, undefined)).toBeUndefined();
    expect(treatyWithholdingPctOf(DEFAULT_SETTINGS, "US")).toBeUndefined();
  });

  it("validate the offset limit as a percentage and the period as whole years", () => {
    const code = (extra: Record<string, unknown>): string => {
      try {
        validateSettings({ ...DEFAULT_SETTINGS, ...extra });
      } catch (error) {
        return (error as ValidationError).code;
      }
      return "accepted";
    };
    expect(code({ savings_offset_limit_pct: "25" })).toBe("accepted");
    expect(code({ savings_offset_limit_pct: "100.01" })).toBe("invalid_settings");
    expect(code({ savings_offset_limit_pct: 25 })).toBe("invalid_settings");
    expect(code({ loss_carryforward_years: 4 })).toBe("accepted");
    expect(code({ loss_carryforward_years: 0 })).toBe("invalid_settings");
    expect(code({ loss_carryforward_years: "4" })).toBe("invalid_settings");
  });

  it("validate the treaty rates by key and by value", () => {
    const code = (rates: unknown): string => {
      try {
        validateSettings({ ...DEFAULT_SETTINGS, treaty_withholding_pct: rates });
      } catch (error) {
        return (error as ValidationError).code;
      }
      return "accepted";
    };
    expect(code({ US: "15", CH: "15", DE: "0" })).toBe("accepted");
    expect(code({ US: "100" })).toBe("accepted");
    expect(code("15")).toBe("invalid_settings");
    expect(code({ usa: "15" })).toBe("invalid_settings");
    expect(code({ US: 15 })).toBe("invalid_settings");
    expect(code({ US: "-1" })).toBe("invalid_settings");
    expect(code({ US: "100.5" })).toBe("invalid_settings");
  });

  it("are materialised when the settings are read, so the next change records them (ADR-0022)", () => {
    const normalized = normalizeSettings(DEFAULT_SETTINGS);
    expect(normalized.savings_offset_limit_pct).toBe("25");
    expect(normalized.loss_carryforward_years).toBe(4);
    expect(normalized.wash_sale_transfer_counts).toBe(true);
    expect(normalized.treaty_withholding_pct).toBeUndefined();
    const explicit = normalizeSettings({
      ...DEFAULT_SETTINGS,
      wash_sale_transfer_counts: false,
      savings_offset_limit_pct: "20",
      loss_carryforward_years: 5,
    });
    expect(explicit.wash_sale_transfer_counts).toBe(false);
    expect(explicit.savings_offset_limit_pct).toBe("20");
    expect(explicit.loss_carryforward_years).toBe(5);
  });
});

describe("the figures of the informative returns and the tax season (feature 010)", () => {
  const code = (settings: unknown): string => {
    try {
      validateSettings(settings);
    } catch (error) {
      return (error as ValidationError).code;
    }
    return "accepted";
  };

  it("have the documented default of September 2026, per model", () => {
    for (const model of INFORMATIVE_MODELS) {
      expect(modelThresholdOf(DEFAULT_SETTINGS, model).toString()).toBe("50000");
      expect(modelIncreaseOf(DEFAULT_SETTINGS, model).toString()).toBe("20000");
      expect(modelAlertThresholdOf(DEFAULT_SETTINGS, model).toString()).toBe("45000");
    }
    expect(rentaSeasonOf(DEFAULT_SETTINGS)).toEqual({ start: "04-01", end: "06-30" });
  });

  it("are read off the settings when they are there, model by model", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      model_720_threshold_eur: "60000",
      model_720_increase_eur: "25000",
      model_720_alert_threshold_eur: "55000",
      model_721_threshold_eur: "40000",
      model_721_increase_eur: "15000",
      model_721_alert_threshold_eur: "35000",
      renta_season_start: "04-11",
      renta_season_end: "07-01",
    };
    expect(modelThresholdOf(settings, "720").toString()).toBe("60000");
    expect(modelIncreaseOf(settings, "720").toString()).toBe("25000");
    expect(modelAlertThresholdOf(settings, "720").toString()).toBe("55000");
    expect(modelThresholdOf(settings, "721").toString()).toBe("40000");
    expect(modelIncreaseOf(settings, "721").toString()).toBe("15000");
    expect(modelAlertThresholdOf(settings, "721").toString()).toBe("35000");
    expect(rentaSeasonOf(settings)).toEqual({ start: "04-11", end: "07-01" });
    expect(code(settings)).toBe("accepted");
  });

  it("refuse a negative amount and anything that is not a decimal string", () => {
    expect(code({ ...DEFAULT_SETTINGS, model_720_threshold_eur: "-1" })).toBe("invalid_settings");
    expect(code({ ...DEFAULT_SETTINGS, model_721_increase_eur: "-0.01" })).toBe("invalid_settings");
    expect(code({ ...DEFAULT_SETTINGS, model_720_increase_eur: 20000 })).toBe("invalid_settings");
    // Zero is a number, not a missing value; the warning has to come down with it.
    expect(
      code({
        ...DEFAULT_SETTINGS,
        model_721_threshold_eur: "0",
        model_721_alert_threshold_eur: "0",
      }),
    ).toBe("accepted");
  });

  it("refuse a warning above its own threshold: it would never fire", () => {
    expect(code({ ...DEFAULT_SETTINGS, model_720_alert_threshold_eur: "50000.01" })).toBe(
      "alert_above_threshold",
    );
    // Exactly at the threshold is fine: the warning fires and the category obliges the cent after.
    expect(code({ ...DEFAULT_SETTINGS, model_720_alert_threshold_eur: "50000" })).toBe("accepted");
    expect(code({ ...DEFAULT_SETTINGS, model_721_alert_threshold_eur: "50000.01" })).toBe(
      "alert_above_threshold",
    );
    // Against the figures **in force**: lowering the threshold alone leaves the
    // default warning of 45.000 above it.
    expect(code({ ...DEFAULT_SETTINGS, model_720_threshold_eur: "40000" })).toBe(
      "alert_above_threshold",
    );
    expect(
      code({
        ...DEFAULT_SETTINGS,
        model_720_threshold_eur: "40000",
        model_720_alert_threshold_eur: "39000",
      }),
    ).toBe("accepted");
    try {
      validateSettings({ ...DEFAULT_SETTINGS, model_721_alert_threshold_eur: "60000" });
      expect.unreachable();
    } catch (error) {
      expect((error as ValidationError).details).toEqual({
        model: "721",
        alert: "60000",
        threshold: "50000",
      });
    }
  });

  it("refuse a season that is not two days of the year, or that ends before it starts", () => {
    expect(code({ ...DEFAULT_SETTINGS, renta_season_start: "2026-04-01" })).toBe(
      "invalid_renta_season",
    );
    expect(code({ ...DEFAULT_SETTINGS, renta_season_end: "06-31" })).toBe("invalid_renta_season");
    expect(code({ ...DEFAULT_SETTINGS, renta_season_end: "13-01" })).toBe("invalid_renta_season");
    expect(code({ ...DEFAULT_SETTINGS, renta_season_start: "07-01" })).toBe("invalid_renta_season");
    // 29 February exists: the check reads the day against a leap year.
    expect(code({ ...DEFAULT_SETTINGS, renta_season_start: "02-29" })).toBe("accepted");
    // A season of one single day is a season.
    expect(
      code({ ...DEFAULT_SETTINGS, renta_season_start: "06-30", renta_season_end: "06-30" }),
    ).toBe("accepted");
  });

  it("are materialised when the settings are read (ADR-0022)", () => {
    const normalized = normalizeSettings(DEFAULT_SETTINGS);
    expect(normalized.model_720_threshold_eur).toBe("50000");
    expect(normalized.model_720_increase_eur).toBe("20000");
    expect(normalized.model_720_alert_threshold_eur).toBe("45000");
    expect(normalized.model_721_threshold_eur).toBe("50000");
    expect(normalized.model_721_increase_eur).toBe("20000");
    expect(normalized.model_721_alert_threshold_eur).toBe("45000");
    expect(normalized.renta_season_start).toBe("04-01");
    expect(normalized.renta_season_end).toBe("06-30");
    const explicit = normalizeSettings({
      ...DEFAULT_SETTINGS,
      model_720_threshold_eur: "60000",
      renta_season_end: "07-01",
    });
    expect(explicit.model_720_threshold_eur).toBe("60000");
    expect(explicit.renta_season_end).toBe("07-01");
  });
});
