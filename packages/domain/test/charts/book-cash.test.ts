// What each book is worth with the cash of its own accounts (feature 020, E4,
// second part; ADR-0004): the line the contributions are read against.

import { describe, expect, it } from "vitest";
import { bookCashSeries } from "../../src/charts.js";
import { netWorthSeries } from "../../src/projections/series.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const base = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  return b;
};

const valued = (b: LedgerBuilder, date: string, quantity = "10", unit_value = "200"): void => {
  b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date, quantity, unit_value });
};

const core = (events: ReturnType<LedgerBuilder["build"]>, to: string) =>
  bookCashSeries(events, { to }).points.map((point) => point.core_eur?.amount.toString());

describe("bookCashSeries: the core with its cash", () => {
  it("shows 10.000 against 10.000 for a deposit of 10.000 and a purchase of 2.000", () => {
    const b = base();
    b.deposit({ account_id: "acc_fund", amount: "10000", value_date: "2027-01-02" });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-01-05",
      value_date: "2027-01-05",
      quantity: "10",
      unit_price: "200",
      fee: "0",
    });
    valued(b, "2027-01-31");
    const events = b.build();
    // The assets alone are 2.000: that was the line that stood 8.000 below what was put in.
    expect(
      netWorthSeries(events, { to: "2027-01-31" }).points[0]?.core_eur?.amount.toString(),
    ).toBe("2000");
    expect(core(events, "2027-01-31")).toEqual(["10000"]);
  });

  it("keeps the cash of the bucket out of the core, and with the bucket", () => {
    const b = base();
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
    b.deposit({ account_id: "acc_bucket", amount: "200", value_date: "2027-01-02" });
    valued(b, "2027-01-31");
    const series = bookCashSeries(b.build(), { to: "2027-01-31" });
    expect(series.points[0]?.core_eur?.amount.toString()).toBe("1000");
    expect(series.points[0]?.bucket_eur?.amount.toString()).toBe("200");
  });

  it("adds up to the net worth, with nothing counted twice", () => {
    const b = base();
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
    b.deposit({ account_id: "acc_bucket", amount: "200", value_date: "2027-01-02" });
    valued(b, "2027-01-31", "5", "210");
    const events = b.build();
    const [point] = bookCashSeries(events, { to: "2027-01-31" }).points;
    const [worth] = netWorthSeries(events, { to: "2027-01-31" }).points;
    expect(
      point?.core_eur
        ?.add(point.bucket_eur as NonNullable<typeof point.bucket_eur>)
        .amount.toString(),
    ).toBe(worth?.total_eur?.amount.toString());
  });

  it("converts the cash in another currency with the rate of the ledger", () => {
    const b = base();
    b.deposit({
      account_id: "acc_fund",
      amount: "1100",
      currency: "USD",
      fx_rate: "1.1000",
      fx_rate_date: "2027-01-02",
      value_date: "2027-01-02",
    });
    valued(b, "2027-01-31", "0", "1");
    expect(core(b.build(), "2027-01-31")).toEqual(["1000"]);
  });

  it("leaves a book without a value where the rate of its cash is unknown, and the other whole", () => {
    const b = base();
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
    b.deposit({ account_id: "acc_bucket", amount: "200", value_date: "2027-01-02" });
    // The fee of an exchange paid in a currency whose rate the ledger never learns.
    b.fx({ account_id: "acc_fund", fee_currency: "CHF" });
    valued(b, "2027-06-30");
    const [point] = bookCashSeries(b.build(), { to: "2027-06-30" }).points;
    expect(point?.core_eur).toBeUndefined();
    expect(point?.bucket_eur?.amount.toString()).toBe("200");
  });

  it("leaves the bucket without a value where its own cash has no rate, and the core whole", () => {
    const b = base();
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
    b.deposit({ account_id: "acc_bucket", amount: "200", value_date: "2027-01-02" });
    b.fx({ account_id: "acc_bucket", fee_currency: "CHF" });
    valued(b, "2027-06-30");
    const [point] = bookCashSeries(b.build(), { to: "2027-06-30" }).points;
    expect(point?.core_eur?.amount.toString()).toBe("1000");
    expect(point?.bucket_eur).toBeUndefined();
  });

  it("has no value for the core where an asset it holds has no price", () => {
    const b = base();
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-01-05",
      value_date: "2027-01-05",
      quantity: "1",
      unit_price: "10",
      fee: "0",
    });
    // The only price of the day is of an asset the core does not hold.
    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      date: "2027-01-31",
      quantity: "1",
      unit_value: "10",
      currency: "USD",
      fx_rate: "1.1",
      fx_rate_date: "2027-01-31",
    });
    const points = bookCashSeries(b.build(), { to: "2027-01-31" }).points;
    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      expect(point.core_eur).toBeUndefined();
    }
  });

  it("shares the dates of the net worth series, whatever the options", () => {
    const b = base();
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
    for (const date of ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]) {
      valued(b, date);
    }
    const events = b.build();
    for (const options of [{ to: "2027-04-30" }, { to: "2027-04-30", max_points: 2 }]) {
      expect(bookCashSeries(events, options).points.map((point) => point.date)).toEqual(
        netWorthSeries(events, options).points.map((point) => point.date),
      );
    }
  });
});
