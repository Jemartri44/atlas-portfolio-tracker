// One test per case of the definition of what was contributed (feature 020, E4,
// M3; `docs/business-rules.md`, "Lo aportado").

import { describe, expect, it } from "vitest";
import { contributedSeries } from "../../src/charts.js";
import { netWorthSeries } from "../../src/projections/series.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const base = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  return b;
};

/** A valuation on each date, so the series has points to evaluate. */
const valued = (b: LedgerBuilder, dates: readonly string[]): void => {
  for (const date of dates) {
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date,
      quantity: "1",
      unit_value: "10",
    });
  }
};

const eurAt = (events: ReturnType<LedgerBuilder["build"]>, to: string) =>
  contributedSeries(events, { to }).points.map((point) => point.contributed_eur.amount.toString());

describe("contributedSeries: what counts", () => {
  it("adds the deposits and subtracts the withdrawals of the core, by business date", () => {
    const b = base();
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-02-01" });
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-03-01" });
    b.withdrawal({ account_id: "acc_fund", amount: "300", value_date: "2027-03-15" });
    valued(b, ["2027-02-15", "2027-03-10", "2027-03-31"]);
    const series = contributedSeries(b.build(), { to: "2027-03-31" });
    expect(series.points.map((point) => point.date)).toEqual([
      "2027-02-15",
      "2027-03-10",
      "2027-03-31",
    ]);
    expect(series.points.map((point) => point.contributed_eur.amount.toString())).toEqual([
      "1000",
      "2000",
      "1700",
    ]);
  });

  it("values each event at its own rate, whatever the date of the point", () => {
    const b = base();
    b.deposit({
      account_id: "acc_fund",
      amount: "1100",
      currency: "USD",
      fx_rate: "1.1000",
      fx_rate_date: "2027-02-01",
      value_date: "2027-02-01",
    });
    valued(b, ["2027-03-31", "2028-03-31"]);
    expect(eurAt(b.build(), "2028-03-31")).toEqual(["1000", "1000"]);
  });

  it("ignores dividends, interest, fees, purchases, sales and the bucket", () => {
    const b = base();
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
    b.deposit({ account_id: "acc_bucket", amount: "200", value_date: "2027-01-02" });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-01-05",
      quantity: "1",
      unit_price: "10",
    });
    b.dividend({ account_id: "acc_fund", asset_id: "ast_world", value_date: "2027-02-01" });
    b.interest({ account_id: "acc_fund", value_date: "2027-02-02" });
    b.fee({ account_id: "acc_fund", value_date: "2027-02-03" });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-03-01",
      quantity: "1",
    });
    expect(eurAt(b.build(), "2027-04-01")).toEqual(["1000"]);
  });

  it("does not count an event reversed, and counts its correction", () => {
    const b = base();
    const wrong = b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
    b.reversal(wrong.id);
    b.deposit({ account_id: "acc_fund", amount: "100", value_date: "2027-01-02" });
    expect(eurAt(b.build(), "2027-04-01")).toEqual(["100"]);
  });

  it("has no hole where the net worth has one: it needs no price", () => {
    const b = base();
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-01-05",
      quantity: "1",
      unit_price: "10",
    });
    const events = b.build();
    const worth = netWorthSeries(events, { to: "2027-06-30" });
    expect(worth.complete).toBeLessThan(worth.points.length);
    const series = contributedSeries(events, { to: "2027-06-30" });
    expect(series.points.every((point) => point.contributed_eur.amount.toString() === "1000")).toBe(
      true,
    );
  });
});

describe("contributedSeries: the axis", () => {
  it("has exactly the dates of the net worth, with and without a cap of points", () => {
    const b = base();
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
    valued(b, ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31", "2027-06-30"]);
    const events = b.build();
    for (const options of [
      { to: "2027-06-30" },
      { to: "2027-06-30", from: "2027-02-01" },
      { to: "2027-06-30", max_points: 3 },
    ]) {
      expect(contributedSeries(events, options).points.map((point) => point.date)).toEqual(
        netWorthSeries(events, options).points.map((point) => point.date),
      );
    }
  });
});

describe("contributedSeries: purchases the cash does not cover", () => {
  const withBuy = (depositDate: string | undefined, buyDate: string) => {
    const b = base();
    if (depositDate !== undefined) {
      b.deposit({ account_id: "acc_fund", amount: "1000", value_date: depositDate });
    }
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: buyDate,
      quantity: "1",
      unit_price: "10",
    });
    return contributedSeries(b.build(), { to: "2027-12-31" }).uncovered_buys;
  };

  it("is true when a purchase comes before the first deposit, or there is none", () => {
    expect(withBuy("2027-03-01", "2027-02-01")).toBe(true);
    expect(withBuy(undefined, "2027-02-01")).toBe(true);
  });

  it("is false when the first deposit is the day of the purchase or before it", () => {
    expect(withBuy("2027-02-01", "2027-02-01")).toBe(false);
    expect(withBuy("2027-01-01", "2027-02-01")).toBe(false);
  });

  it("is false without purchases, and for a purchase of the bucket", () => {
    const none = base();
    none.deposit({ account_id: "acc_fund", value_date: "2027-01-01" });
    expect(contributedSeries(none.build(), { to: "2027-12-31" }).uncovered_buys).toBe(false);
    const bucket = base();
    bucket.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      trade_date: "2027-02-01",
      quantity: "1",
      unit_price: "10",
    });
    expect(contributedSeries(bucket.build(), { to: "2027-12-31" }).uncovered_buys).toBe(false);
  });

  it("looks at the earliest purchase and the earliest deposit, whatever the order of the events", () => {
    const b = base();
    b.deposit({ account_id: "acc_fund", value_date: "2027-03-01" });
    b.deposit({ account_id: "acc_fund", value_date: "2027-01-01" });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-02-01",
      quantity: "1",
      unit_price: "10",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-04-01",
      quantity: "1",
      unit_price: "10",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-01-15",
      quantity: "1",
      unit_price: "10",
    });
    expect(contributedSeries(b.build(), { to: "2027-12-31" }).uncovered_buys).toBe(false);
  });
});
