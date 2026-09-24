import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import type { PriceLookup } from "../../src/projections/prices.js";
import { DEFAULT_PRICE_CONFIG } from "../../src/quotes/config.js";
import { effectiveCloses } from "../../src/quotes/line.js";
import { EMPTY_STATUS, reserveCall, withAssetFailures } from "../../src/quotes/status.js";
import { approximationWarning, priceStatusView } from "../../src/quotes/view.js";

describe("what `atlas prices status` shows", () => {
  it("each source with what it spent today, and the age of each asset", () => {
    const now = new Date("2027-01-06T08:00:00.000Z");
    let status = reserveCall(EMPTY_STATUS, "eodhd", 20, now) ?? EMPTY_STATUS;
    status = {
      ...status,
      sources: {
        ...status.sources,
        alpha_vantage: {
          consecutive_failures: 3,
          calls_at: [],
          last_failure: { kind: "blocked", at: "t" },
          last_success: "s",
        },
      },
    };
    status = withAssetFailures(
      status,
      new Map([["ast_b", { kind: "not_found", source: "eodhd", at: "t" }]]),
    );
    const closes = new Map([
      [
        "ast_a",
        effectiveCloses([
          {
            schema_version: 1,
            date: "2027-01-04",
            close: "1",
            currency: "EUR",
            source: "eodhd",
            fetched_at: "2027-01-05T00:00:00Z",
          },
        ]),
      ],
    ]);
    const view = priceStatusView(
      status,
      DEFAULT_PRICE_CONFIG,
      closes,
      ["ast_a", "ast_b"],
      "2027-01-06",
      now,
    );
    expect(view.sources).toEqual([
      {
        source: "eodhd",
        spent_today: 1,
        daily_calls: 20,
        remaining: 19,
        consecutive_failures: 0,
        failing: false,
      },
      {
        source: "alpha_vantage",
        spent_today: 0,
        daily_calls: 25,
        remaining: 25,
        consecutive_failures: 3,
        failing: true,
        last_success: "s",
        last_failure: { kind: "blocked", at: "t" },
      },
    ]);
    expect(view.assets).toEqual([
      { asset_id: "ast_a", last_date: "2027-01-04", source: "eodhd", age_days: 2 },
      { asset_id: "ast_b", last_failure: { kind: "not_found", source: "eodhd", at: "t" } },
    ]);
  });
  it("a source never used, at zero", () => {
    const view = priceStatusView(
      EMPTY_STATUS,
      DEFAULT_PRICE_CONFIG,
      new Map(),
      [],
      "2027-01-06",
      new Date(),
    );
    expect(view.sources[0]).toEqual({
      source: "eodhd",
      spent_today: 0,
      daily_calls: 20,
      remaining: 20,
      consecutive_failures: 0,
      failing: false,
    });
  });
});

describe("a weight that rests on an approximation (P3)", () => {
  const price = (asset_id: string, approximate?: boolean) =>
    ({
      asset_id,
      origin: "external",
      date: "2027-01-05",
      unit_value: Decimal.ONE,
      currency: "EUR",
      age_days: 0,
      stale: false,
      ...(approximate === undefined ? {} : { approximate }),
    }) as PriceLookup;

  it("is said, with the assets, and nothing is said when none is", () => {
    expect(approximationWarning([price("a"), price("b", true), undefined])).toMatchObject({
      code: "weights_use_approximation",
      details: { assets: ["b"] },
    });
    expect(approximationWarning([price("a")])).toBeUndefined();
  });
});
