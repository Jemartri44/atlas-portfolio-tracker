import { describe, expect, it } from "vitest";
import { netWorth } from "../../src/projections/networth.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const settings = mergeSettings(DEFAULT_SETTINGS, {
  target_weights: { ast_world: "100" },
  stale_price_days: 5,
});

/** Core with one fund, bucket with one share, cash in euros and in dollars. */
const portfolio = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.deposit({ account_id: "acc_fund", amount: "1000" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10", unit_price: "50" });
  b.thesisOpened({ thesis_id: "th1" });
  b.buy({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    quantity: "4",
    unit_price: "25",
    fee: "0",
    currency: "USD",
    fx_rate: "1.25",
    fx_rate_date: "2027-01-11",
    trade_date: "2027-01-11",
    value_date: "2027-01-13",
    thesis_id: "th1",
  });
  b.valuation({
    account_id: "acc_fund",
    asset_id: "ast_world",
    date: "2027-06-30",
    quantity: "10",
    unit_value: "60",
  });
  b.valuation({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    date: "2027-06-30",
    quantity: "4",
    unit_value: "30",
    currency: "USD",
    fx_rate: "1.25",
  });
  return b;
};

const project = (b: LedgerBuilder, asOf?: string) =>
  projectLedger(b.build(), asOf === undefined ? {} : { asOf });

describe("netWorth", () => {
  it("always returns the three blocks broken down, plus the total", () => {
    const view = netWorth(project(portfolio()), "2027-06-30", settings);
    expect(view.core.total_eur.amount.toString()).toBe("600");
    expect(view.bucket.total_eur.amount.toString()).toBe("96");
    expect(view.bucket.rows).toEqual([
      { account_id: "acc_bucket", asset_id: "ast_spec", value_eur: view.bucket.rows[0]?.value_eur },
    ]);
    // 1000 deposited − 500 spent on the fund = 500 € of cash; the bucket paid in
    // dollars it never had, which the ledger allows and shows as a negative balance.
    expect(view.cash.rows.map((row) => `${row.account_id}|${row.currency}`)).toEqual([
      "acc_bucket|USD",
      "acc_fund|EUR",
    ]);
    expect(view.partial).toBe(false);
    expect(view.total_eur.amount.toString()).toBe("1116");
    expect(view.core.by_class).not.toHaveLength(0);
  });

  it("says what each block weighs in the total, exactly and adding up to 100", () => {
    const view = netWorth(project(portfolio()), "2027-06-30", settings);
    const shares = view.share_pct;
    // 600 + 96 + 420 = 1116.
    expect(shares?.core.round(4).toString()).toBe("53.7634");
    expect(shares?.bucket.round(4).toString()).toBe("8.6022");
    expect(shares?.cash.round(4).toString()).toBe("37.6344");
    expect(shares?.core.add(shares.bucket).add(shares.cash).round(10).toString()).toBe("100");
  });

  it("converts foreign cash with the last known rate and says how old it is", () => {
    const view = netWorth(project(portfolio()), "2027-06-30", settings);
    const usd = view.cash.rows.find((row) => row.currency === "USD");
    // The last event that priced the dollar is the valuation of that day.
    expect(usd?.fx_rate?.rate.toString()).toBe("1.25");
    expect(usd?.fx_rate?.date).toBe("2027-06-30");
    // Dated since ADR-0021: every event that carries a rate carries its date.
    expect(usd?.fx_rate_dated).toBe(true);
    expect(usd?.fx_age_days).toBe(0);
    expect(usd?.fx_stale).toBe(false);
    expect(usd?.value_eur?.amount.toString()).toBe("-80");
  });

  it("marks the rate stale when it is older than the limit, and uses it anyway", () => {
    const state = project(portfolio(), "2027-01-31");
    const usd = netWorth(state, "2027-06-30", settings).cash.rows.find(
      (row) => row.currency === "USD",
    );
    // Projected to January, the newest rate the ledger knows is the purchase's.
    expect(usd?.fx_rate?.date).toBe("2027-01-11");
    expect(usd?.fx_rate_dated).toBe(true);
    expect(usd?.fx_age_days).toBe(170);
    expect(usd?.fx_stale).toBe(true);
    expect(usd?.value_eur?.amount.toString()).toBe("-80");
    expect(netWorth(state, "2027-06-30", settings).warnings.map((w) => w.code)).toContain(
      "stale_fx_rate",
    );
    // Without `stale_price_days` nothing is stale, and the age is still shown.
    const withoutLimit = netWorth(state, "2027-06-30", DEFAULT_SETTINGS).cash.rows.find(
      (row) => row.currency === "USD",
    );
    expect(withoutLimit?.fx_stale).toBe(false);
    expect(withoutLimit?.fx_age_days).toBe(170);
  });

  it("does not convert with a rate from the future: it says it has none", () => {
    // The defect ADR-0016 closes, seen from the cash side: a full projection
    // read at a past date must not borrow tomorrow's rate.
    const usd = netWorth(project(portfolio()), "2027-01-12", settings).cash.rows.find(
      (row) => row.currency === "USD",
    );
    expect(usd?.value_eur).toBeUndefined();
    expect(usd?.fx_rate).toBeUndefined();
  });

  it("leaves a currency with no known rate unconverted and marks the total partial", () => {
    const b = portfolio();
    // The fee of an exchange paid in a third currency: the balance moves and the
    // ledger never learns a rate for it.
    b.deposit({ account_id: "acc_etf", amount: "2000" });
    b.fx({ account_id: "acc_etf", fee_currency: "CHF" });
    const view = netWorth(project(b), "2027-06-30", settings);
    const chf = view.cash.rows.find((row) => row.currency === "CHF");
    expect(chf?.value_eur).toBeUndefined();
    expect(chf?.fx_rate).toBeUndefined();
    expect(view.cash.missing_rates).toEqual(["CHF"]);
    expect(view.partial).toBe(true);
    expect(view.warnings.map((w) => w.code)).toContain("partial_net_worth");
    // No share of an incomplete total.
    expect(view.share_pct).toBeUndefined();
  });

  it("marks the total partial when an asset held has no price, and lists it", () => {
    const b = portfolio();
    b.buy({ account_id: "acc_etf", asset_id: "ast_gold", quantity: "2", currency: "USD" });
    const view = netWorth(project(b), "2027-06-30", settings);
    expect(view.core.missing_prices).toEqual(["ast_gold"]);
    expect(view.core.partial).toBe(true);
    expect(view.partial).toBe(true);
  });

  it("skips a balance that nets to zero and lists a missing currency only once", () => {
    const b = portfolio();
    b.deposit({ account_id: "acc_etf", amount: "300", value_date: "2027-02-01" });
    b.withdrawal({ account_id: "acc_etf", amount: "300", value_date: "2027-02-02" });
    b.fx({ account_id: "acc_bucket", fee_currency: "CHF" });
    b.fx({ account_id: "acc_fund", fee_currency: "CHF", value_date: "2027-05-05" });
    const view = netWorth(project(b), "2027-06-30", settings);
    // The euro balance of acc_etf is zero: no row for it.
    expect(
      view.cash.rows.some((row) => row.account_id === "acc_etf" && row.currency === "EUR"),
    ).toBe(false);
    // Two accounts hold the unpriced franc; it is reported once.
    expect(view.cash.rows.filter((row) => row.currency === "CHF")).toHaveLength(2);
    expect(view.cash.missing_rates).toEqual(["CHF"]);
  });

  it("shows the blocks even when they are empty: zero is a datum, silence is not", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const view = netWorth(project(b), "2027-06-30", settings);
    expect(view.core.total_eur.isZero()).toBe(true);
    expect(view.bucket.rows).toEqual([]);
    expect(view.cash.rows).toEqual([]);
    expect(view.total_eur.isZero()).toBe(true);
    expect(view.partial).toBe(false);
    // Nor of nothing at all.
    expect(view.share_pct).toBeUndefined();
  });

  it("answers for the date asked, quantities and rates included", () => {
    const b = portfolio();
    b.sell({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "4",
      unit_price: "40",
      currency: "USD",
      fx_rate: "1.2",
      trade_date: "2027-09-01",
      thesis_id: "th1",
    });
    const after = netWorth(project(b), "2027-12-31", settings);
    expect(after.bucket.rows).toEqual([]);
    const before = netWorth(project(b, "2027-06-30"), "2027-06-30", settings);
    expect(before.bucket.total_eur.amount.toString()).toBe("96");
    // The September rate does not exist yet on the 30th of June.
    expect(before.cash.rows.find((row) => row.currency === "USD")?.fx_rate?.rate.toString()).toBe(
      "1.25",
    );
  });
});
