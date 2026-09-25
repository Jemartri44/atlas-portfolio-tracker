import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { Quantity } from "../../src/money/quantity.js";
import {
  type ExternalPrices,
  manualPrices,
  type PriceLookup,
  positionValueOf,
  priceAt,
  warnWithoutEur,
} from "../../src/projections/prices.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { Warning } from "../../src/projections/state.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const withPrices = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
  b.buy({ account_id: "acc_etf", asset_id: "ast_gold", quantity: "4", currency: "USD" });
  return b;
};

const project = (b: LedgerBuilder) => projectLedger(b.build());
const stale = (days: number) => mergeSettings(DEFAULT_SETTINGS, { stale_price_days: days });

describe("manualPrices", () => {
  it("takes the latest valuation on or before the date, from any account", () => {
    const b = withPrices();
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-06-30",
      unit_value: "100",
    });
    b.valuation({
      account_id: "acc_etf",
      asset_id: "ast_world",
      date: "2027-12-31",
      unit_value: "120",
    });
    const prices = manualPrices(project(b), "2027-12-31", DEFAULT_SETTINGS);
    expect(prices.get("ast_world")?.unit_value.toString()).toBe("120");
    expect(prices.get("ast_world")?.date).toBe("2027-12-31");
    expect(prices.get("ast_world")?.age_days).toBe(0);
  });

  it("never uses a price from the future", () => {
    const b = withPrices();
    b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date: "2027-12-31" });
    const prices = manualPrices(project(b), "2027-06-30", DEFAULT_SETTINGS);
    expect(prices.has("ast_world")).toBe(false);
  });

  it("breaks a tie on the same date by file position", () => {
    const b = withPrices();
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-12-31",
      unit_value: "100",
    });
    b.valuation({
      account_id: "acc_etf",
      asset_id: "ast_world",
      date: "2027-12-31",
      unit_value: "111",
    });
    expect(
      manualPrices(project(b), "2027-12-31", DEFAULT_SETTINGS)
        .get("ast_world")
        ?.unit_value.toString(),
    ).toBe("111");
  });

  it("converts to euros with the published rate, to 10 decimals", () => {
    const b = withPrices();
    b.valuation({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      date: "2027-12-31",
      unit_value: "210",
      currency: "USD",
      fx_rate: "1.09",
    });
    const price = manualPrices(project(b), "2027-12-31", DEFAULT_SETTINGS).get("ast_gold");
    expect(price?.currency).toBe("USD");
    expect(price?.fx_rate?.toString()).toBe("1.09");
    expect(price?.unit_value_eur?.amount.toString()).toBe("192.6605504587");
  });

  it("measures the age and marks the price stale only when the parameter is set", () => {
    const b = withPrices();
    b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date: "2027-12-24" });
    const state = project(b);
    expect(manualPrices(state, "2027-12-31", DEFAULT_SETTINGS).get("ast_world")).toMatchObject({
      age_days: 7,
      stale: false,
    });
    expect(manualPrices(state, "2027-12-31", stale(5)).get("ast_world")?.stale).toBe(true);
    // Exactly at the limit is not stale: the rule is "older than".
    expect(manualPrices(state, "2027-12-31", stale(7)).get("ast_world")?.stale).toBe(false);
  });

  it("leaves an asset without any valuation out of the map instead of pricing it at zero", () => {
    const state = project(withPrices());
    expect(manualPrices(state, "2027-12-31", DEFAULT_SETTINGS).size).toBe(0);
  });
});

/**
 * The single gate (prompt §3.0 ter). Phase 4 will pass `external`; today nobody
 * does, and the precedence is written here so it cannot drift: the manual price
 * is a decision of the user, the automatic one a convenience (constitution I).
 */
describe("priceAt: the single gate", () => {
  const quotes: ExternalPrices = {
    at: (assetId, date) =>
      assetId === "ast_world" || assetId === "ast_gold"
        ? {
            date,
            unit_value: Decimal.parse("999"),
            currency: "EUR",
            fx_rate: Decimal.ONE,
            source: "eodhd",
          }
        : undefined,
  };

  it("returns the manual price with its origin and the valuation it comes from", () => {
    const b = withPrices();
    const valuation = b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-12-31",
      unit_value: "100",
    });
    const price = priceAt(project(b), "ast_world", "2027-12-31", DEFAULT_SETTINGS);
    expect(price?.origin).toBe("manual");
    expect(price?.event_id).toBe(valuation.id);
    expect(price?.unit_value.toString()).toBe("100");
  });

  it("prefers the manual price over a quote of the same date (P2)", () => {
    const b = withPrices();
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-12-31",
      unit_value: "100",
    });
    const state = project(b);
    expect(priceAt(state, "ast_world", "2027-12-31", DEFAULT_SETTINGS, quotes)).toMatchObject({
      origin: "manual",
      unit_value: Decimal.parse("100"),
    });
    expect(
      manualPrices(state, "2027-12-31", DEFAULT_SETTINGS, quotes).get("ast_world"),
    ).toMatchObject({ origin: "manual" });
  });

  /**
   * P2 (ADR-0031, second amendment; it replaces decision (j) of prompt 005 for
   * showing a value only): the more recent date wins, and an old valuation no
   * longer hides every close after it. The Modelo 720 does not come through
   * here (`informative/valuation.test.ts` and the fiscal-output test hold it).
   */
  it("lets a more recent quote win over an older valuation, and not the other way round", () => {
    const b = withPrices();
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-12-24",
      unit_value: "100",
    });
    const state = project(b);
    const newer: ExternalPrices = {
      at: (_assetId, date) => ({
        date,
        unit_value: Decimal.parse("120"),
        currency: "EUR",
        fx_rate: Decimal.ONE,
        source: "alpha_vantage",
      }),
    };
    expect(priceAt(state, "ast_world", "2027-12-31", DEFAULT_SETTINGS, newer)).toMatchObject({
      origin: "external",
      source: "alpha_vantage",
      unit_value: Decimal.parse("120"),
    });
    expect(
      manualPrices(state, "2027-12-31", DEFAULT_SETTINGS, newer).get("ast_world"),
    ).toMatchObject({ origin: "external", source: "alpha_vantage" });
    const older: ExternalPrices = {
      at: () => ({
        date: "2027-12-20",
        unit_value: Decimal.parse("90"),
        currency: "EUR",
        fx_rate: Decimal.ONE,
        source: "eodhd",
      }),
    };
    expect(priceAt(state, "ast_world", "2027-12-31", DEFAULT_SETTINGS, older)?.origin).toBe(
      "manual",
    );
    expect(
      manualPrices(state, "2027-12-31", DEFAULT_SETTINGS, older).get("ast_world")?.origin,
    ).toBe("manual");
  });

  /**
   * Review of PR #78: among the prices with a value in euros. A newer quote
   * without one never covers a valuation that has it; it travels as
   * information. And a quote that brings its own usable fallback keeps it.
   */
  it("never lets a newer quote without euros cover a price that has them", () => {
    const b = withPrices();
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-12-24",
      unit_value: "100",
    });
    const state = project(b);
    const pence: ExternalPrices = {
      at: (_assetId, date) => ({
        date,
        unit_value: Decimal.parse("5000"),
        currency: "ZZZ",
        source: "eodhd",
        fx_missing: "currency_not_published",
      }),
    };
    for (const price of [
      priceAt(state, "ast_world", "2027-12-31", DEFAULT_SETTINGS, pence),
      manualPrices(state, "2027-12-31", DEFAULT_SETTINGS, pence).get("ast_world"),
    ]) {
      expect(price).toMatchObject({ origin: "manual", date: "2027-12-24" });
      expect(price?.unit_value_eur?.amount.toString()).toBe("100");
      expect(price?.newer_quote).toMatchObject({ currency: "ZZZ", date: "2027-12-31" });
    }
    // An older quote without euros is simply not the price.
    const old: ExternalPrices = {
      at: () => ({ date: "2027-12-01", unit_value: Decimal.ONE, currency: "ZZZ", source: "eodhd" }),
    };
    expect(
      priceAt(state, "ast_world", "2027-12-31", DEFAULT_SETTINGS, old)?.newer_quote,
    ).toBeUndefined();
    // The quote of the source with its own fallback: the usable one, and the newer beside it.
    const fallback: ExternalPrices = {
      at: (_assetId, date) => ({
        date: "2027-12-30",
        unit_value: Decimal.parse("7"),
        currency: "EUR",
        fx_rate: Decimal.ONE,
        source: "eodhd",
        newer: {
          date,
          unit_value: Decimal.parse("8"),
          currency: "USD",
          source: "eodhd",
          fx_missing: "not_yet_published",
        },
      }),
    };
    expect(priceAt(state, "ast_world", "2027-12-31", DEFAULT_SETTINGS, fallback)).toMatchObject({
      origin: "external",
      date: "2027-12-30",
      newer_quote: { currency: "USD" },
    });
  });

  it("carries the newest quote even when the one with euros is older than the valuation", () => {
    // The case of the reviewer: a valuation on 2027-01-04, the last close that
    // converts on 2026-12-31 and a close without a rate on 2027-01-06.
    const b = withPrices();
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-01-04",
      unit_value: "100",
    });
    const state = project(b);
    const external: ExternalPrices = {
      at: () => ({
        date: "2026-12-31",
        unit_value: Decimal.parse("95"),
        currency: "EUR",
        fx_rate: Decimal.ONE,
        source: "eodhd",
        newer: {
          date: "2027-01-06",
          unit_value: Decimal.parse("7"),
          currency: "USD",
          source: "eodhd",
          fx_missing: "not_yet_published",
        },
      }),
    };
    for (const price of [
      priceAt(state, "ast_world", "2027-01-06", DEFAULT_SETTINGS, external),
      manualPrices(state, "2027-01-06", DEFAULT_SETTINGS, external).get("ast_world"),
    ]) {
      expect(price).toMatchObject({ origin: "manual", date: "2027-01-04" });
      expect(price?.newer_quote).toMatchObject({ date: "2027-01-06", currency: "USD" });
    }
  });

  it("carries the approximation mark of a quote", () => {
    const approximate: ExternalPrices = {
      at: (_assetId, date) => ({
        date,
        unit_value: Decimal.parse("10"),
        currency: "EUR",
        fx_rate: Decimal.ONE,
        source: "eodhd",
        approximate: true,
      }),
    };
    const price = priceAt(
      project(withPrices()),
      "ast_world",
      "2027-12-31",
      DEFAULT_SETTINGS,
      approximate,
    );
    expect(price?.approximate).toBe(true);
    expect(
      priceAt(project(withPrices()), "ast_world", "2027-12-31", DEFAULT_SETTINGS, quotes)
        ?.approximate,
    ).toBeUndefined();
  });

  /**
   * §6.4 (i): a quote whose ECB rate could not be resolved is shown in its
   * currency, without a value in euros, and nothing adds it up.
   */
  it("keeps a quote without a rate, in its currency and without a value in euros", () => {
    const withoutRate: ExternalPrices = {
      at: (_assetId, date) => ({
        date,
        unit_value: Decimal.parse("5000"),
        currency: "GBX",
        source: "eodhd",
        fx_missing: "currency_not_published",
      }),
    };
    const price = priceAt(
      project(withPrices()),
      "ast_gold",
      "2027-12-31",
      DEFAULT_SETTINGS,
      withoutRate,
    );
    expect(price).toMatchObject({ currency: "GBX", fx_missing: "currency_not_published" });
    expect(price?.unit_value_eur).toBeUndefined();
    expect(price?.fx_rate).toBeUndefined();
    expect(positionValueOf(price, Quantity.parse("3"))).toBeUndefined();
    const warnings: Warning[] = [];
    warnWithoutEur(warnings, price as PriceLookup);
    expect(warnings[0]).toMatchObject({
      code: "price_without_eur_value",
      details: { asset_id: "ast_gold", currency: "GBX", reason: "currency_not_published" },
    });
    // A quote that came without a rate and without saying why: no history.
    const silent: ExternalPrices = {
      at: (_assetId, date) => ({
        date,
        unit_value: Decimal.parse("1"),
        currency: "USD",
        source: "eodhd",
      }),
    };
    expect(
      priceAt(project(withPrices()), "ast_gold", "2027-12-31", DEFAULT_SETTINGS, silent)
        ?.fx_missing,
    ).toBe("no_history");
  });

  it("falls back to the external quote only where there is no manual price", () => {
    const state = project(withPrices());
    const gold = priceAt(state, "ast_gold", "2027-12-31", DEFAULT_SETTINGS, quotes);
    expect(gold).toMatchObject({ origin: "external", age_days: 0, stale: false });
    expect(gold?.event_id).toBeUndefined();
    expect(priceAt(state, "ast_btc", "2027-12-31", DEFAULT_SETTINGS, quotes)).toBeUndefined();
    const bulk = manualPrices(state, "2027-12-31", DEFAULT_SETTINGS, quotes);
    expect([...bulk.keys()].sort()).toEqual(["ast_gold", "ast_world"]);
    expect(bulk.get("ast_gold")?.origin).toBe("external");
  });

  it("without a source, an asset with no valuation has no price", () => {
    const state = project(withPrices());
    expect(priceAt(state, "ast_world", "2027-12-31", DEFAULT_SETTINGS)).toBeUndefined();
  });
});

describe("the date of the rate, which is not the date of the price", () => {
  it("carries the fx_rate_date of the valuation, and not its date", () => {
    // 31 December 2028 falls on a Sunday, so the ECB rate a valuation of that
    // day applies is the one of Friday the 29th. The gate used to date the
    // rate with the day of the price, and the Modelo 720 has to be able to say
    // which rate was applied (feature 010, block 3).
    const b = withPrices();
    b.valuation({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      date: "2028-12-31",
      unit_value: "200",
      currency: "USD",
      fx_rate: "1.1",
      fx_rate_date: "2028-12-29",
    });
    const price = priceAt(project(b), "ast_gold", "2028-12-31", DEFAULT_SETTINGS);
    expect(price?.date).toBe("2028-12-31");
    expect(price?.fx_rate_date).toBe("2028-12-29");
    expect(price?.unit_value_eur?.amount.toString()).toBe("181.8181818182");
  });

  it("dates an external quote that carries no rate date with the quote itself", () => {
    // Phase 4 will fill this from an adapter; nothing passes it today, and a
    // source that gives a quote without the day of its rate has said all it
    // knows: the day of the quote is the only honest answer.
    const external: ExternalPrices = {
      at: () => ({
        date: "2028-12-31",
        unit_value: Decimal.parse("50"),
        currency: "USD",
        fx_rate: Decimal.parse("1.25"),
        source: "eodhd",
      }),
    };
    const price = priceAt(
      project(withPrices()),
      "ast_spec",
      "2028-12-31",
      DEFAULT_SETTINGS,
      external,
    );
    expect(price?.origin).toBe("external");
    expect(price?.fx_rate_date).toBe("2028-12-31");
  });
});
