import { describe, expect, it } from "vitest";
import { manualPrices } from "../../src/projections/prices.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
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
    expect(price?.fx_rate.toString()).toBe("1.09");
    expect(price?.unit_value_eur.amount.toString()).toBe("192.6605504587");
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
