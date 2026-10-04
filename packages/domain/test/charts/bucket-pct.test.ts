// The bucket against the index in percent (feature 020, E4, M7): the points of
// `bucketIndexSeries` over what was contributed to the bucket by each date.

import { describe, expect, it } from "vitest";
import { bucketIndexPctSeries } from "../../src/charts.js";
import { bucketStats } from "../../src/projections/bucket-stats.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { bucketIndexSeries } from "../../src/projections/series.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const settingsOf = (extra: Partial<Settings>): Settings => mergeSettings(DEFAULT_SETTINGS, extra);

/** One thesis bought at 100 (10 units), worth 150 at the end; the index goes 100 to 120. */
const bucketLedger = (deposits: readonly { date: string; amount: string }[]): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.settings(settingsOf({ bucket_benchmark_asset_id: "ast_world", stale_price_days: 400 }));
  for (const deposit of deposits) {
    b.deposit({ account_id: "acc_bucket", value_date: deposit.date, amount: deposit.amount });
  }
  b.thesisOpened({
    thesis_id: "t1",
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    hypothesis: "h",
    expected_horizon_days: 365,
    invalidation: "i",
    planned_size_eur: "1000",
  });
  b.valuation({
    account_id: "acc_fund",
    asset_id: "ast_world",
    date: "2027-01-01",
    quantity: "1",
    unit_value: "100",
  });
  b.buy({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    thesis_id: "t1",
    trade_date: "2027-02-01",
    value_date: "2027-02-01",
    quantity: "10",
    unit_price: "100",
    amount: "1000",
    fee: "0",
    currency: "USD",
    fx_rate: "1",
    fx_rate_date: "2027-02-01",
  });
  b.valuation({
    account_id: "acc_fund",
    asset_id: "ast_world",
    date: "2027-02-01",
    quantity: "1",
    unit_value: "100",
  });
  b.valuation({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    date: "2027-06-30",
    quantity: "10",
    unit_value: "150",
    currency: "USD",
    fx_rate: "1",
  });
  b.valuation({
    account_id: "acc_fund",
    asset_id: "ast_world",
    date: "2027-06-30",
    quantity: "1",
    unit_value: "120",
  });
  return b;
};

const pct = (value: { toString: () => string } | undefined): string | undefined =>
  value === undefined ? undefined : value.toString();

describe("bucketIndexPctSeries", () => {
  it("divides result, index and difference by what was contributed by that date", () => {
    const events = bucketLedger([
      { date: "2027-01-01", amount: "5000" },
      { date: "2027-06-15", amount: "5000" },
    ]).build();
    const series = bucketIndexPctSeries(events, { to: "2027-06-30" });
    const last = series.points.at(-1);
    // 500, 200 and 300 euros over the 10.000 contributed by 30/06.
    expect(pct(last?.result_pct)).toBe("5");
    expect(pct(last?.benchmark_pct)).toBe("2");
    expect(pct(last?.vs_index_pct)).toBe("3");
    // Before the second deposit the base was 5.000: the first point, with the
    // thesis not yet opened in practice, is zero over that base.
    expect(pct(series.points[0]?.vs_index_pct)).toBe("0");
    expect(series.complete).toBeGreaterThan(0);
  });

  it("is, on the last date, the vs_index_pct of bucketStats", () => {
    const events = bucketLedger([{ date: "2027-01-01", amount: "5000" }]).build();
    const date = "2027-06-30";
    const settings = settingsOf({ bucket_benchmark_asset_id: "ast_world", stale_price_days: 400 });
    const stats = bucketStats(projectLedger(events), events, date, settings, date).stats;
    const last = bucketIndexPctSeries(events, { to: date }).points.at(-1);
    expect(stats.vs_index_pct).toBeDefined();
    expect(pct(last?.vs_index_pct)).toBe(pct(stats.vs_index_pct));
  });

  it("has no percentage where nothing had been contributed", () => {
    const events = bucketLedger([{ date: "2027-03-01", amount: "5000" }]).build();
    const series = bucketIndexPctSeries(events, { to: "2027-06-30" });
    const first = series.points[0];
    expect(first?.date).toBe("2027-01-01");
    expect(first?.vs_index_pct).toBeUndefined();
    expect(first?.result_pct).toBeUndefined();
    expect(first?.benchmark_pct).toBeUndefined();
    expect(pct(series.points.at(-1)?.vs_index_pct)).toBe("6");
  });

  it("says why a point has no percentage when it is not a missing price", () => {
    // The thesis buys on 01/02 and the first deposit is on 01/03; prices on 15/02 for both.
    const b = bucketLedger([{ date: "2027-03-01", amount: "5000" }]);
    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      date: "2027-02-15",
      quantity: "10",
      unit_value: "100",
      currency: "USD",
      fx_rate: "1",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-02-15",
      quantity: "1",
      unit_value: "100",
    });
    const points = bucketIndexPctSeries(b.build(), { to: "2027-06-30" }).points;
    const reason = (date: string) => points.find((point) => point.date === date);
    expect(reason("2027-01-01")?.reason).toBe("no_investments");
    expect(reason("2027-02-15")?.reason).toBe("no_contributions");
    // 01/02 lacks the price of the thesis: that is a missing price, with no reason of its own.
    expect(reason("2027-02-01")?.reason).toBeUndefined();
    expect(reason("2027-02-01")?.missing.length).toBeGreaterThan(0);
    expect(reason("2027-06-30")?.reason).toBeUndefined();
    expect(reason("2027-06-30")?.vs_index_pct).toBeDefined();
  });

  it("is all no_investments for a bucket that never bought, and a core purchase is not the bucket's", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_bucket", value_date: "2027-01-02", amount: "0" });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-01-05",
      value_date: "2027-01-05",
      quantity: "1",
      unit_price: "100",
      fee: "0",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-01-31",
      quantity: "1",
      unit_value: "100",
    });
    const points = bucketIndexPctSeries(b.build(), { to: "2027-01-31" }).points;
    expect(points.length).toBeGreaterThan(0);
    expect(points.map((point) => point.reason)).toEqual(points.map(() => "no_investments"));
  });

  it("ignores a purchase that was reversed and looks for the earliest one", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.settings(settingsOf({ bucket_benchmark_asset_id: "ast_world", stale_price_days: 400 }));
    b.thesisOpened({
      thesis_id: "t1",
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      hypothesis: "h",
      expected_horizon_days: 365,
      invalidation: "i",
      planned_size_eur: "1000",
    });
    const buy = (date: string) =>
      b.buy({
        account_id: "acc_bucket",
        asset_id: "ast_spec",
        thesis_id: "t1",
        trade_date: date,
        value_date: date,
        quantity: "1",
        unit_price: "10",
        fee: "0",
        currency: "USD",
        fx_rate: "1",
        fx_rate_date: date,
      });
    const undone = buy("2027-01-05");
    b.reversal(undone.id);
    buy("2027-02-10");
    buy("2027-02-01");
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-01-31",
      quantity: "1",
      unit_value: "100",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-02-05",
      quantity: "1",
      unit_value: "100",
    });
    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      date: "2027-02-05",
      quantity: "2",
      unit_value: "10",
      currency: "USD",
      fx_rate: "1",
    });
    const points = bucketIndexPctSeries(b.build(), { to: "2027-02-05" }).points;
    const reasons = Object.fromEntries(points.map((point) => [point.date, point]));
    // The reversed purchase of 05/01 does not count; the earliest real one is 01/02.
    expect(reasons["2027-01-31"]?.reason).toBe("no_investments");
    // On 05/02 the bucket has bought (01/02) and nothing was deposited.
    expect(reasons["2027-02-05"]?.reason).toBe("no_contributions");
  });

  it("has no percentage at a point with a missing comparison, and keeps why", () => {
    const b = bucketLedger([{ date: "2027-01-01", amount: "5000" }]);
    b.settings(settingsOf({ bucket_benchmark_asset_id: "ast_nope", stale_price_days: 400 }));
    const events = b.build();
    const series = bucketIndexPctSeries(events, { to: "2027-06-30" });
    const last = series.points.at(-1);
    expect(last?.vs_index_pct).toBeUndefined();
    expect(last?.missing.map((gap) => gap.reason)).toContain("unknown_asset");
    expect(series.complete).toBe(
      series.points.filter((point) => point.vs_index_pct !== undefined).length,
    );
  });

  it("has the same dates, range and counts of idle theses as the series in euros", () => {
    const events = bucketLedger([{ date: "2027-01-01", amount: "5000" }]).build();
    const options = { to: "2027-06-30", from: "2027-02-01" };
    const euros = bucketIndexSeries(events, options);
    const percent = bucketIndexPctSeries(events, options);
    expect(percent.from).toBe(euros.from);
    expect(percent.to).toBe(euros.to);
    expect(percent.points.map((point) => [point.date, point.idle])).toEqual(
      euros.points.map((point) => [point.date, point.idle]),
    );
  });
});
