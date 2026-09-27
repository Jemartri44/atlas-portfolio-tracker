import { describe, expect, it } from "vitest";
import { DEFAULT_PRICE_CONFIG, parsePriceConfig } from "../../src/quotes/config.js";

describe("prices/config.json", () => {
  it("without a file, is the documented defaults", () => {
    expect(parsePriceConfig(undefined)).toEqual({
      source_order: ["eodhd", "alpha_vantage"],
      daily_calls: { eodhd: 20, alpha_vantage: 25 },
      failure_threshold: 3,
      // Crypto trades every day and its last closes may be provisional (live
      // test of 2026-09-27): configuration by asset type, never a constant.
      market_days: {
        fund: "mon_fri",
        etf: "mon_fri",
        etc: "mon_fri",
        etp: "mon_fri",
        stock: "mon_fri",
        crypto: "every_day",
        money_market: "mon_fri",
      },
      refetch_recent_days: {
        fund: 0,
        etf: 0,
        etc: 0,
        etp: 0,
        stock: 0,
        crypto: 2,
        money_market: 0,
      },
    });
    expect(parsePriceConfig("{}")).toEqual(DEFAULT_PRICE_CONFIG);
  });

  it("reads every key, each optional", () => {
    expect(
      parsePriceConfig(
        '{"source_order":["alpha_vantage","eodhd"],"daily_calls":{"eodhd":0},"failure_threshold":5}',
      ),
    ).toEqual({
      ...DEFAULT_PRICE_CONFIG,
      source_order: ["alpha_vantage", "eodhd"],
      daily_calls: { eodhd: 0, alpha_vantage: 25 },
      failure_threshold: 5,
    });
  });

  it("reads the market days and the recent days asked again by asset type, over the defaults", () => {
    const config = parsePriceConfig(
      '{"market_days":{"etf":"every_day","crypto":"mon_fri"},"refetch_recent_days":{"crypto":0,"stock":3}}',
    );
    expect(config.market_days).toEqual({
      ...DEFAULT_PRICE_CONFIG.market_days,
      etf: "every_day",
      crypto: "mon_fri",
    });
    expect(config.refetch_recent_days).toEqual({
      ...DEFAULT_PRICE_CONFIG.refetch_recent_days,
      crypto: 0,
      stock: 3,
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
      ['{"market_days":[]}', "market_days"],
      ['{"market_days":null}', "market_days"],
      ['{"market_days":{"bond":"mon_fri"}}', "market_days.bond"],
      ['{"market_days":{"crypto":"weekends"}}', "market_days.crypto"],
      ['{"refetch_recent_days":"2"}', "refetch_recent_days"],
      ['{"refetch_recent_days":{"coin":2}}', "refetch_recent_days.coin"],
      ['{"refetch_recent_days":{"crypto":-1}}', "refetch_recent_days.crypto"],
      ['{"refetch_recent_days":{"crypto":1.5}}', "refetch_recent_days.crypto"],
    ];
    for (const [text, field] of cases) {
      expect(() => parsePriceConfig(text), text).toThrow(
        expect.objectContaining({ code: "invalid_price_config", details: { field } }),
      );
    }
  });
});
