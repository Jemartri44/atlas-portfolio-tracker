import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { fiscalDateOf } from "../../src/settings/fiscal-date.js";
import {
  DEFAULT_FISCAL_DATE_RULE,
  DEFAULT_SETTINGS,
  DEFAULT_WASH_SALE_WINDOW,
  fiscalDateRuleOf,
  mergeSettings,
  normalizeSettings,
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
    expect(DEFAULT_SETTINGS.wash_sale_window.fund).toBe("1y");
    expect(DEFAULT_SETTINGS.wash_sale_window_days).toBeUndefined();
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
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
    ).toThrow(ValidationError);
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
    expect(normalizeSettings(normalized)).toEqual(normalized);
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
