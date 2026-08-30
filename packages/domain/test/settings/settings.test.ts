import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { fiscalDateOf } from "../../src/settings/fiscal-date.js";
import { DEFAULT_SETTINGS, mergeSettings, validateSettings } from "../../src/settings/settings.js";

describe("DEFAULT_SETTINGS", () => {
  it("follows ADR-0013: listed securities by trade date, funds by value date", () => {
    expect(DEFAULT_SETTINGS.fiscal_date_rule.etc).toBe("trade_date");
    expect(DEFAULT_SETTINGS.fiscal_date_rule.fund).toBe("value_date");
    expect(DEFAULT_SETTINGS.wash_sale_window_days.stock).toBe(61);
    expect(DEFAULT_SETTINGS.wash_sale_window_days.fund).toBe(365);
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("validateSettings", () => {
  const withDefaults = (extra: Record<string, unknown>): Record<string, unknown> => ({
    ...DEFAULT_SETTINGS,
    ...extra,
  });

  it("rejects non-objects and missing per-type maps", () => {
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
    expect(() =>
      validateSettings({
        ...DEFAULT_SETTINGS,
        wash_sale_window_days: { ...DEFAULT_SETTINGS.wash_sale_window_days, fund: -1 },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateSettings({
        ...DEFAULT_SETTINGS,
        fiscal_date_rule: { stock: "trade_date" },
      }),
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

  it("requires target weights to add up to 100", () => {
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
  });

  it("keeps unknown keys so a newer settings object survives a round trip", () => {
    const settings = validateSettings(withDefaults({ future_flag: true }));
    expect((settings as unknown as Record<string, unknown>).future_flag).toBe(true);
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
    expect(merged.wash_sale_window_days).toEqual(DEFAULT_SETTINGS.wash_sale_window_days);
    expect(merged.stale_price_days).toBe(7);
    expect(mergeSettings(DEFAULT_SETTINGS, {})).toEqual(DEFAULT_SETTINGS);
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
});
