import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_CONFIG, parseLocalConfig } from "../../src/config/local-config.js";
import { ValidationError } from "../../src/errors.js";

describe("the local configuration (atlas.config.json)", () => {
  it("fills every absent key with its documented default", () => {
    expect(parseLocalConfig("{}")).toEqual({
      ecb_stale_currency_days: 30,
      lock_stale_minutes: 10,
      token_expiry_warning_days: 14,
    });
    // Feature 015, E2: when the console warns that its token expires (plan §6.2 (e)).
    expect(parseLocalConfig('{"token_expiry_warning_days": 3}').token_expiry_warning_days).toBe(3);
    expect(parseLocalConfig('{"lock_stale_minutes": 3}')).toEqual({
      ...DEFAULT_LOCAL_CONFIG,
      lock_stale_minutes: 3,
    });
  });

  it("refuses what it does not understand instead of defaulting in silence", () => {
    for (const text of [
      "no",
      "[]",
      "null",
      "3",
      '{"otra": 1}',
      '{"lock_stale_minutes": 0}',
      '{"lock_stale_minutes": 1.5}',
      '{"ecb_stale_currency_days": "30"}',
    ]) {
      const error = (() => {
        try {
          parseLocalConfig(text);
          return undefined;
        } catch (caught) {
          return caught;
        }
      })();
      expect(error, text).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).code).toBe("invalid_local_config");
    }
  });
});
