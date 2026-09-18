// The two time series (decision (f) of prompt 007) and, above all, the rule
// that decides what is a hole: a figure exists only when all of its components
// have a price, and a partial total is never drawn (Q1).

import { describe, expect, it } from "vitest";
import { netWorth } from "../../src/projections/networth.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { bucketIndexSeries, netWorthSeries, sampleEvenly } from "../../src/projections/series.js";
import { settingsAt } from "../../src/projections/settings-at.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const settingsOf = (extra: Partial<Settings>): Settings => mergeSettings(DEFAULT_SETTINGS, extra);

/** A core position in one fund, valued on the dates given. */
const coreLedger = (valuationDates: readonly string[]) => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.settings(settingsOf({ stale_price_days: 7 }));
  b.deposit({ account_id: "acc_fund", value_date: "2027-01-01", amount: "10000" });
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    trade_date: "2027-01-02",
    value_date: "2027-01-02",
    quantity: "100",
    unit_price: "100",
    amount: "10000",
    fee: "0",
  });
  for (const date of valuationDates) {
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date,
      quantity: "100",
      unit_value: "110",
    });
  }
  return b;
};

describe("netWorthSeries", () => {
  it("uses the valuation dates of the ledger, plus the end of the range", () => {
    const events = coreLedger(["2027-03-31", "2027-06-30"]).build();

    const series = netWorthSeries(events, { to: "2027-12-31" });

    expect(series.points.map((point) => point.date)).toEqual([
      "2027-03-31",
      "2027-06-30",
      "2027-12-31",
    ]);
    expect(series.from).toBe("2027-03-31");
    expect(series.to).toBe("2027-12-31");
  });

  /** The promise of the whole module: a point of the series is `atlas networth --date`. */
  it("gives, point by point, exactly what netWorth gives at that date", () => {
    const events = coreLedger(["2027-03-31", "2027-06-30"]).build();

    for (const point of netWorthSeries(events, { to: "2027-06-30" }).points) {
      const state = projectLedger(events, { collectErrors: true, asOf: point.date });
      const worth = netWorth(state, point.date, settingsAt(state, point.date).settings);
      expect(point.core_eur?.amount.toString()).toBe(worth.core.total_eur.amount.toString());
      expect(point.cash_eur?.amount.toString()).toBe(worth.cash.total_eur.amount.toString());
      expect(point.total_eur?.amount.toString()).toBe(
        worth.core.total_eur
          .add(worth.bucket.total_eur)
          .add(worth.cash.total_eur)
          .amount.toString(),
      );
    }
  });

  /**
   * The point of Q1: a partial block is **absent**, not a smaller number. Here
   * the ledger holds two core assets and only one of them is ever valued.
   */
  it("leaves a hole instead of drawing a partial core total", () => {
    const b = coreLedger(["2027-06-30"]);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      trade_date: "2027-02-01",
      value_date: "2027-02-01",
      quantity: "50",
      unit_price: "20",
      amount: "1000",
      fee: "0",
    });
    const events = b.build();

    const series = netWorthSeries(events, { to: "2027-06-30" });
    const point = series.points.at(-1);

    expect(point?.core_eur).toBeUndefined();
    expect(point?.total_eur).toBeUndefined();
    expect(point?.missing.core).toEqual(["ast_bonds"]);
    // The cash of the account is still known: the hole is per series.
    expect(point?.cash_eur).toBeDefined();
    expect(series.complete).toBe(0);
  });

  it("counts as complete only the points with the three blocks present", () => {
    const events = coreLedger(["2027-03-31", "2027-06-30"]).build();

    const series = netWorthSeries(events, { to: "2027-06-30" });

    expect(series.complete).toBe(2);
    expect(series.points.every((point) => point.total_eur !== undefined)).toBe(true);
  });

  it("leaves a hole in the bucket series when a bucket position has no price", () => {
    const b = coreLedger(["2027-06-30"]);
    b.deposit({ account_id: "acc_bucket", value_date: "2027-01-01", amount: "2000" });
    b.thesisOpened({
      thesis_id: "t1",
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      hypothesis: "h",
      expected_horizon_days: 180,
      invalidation: "i",
      planned_size_eur: "1000",
    });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      thesis_id: "t1",
      trade_date: "2027-02-01",
      value_date: "2027-02-01",
      quantity: "10",
      unit_price: "50",
      amount: "500",
      fee: "0",
      currency: "USD",
      fx_rate: "1.1",
      fx_rate_date: "2027-02-01",
    });
    const events = b.build();

    const point = netWorthSeries(events, { to: "2027-06-30" }).points.at(-1);

    expect(point?.core_eur).toBeDefined();
    expect(point?.bucket_eur).toBeUndefined();
    expect(point?.missing.bucket).toEqual(["ast_spec"]);
    expect(point?.total_eur).toBeUndefined();
  });

  it("leaves a hole in the cash series when a currency has no known rate", () => {
    const b = coreLedger(["2027-06-30"]);
    // The fee of an exchange paid in a third currency: the balance moves and the
    // ledger never learns a rate for it.
    b.deposit({ account_id: "acc_etf", value_date: "2027-01-01", amount: "2000" });
    b.fx({ account_id: "acc_etf", value_date: "2027-02-01", fee_currency: "CHF" });
    const events = b.build();

    const point = netWorthSeries(events, { to: "2027-06-30" }).points.at(-1);

    expect(point?.core_eur).toBeDefined();
    expect(point?.cash_eur).toBeUndefined();
    expect(point?.missing.cash).toEqual(["CHF"]);
    expect(point?.total_eur).toBeUndefined();
  });

  it("falls back to the end of the range when no date survives the filter", () => {
    const events = coreLedger(["2027-03-31"]).build();

    const series = netWorthSeries(events, { to: "2027-06-30", dates: [] });

    expect(series.points).toEqual([]);
    expect(series.from).toBe("2027-06-30");
    expect(series.to).toBe("2027-06-30");
  });

  it("honours an explicit list of dates and clips it to the range", () => {
    const events = coreLedger(["2027-03-31"]).build();

    const series = netWorthSeries(events, {
      from: "2027-02-01",
      to: "2027-06-30",
      dates: ["2027-01-01", "2027-03-31", "2027-05-31", "2027-12-31"],
    });

    expect(series.points.map((point) => point.date)).toEqual(["2027-03-31", "2027-05-31"]);
    expect(series.from).toBe("2027-02-01");
  });

  it("deduplicates and sorts the dates it is given", () => {
    const events = coreLedger(["2027-03-31"]).build();

    const series = netWorthSeries(events, {
      to: "2027-06-30",
      dates: ["2027-05-31", "2027-03-31", "2027-05-31"],
    });

    expect(series.points.map((point) => point.date)).toEqual(["2027-03-31", "2027-05-31"]);
  });

  it("returns no points when the range is empty or inverted", () => {
    const events = coreLedger(["2027-03-31"]).build();

    const inverted = netWorthSeries(events, { from: "2027-06-01", to: "2027-01-01" });

    expect(inverted.points).toEqual([]);
    expect(inverted.complete).toBe(0);
    expect(inverted.from).toBe("2027-06-01");
  });

  it("works on an empty ledger: one point, nothing in it", () => {
    const series = netWorthSeries([], { to: "2027-06-30" });

    expect(series.points).toHaveLength(1);
    expect(series.points[0]?.date).toBe("2027-06-30");
    expect(series.points[0]?.total_eur?.amount.toString()).toBe("0");
    expect(series.complete).toBe(1);
  });

  /**
   * The cap must never turn a gap into a continuous line. Sampling drops
   * intermediate dates; if the dropped one is the incomplete one, the hole
   * disappears and the chart draws straight through it — interpolation reached
   * by arithmetic instead of by drawing, which is the same lie either way.
   */
  it("never samples away a point that has no data", () => {
    const b = coreLedger(["2027-01-31", "2027-03-31", "2027-04-30"]);
    // A second core asset, priced only at the end: the middle dates are partial.
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      trade_date: "2027-01-02",
      value_date: "2027-01-02",
      quantity: "50",
      unit_price: "20",
      amount: "1000",
      fee: "0",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      date: "2027-04-30",
      quantity: "50",
      unit_value: "22",
    });
    const events = b.build();

    const capped = netWorthSeries(events, { to: "2027-04-30", max_points: 2 });

    // The two incomplete dates survive the cap, so the gap is still drawn.
    expect(capped.points.map((point) => point.date)).toContain("2027-01-31");
    expect(capped.points.map((point) => point.date)).toContain("2027-03-31");
    expect(capped.points.filter((point) => point.total_eur === undefined).length).toBe(2);
    expect(capped.complete).toBe(1);
  });

  it("caps the number of points, keeping the ends", () => {
    const dates = ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"];
    const events = coreLedger(dates).build();

    const series = netWorthSeries(events, { to: "2027-05-31", max_points: 3 });

    expect(series.points.map((point) => point.date)).toEqual([
      "2027-01-31",
      "2027-03-31",
      "2027-05-31",
    ]);
  });
});

describe("sampleEvenly", () => {
  it("returns everything when it already fits", () => {
    expect(sampleEvenly([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it("keeps the first and the last", () => {
    expect(sampleEvenly([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([1, 4, 7]);
  });

  it("keeps only the last when asked for one", () => {
    expect(sampleEvenly([1, 2, 3], 1)).toEqual([3]);
  });

  /**
   * Spaces the picks **rounding**, not truncating. With six values and four
   * picks the step is 1,67, so the indices asked for are 0 · 1,67 · 3,33 · 5:
   * rounding gives 0, 2, 3, 5 and truncating would give 0, 1, 3, 5 — a sample
   * that leans towards the start of the range and, on a chart, shows the recent
   * stretch with fewer points than the old one.
   */
  it("spaces the picks by rounding, not by truncating", () => {
    expect(sampleEvenly([0, 1, 2, 3, 4, 5], 4)).toEqual([0, 2, 3, 5]);
  });

  it("returns nothing when asked for nothing", () => {
    expect(sampleEvenly([1, 2, 3], 0)).toEqual([]);
  });
});

/** A bucket with one thesis, its index, and prices for both. */
const bucketLedger = () => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.settings(settingsOf({ bucket_benchmark_asset_id: "ast_world", stale_price_days: 400 }));
  b.deposit({ account_id: "acc_bucket", value_date: "2027-01-01", amount: "5000" });
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

describe("bucketIndexSeries", () => {
  it("aggregates the theses against the index at each date", () => {
    const events = bucketLedger().build();

    const series = bucketIndexSeries(events, { from: "2027-06-30", to: "2027-06-30" });
    const point = series.points.at(-1);

    // 10 shares bought at 100 = 1000 invested, worth 1500 at the date: +500.
    expect(point?.result_eur?.amount.toString()).toBe("500");
    // The same 1000 in an index that went 100 -> 120: +200.
    expect(point?.benchmark_eur?.amount.toString()).toBe("200");
    expect(point?.vs_index_eur?.amount.toString()).toBe("300");
    expect(point?.missing).toEqual([]);
    expect(series.complete).toBe(1);
  });

  /** A thesis that has not moved adds nothing to either sum; saying so is not the same as calling it zero. */
  it("skips a thesis that has neither bought nor sold, and counts it as idle", () => {
    const b = bucketLedger();
    // A different asset: two open theses on the same pair are refused, and what
    // is being tested here is a thesis written down and not yet acted on.
    b.asset("ast_idea", {
      asset_type: "stock",
      book: "bucket",
      currency: "USD",
      transferable: false,
    });
    b.thesisOpened({
      thesis_id: "t2",
      account_id: "acc_bucket",
      asset_id: "ast_idea",
      hypothesis: "h2",
      expected_horizon_days: 365,
      invalidation: "i2",
      planned_size_eur: "500",
    });
    const events = b.build();

    const point = bucketIndexSeries(events, { from: "2027-06-30", to: "2027-06-30" }).points.at(-1);

    expect(point?.idle).toBe(1);
    expect(point?.vs_index_eur?.amount.toString()).toBe("300");
  });

  it("drops the whole point when a comparison is missing: a partial sum compares with nothing", () => {
    const b = bucketLedger();
    // A benchmark that is not in the catalogue kills every comparison.
    b.settings(settingsOf({ bucket_benchmark_asset_id: "ast_nope", stale_price_days: 400 }));
    const events = b.build();

    const series = bucketIndexSeries(events, { from: "2027-06-30", to: "2027-06-30" });
    const point = series.points.at(-1);

    expect(point?.vs_index_eur).toBeUndefined();
    expect(point?.result_eur).toBeUndefined();
    expect(point?.missing.map((gap) => gap.reason)).toContain("unknown_asset");
    expect(series.complete).toBe(0);
  });

  it("says nothing, without failing, on a ledger with no theses", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const series = bucketIndexSeries(b.build(), { to: "2027-06-30" });

    expect(series.points).toHaveLength(1);
    expect(series.points[0]?.vs_index_eur?.amount.toString()).toBe("0");
    expect(series.points[0]?.idle).toBe(0);
  });

  /**
   * The cap shapes which **complete** points are drawn; a date with no
   * comparison is kept on top of it, because dropping it would draw the line
   * straight through a stretch where nothing is known.
   */
  it("shapes the series with the cap but never drops a point with no data", () => {
    const events = bucketLedger().build();

    const capped = bucketIndexSeries(events, { to: "2027-06-30", max_points: 2 });
    const whole = bucketIndexSeries(events, { to: "2027-06-30" });

    expect(capped.points.length).toBeLessThan(whole.points.length + 1);
    expect(capped.points.at(-1)?.date).toBe("2027-06-30");
    // Every hole of the full series is still a hole of the capped one.
    const holes = (series: typeof whole): string[] =>
      series.points.filter((point) => point.vs_index_eur === undefined).map((p) => p.date);
    expect(holes(capped)).toEqual(holes(whole));
  });
});
