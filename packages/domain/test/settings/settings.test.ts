import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { fiscalDateOf } from "../../src/settings/fiscal-date.js";
import {
  DEFAULT_SETTINGS,
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
    // The new form alone must cover every asset type; there is no legacy map to fall back on.
    expect(() =>
      validateSettings({ ...WITHOUT_WINDOW, wash_sale_window: { stock: "2m" } }),
    ).toThrow(ValidationError);
    expect(() => validateSettings({ ...WITHOUT_WINDOW, wash_sale_window_days: 365 })).toThrow(
      ValidationError,
    );
  });

  it("leaves settings without the legacy form untouched", () => {
    expect(normalizeSettings(DEFAULT_SETTINGS)).toBe(DEFAULT_SETTINGS);
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
