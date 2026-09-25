import { describe, expect, it } from "vitest";
import { DEFAULT_PRICE_CONFIG, parsePriceConfig } from "../../src/quotes/config.js";

describe("prices/config.json", () => {
  it("without a file, is the documented defaults", () => {
    expect(parsePriceConfig(undefined)).toEqual({
      source_order: ["eodhd", "alpha_vantage"],
      daily_calls: { eodhd: 20, alpha_vantage: 25 },
      failure_threshold: 3,
    });
    expect(parsePriceConfig("{}")).toEqual(DEFAULT_PRICE_CONFIG);
  });

  it("reads every key, each optional", () => {
    expect(
      parsePriceConfig(
        '{"source_order":["alpha_vantage","eodhd"],"daily_calls":{"eodhd":0},"failure_threshold":5}',
      ),
    ).toEqual({
      source_order: ["alpha_vantage", "eodhd"],
      daily_calls: { eodhd: 0, alpha_vantage: 25 },
      failure_threshold: 5,
    });
  });

  it("refuses an unknown key or a wrong value, naming the key, never a silent default", () => {
    const cases: [string, string][] = [
      ["nope", "json"],
      ["[]", "json"],
      ['{"eodhd_key":"x"}', "eodhd_key"],
      ['{"source_order":[]}', "source_order"],
      ['{"source_order":"eodhd"}', "source_order"],
      ['{"source_order":["eodhd","eodhd"]}', "source_order"],
      ['{"source_order":["coingecko"]}', "source_order"],
      ['{"daily_calls":[]}', "daily_calls"],
      ['{"daily_calls":null}', "daily_calls"],
      ['{"daily_calls":{"coingecko":1}}', "daily_calls.coingecko"],
      ['{"daily_calls":{"eodhd":-1}}', "daily_calls.eodhd"],
      ['{"daily_calls":{"eodhd":1.5}}', "daily_calls.eodhd"],
      ['{"failure_threshold":0}', "failure_threshold"],
    ];
    for (const [text, field] of cases) {
      expect(() => parsePriceConfig(text), text).toThrow(
        expect.objectContaining({ code: "invalid_price_config", details: { field } }),
      );
    }
  });
});
