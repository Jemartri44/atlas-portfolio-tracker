import { describe, expect, it } from "vitest";
import { Quantity } from "../../src/money/quantity.js";
import { bucketStats } from "../../src/projections/bucket-stats.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
const EUR = { currency: "EUR", fx_rate: "1" } as const;

const settings = (extra: Partial<Settings> = {}): Settings =>
  mergeSettings(DEFAULT_SETTINGS, extra);

interface Trade {
  id: string;
  asset?: string;
  quantity?: string;
  buyPrice: string;
  sellPrice?: string;
  buyDate?: string;
  sellDate?: string;
  fee?: string;
  close?: boolean;
}

/** One thesis: buy, maybe sell, maybe close. Everything in euros, fees explicit. */
const trade = (b: LedgerBuilder, t: Trade): void => {
  const asset = t.asset ?? "ast_spec";
  b.thesisOpened({ thesis_id: t.id, asset_id: asset, planned_size_eur: "100000" });
  b.buy({
    account_id: "acc_bucket",
    asset_id: asset,
    quantity: t.quantity ?? "10",
    unit_price: t.buyPrice,
    fee: t.fee ?? "0",
    ...EUR,
    trade_date: t.buyDate ?? "2027-01-11",
    value_date: t.buyDate ?? "2027-01-11",
    thesis_id: t.id,
  });
  if (t.sellPrice !== undefined) {
    b.sell({
      account_id: "acc_bucket",
      asset_id: asset,
      quantity: t.quantity ?? "10",
      unit_price: t.sellPrice,
      fee: t.fee ?? "0",
      ...EUR,
      trade_date: t.sellDate ?? "2027-06-01",
      thesis_id: t.id,
    });
  }
  if (t.close !== false) {
    b.thesisClosed(t.id);
  }
};

const bucket = (trades: Trade[]): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.asset("ast_spec2", { book: "bucket", asset_type: "stock", transferable: false });
  b.deposit({ account_id: "acc_bucket", amount: "5000", value_date: "2027-01-01" });
  for (const t of trades) {
    trade(b, t);
  }
  return b;
};

const report = (b: LedgerBuilder, config: Partial<Settings> = {}) => {
  const events = b.build();
  return bucketStats(projectLedger(events), events, DATE, settings(config));
};

describe("bucketStats: what the operation says about the operator", () => {
  it("counts, hit rate, averages and expectancy over the closed theses", () => {
    // +20, +40 and −30 on three closed theses.
    const { stats } = report(
      bucket([
        { id: "t1", buyPrice: "10", sellPrice: "12" },
        { id: "t2", buyPrice: "10", sellPrice: "14", asset: "ast_spec2" },
        { id: "t3", buyPrice: "10", sellPrice: "7", buyDate: "2027-07-01", sellDate: "2027-08-01" },
      ]),
    );
    expect(stats.closed_theses).toBe(3);
    expect(stats.measured_theses).toBe(3);
    expect(stats.realized_operations).toBe(3);
    expect(stats.hit_rate?.round(4).toString()).toBe("66.6667");
    expect(stats.average_win_eur?.amount.toString()).toBe("30");
    expect(stats.average_loss_eur?.amount.toString()).toBe("-30");
    expect(stats.expectancy_eur?.amount.toString()).toBe("10");
    expect(stats.warnings.map((w) => w.code)).toContain("bucket_sample_too_small");
  });

  it("says 'no data' for the average win when every thesis lost, never zero", () => {
    const { stats } = report(
      bucket([
        { id: "t1", buyPrice: "10", sellPrice: "8" },
        { id: "t2", buyPrice: "10", sellPrice: "9", asset: "ast_spec2" },
      ]),
    );
    expect(stats.average_win_eur).toBeUndefined();
    expect(stats.average_loss_eur?.amount.toString()).toBe("-15");
    expect(stats.hit_rate?.isZero()).toBe(true);
  });

  it("with a single closed thesis the expectancy is exactly its result", () => {
    const { stats } = report(bucket([{ id: "t1", buyPrice: "10", sellPrice: "13" }]));
    expect(stats.expectancy_eur?.amount.toString()).toBe("30");
    expect(stats.hit_rate?.toString()).toBe("100");
  });

  it("excludes a thesis whose sale ate lots of another one, and says how many", () => {
    // t1 closes while still holding; t2 buys more of the same asset and sells
    // everything: the global FIFO hands it t1's lots (ADR-0009).
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_bucket", amount: "5000", value_date: "2027-01-01" });
    b.thesisOpened({ thesis_id: "t1", planned_size_eur: "100000" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: "10",
      fee: "0",
      ...EUR,
      trade_date: "2027-01-11",
      value_date: "2027-01-11",
      thesis_id: "t1",
    });
    b.thesisClosed("t1");
    b.thesisOpened({ thesis_id: "t2", planned_size_eur: "100000" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: "20",
      fee: "0",
      ...EUR,
      trade_date: "2027-03-01",
      value_date: "2027-03-01",
      thesis_id: "t2",
    });
    b.sell({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "20",
      unit_price: "25",
      fee: "0",
      ...EUR,
      trade_date: "2027-06-01",
      thesis_id: "t2",
    });
    b.thesisClosed("t2");
    const events = b.build();
    const { stats } = bucketStats(projectLedger(events), events, DATE, settings());
    expect(stats.closed_theses).toBe(2);
    expect(stats.measured_theses).toBe(1);
    expect(stats.excluded).toEqual([{ thesis_id: "t2", reason: "foreign_lots" }]);
    // t1 is measured (it never sold: nothing to contaminate) and t2 is out.
    expect(stats.expectancy_eur?.isZero()).toBe(true);
    expect(stats.warnings.map((w) => w.code)).toContain("bucket_contaminated_theses");
  });

  it("follows the lineage of a lot: a thesis that sells what a swap handed it is contaminated", () => {
    // t1 buys, a merger converts the asset, t2 sells the descendants. The lots
    // t2 sells are not its own: they carry `source_lot_id` back to t1's buy.
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_spec2", { book: "bucket", asset_type: "stock", transferable: false });
    b.deposit({ account_id: "acc_bucket", amount: "5000", value_date: "2027-01-01" });
    b.thesisOpened({ thesis_id: "t1", planned_size_eur: "100000" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: "10",
      fee: "0",
      ...EUR,
      trade_date: "2027-01-11",
      value_date: "2027-01-11",
      thesis_id: "t1",
    });
    b.corporateAction({
      kind: "merger",
      asset_id: "ast_spec",
      effective_date: "2027-03-01",
      effects: [{ op: "convert", to_asset_id: "ast_spec2", ratio: "1" }],
    });
    b.thesisClosed("t1");
    b.thesisOpened({ thesis_id: "t2", asset_id: "ast_spec2", planned_size_eur: "100000" });
    b.sell({
      account_id: "acc_bucket",
      asset_id: "ast_spec2",
      quantity: "10",
      unit_price: "14",
      fee: "0",
      ...EUR,
      trade_date: "2027-06-01",
      thesis_id: "t2",
    });
    b.thesisClosed("t2");
    const events = b.build();
    const { stats } = bucketStats(projectLedger(events), events, DATE, settings());
    expect(stats.excluded).toEqual([{ thesis_id: "t2", reason: "foreign_lots" }]);
    expect(stats.measured_theses).toBe(1);
  });

  it("shows the commissions over the capital traded, with both amounts (rule 14)", () => {
    const { stats } = report(bucket([{ id: "t1", buyPrice: "10", sellPrice: "12", fee: "1" }]));
    // Cost 10 × 10 + 1 = 101 of capital, 1 + 1 of commissions.
    expect(stats.traded_capital_eur.amount.toString()).toBe("101");
    expect(stats.fees_eur.amount.toString()).toBe("2");
    expect(stats.fees_pct?.round(4).toString()).toBe("1.9802");
  });

  it("measures the worst run of the realized result, with its peak and its valley", () => {
    const { stats } = report(
      bucket([
        { id: "t1", buyPrice: "10", sellPrice: "15", sellDate: "2027-03-01" },
        {
          id: "t2",
          asset: "ast_spec2",
          buyPrice: "10",
          sellPrice: "4",
          buyDate: "2027-02-01",
          sellDate: "2027-04-01",
        },
        {
          id: "t3",
          buyPrice: "10",
          sellPrice: "11",
          buyDate: "2027-05-01",
          sellDate: "2027-06-01",
        },
      ]),
    );
    // Cumulative: +50, −10, 0. The fall from the peak of 50 to −10 is 60.
    expect(stats.max_drawdown_eur.amount.toString()).toBe("60");
    expect(stats.drawdown_peak?.date).toBe("2027-03-01");
    expect(stats.drawdown_valley?.date).toBe("2027-04-01");
  });

  it("has a drawdown of zero, with no dates, when the result never falls", () => {
    const { stats } = report(bucket([{ id: "t1", buyPrice: "10", sellPrice: "12" }]));
    expect(stats.max_drawdown_eur.isZero()).toBe(true);
    expect(stats.drawdown_peak).toBeUndefined();
    expect(stats.drawdown_valley).toBeUndefined();
  });

  it("adds up the result against the index and counts what has no data", () => {
    const b = bucket([{ id: "t1", buyPrice: "10", sellPrice: "12" }]);
    b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date: "2027-01-01" });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-06-01",
      unit_value: "231",
    });
    const withIndex = report(b, { bucket_benchmark_asset_id: "ast_world" }).stats;
    // The index would have turned 100 into 110: the thesis made 20, so +10.
    expect(withIndex.vs_index_total_eur?.amount.toString()).toBe("10");
    expect(withIndex.vs_index_missing).toBe(0);
    const without = report(b).stats;
    expect(without.vs_index_total_eur).toBeUndefined();
    expect(without.vs_index_missing).toBe(1);
  });

  it("stops warning about the sample once there are a hundred closed theses", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_bucket", amount: "500000", value_date: "2027-01-01" });
    // A hundred sequential theses on the same asset: each one buys what it
    // sells, so the FIFO never mixes two of them.
    for (let i = 0; i < 100; i += 1) {
      const day = String((i % 28) + 1).padStart(2, "0");
      const month = String((i % 12) + 1).padStart(2, "0");
      trade(b, {
        id: `t${i}`,
        buyPrice: "10",
        sellPrice: "11",
        buyDate: `2027-${month}-${day}`,
        sellDate: `2027-${month}-${day}`,
      });
    }
    const events = b.build();
    const { stats } = bucketStats(projectLedger(events), events, DATE, settings());
    expect(stats.closed_theses).toBe(100);
    expect(stats.measured_theses).toBe(100);
    expect(stats.warnings.map((w) => w.code)).not.toContain("bucket_sample_too_small");
    // Same-day sales keep the order of the file, so the curve is well defined.
    expect(stats.max_drawdown_eur.isZero()).toBe(true);
  });

  it("says nothing instead of dividing by zero when the bucket never traded", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const events = b.build();
    const { stats } = bucketStats(projectLedger(events), events, DATE, settings());
    expect(stats).toMatchObject({
      closed_theses: 0,
      measured_theses: 0,
      realized_operations: 0,
      vs_index_missing: 0,
    });
    expect(stats.hit_rate).toBeUndefined();
    expect(stats.expectancy_eur).toBeUndefined();
    expect(stats.fees_pct).toBeUndefined();
    expect(stats.traded_capital_eur.isZero()).toBe(true);
    expect(stats.max_drawdown_eur.isZero()).toBe(true);
  });
});

describe("bucket control rules (17 and 18)", () => {
  const traded = (extra: Partial<Settings> = {}) =>
    report(bucket([{ id: "t1", buyPrice: "10", sellPrice: "8" }]), extra).controls;

  it("measures the contribution gross, and shows the net beside it", () => {
    const b = bucket([{ id: "t1", buyPrice: "10", sellPrice: "12" }]);
    b.withdrawal({ account_id: "acc_bucket", amount: "1000", value_date: "2027-09-01" });
    const events = b.build();
    const { controls } = bucketStats(projectLedger(events), events, DATE, settings());
    expect(controls.contribution_gross_eur.amount.toString()).toBe("5000");
    expect(controls.contribution_net_eur.amount.toString()).toBe("4000");
  });

  it("warns above the cap and near it, and stays quiet exactly at the limit", () => {
    const codes = (limit: string) =>
      traded({ bucket_max_cumulative_contribution: limit }).warnings.map((w) => w.code);
    expect(codes("4000")).toContain("bucket_contribution_exceeded");
    expect(codes("6000")).toContain("bucket_contribution_near_limit");
    // Exactly at the cap does not fire: the rule is "above".
    expect(codes("5000")).not.toContain("bucket_contribution_exceeded");
    expect(codes("5000")).toContain("bucket_contribution_near_limit");
    // Far from the cap, nothing at all.
    expect(codes("20000")).toEqual([]);
  });

  it("warns about nothing when the thresholds are not configured", () => {
    // The figures are still there (they are data, not alarms); what is missing
    // is the threshold to judge them against, and none is invented.
    expect(traded().warnings).toEqual([]);
    expect(traded().loss_pct?.round(2).toString()).toBe("0.4");
  });

  it("warns when the accumulated loss passes the stop-loss over the gross contribution", () => {
    // 20 of realized loss over 5000 contributed: 0.4 %.
    const controls = traded({ bucket_stop_loss_pct: "0.3" });
    expect(controls.loss_pct?.round(2).toString()).toBe("0.4");
    expect(controls.warnings.map((w) => w.code)).toContain("bucket_stop_loss_reached");
    expect(traded({ bucket_stop_loss_pct: "0.4" }).warnings.map((w) => w.code)).not.toContain(
      "bucket_stop_loss_reached",
    );
  });

  it("says out loud when the stop-loss rule cannot be measured", () => {
    // No deposit: the denominator is zero, so the rule is not evaluated — and a
    // rule that is not evaluated must say so, or its silence reads as "fine".
    const b = new LedgerBuilder();
    catalogue(b);
    trade(b, { id: "t1", buyPrice: "10", sellPrice: "8" });
    const events = b.build();
    const { controls } = bucketStats(
      projectLedger(events),
      events,
      DATE,
      settings({ bucket_stop_loss_pct: "1" }),
    );
    expect(controls.loss_pct).toBeUndefined();
    expect(controls.loss_pct_unavailable).toEqual({ reason: "no_contribution" });
    expect(controls.warnings.map((w) => w.code)).toEqual(["bucket_stop_loss_not_evaluated"]);

    // Without the rule configured there is nothing to fail to evaluate.
    const quiet = bucketStats(projectLedger(events), events, DATE, settings({})).controls;
    expect(quiet.warnings).toEqual([]);
    expect(quiet.loss_pct_unavailable).toEqual({ reason: "no_contribution" });
  });

  it("says out loud when a position without a price switches the two rules off", () => {
    const b = bucket([{ id: "t1", buyPrice: "10", close: false }]);
    const events = b.build();
    const { controls } = bucketStats(
      projectLedger(events),
      events,
      DATE,
      settings({ bucket_stop_loss_pct: "1", bucket_max_weight_pct: "1" }),
    );
    expect(controls.loss_pct_unavailable).toEqual({
      reason: "missing_prices",
      assets: ["ast_spec"],
    });
    expect(controls.weight_pct_unavailable).toEqual({
      reason: "partial_net_worth",
      assets: ["ast_spec"],
      currencies: [],
    });
    expect(controls.warnings.map((w) => w.code)).toEqual([
      "bucket_stop_loss_not_evaluated",
      "bucket_weight_not_evaluated",
    ]);
  });

  it("leaves the weight without data when the net worth is partial, and warns when it is not", () => {
    // An open position with no price makes the bucket, and the net worth, partial.
    const b = bucket([{ id: "t1", buyPrice: "10", close: false }]);
    const events = b.build();
    const partial = bucketStats(
      projectLedger(events),
      events,
      DATE,
      settings({ bucket_max_weight_pct: "1" }),
    ).controls;
    expect(partial.weight_pct).toBeUndefined();
    expect(partial.unrealized_eur).toBeUndefined();
    expect(partial.warnings.map((w) => w.code)).not.toContain("bucket_weight_exceeded");

    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      date: "2027-12-01",
      quantity: "10",
      unit_value: "12",
    });
    const priced = b.build();
    const complete = bucketStats(
      projectLedger(priced),
      priced,
      DATE,
      settings({ bucket_max_weight_pct: "1" }),
    ).controls;
    expect(complete.weight_pct?.round(2).toString()).toBe("2.39");
    expect(complete.warnings.map((w) => w.code)).toContain("bucket_weight_exceeded");
    expect(complete.unrealized_eur?.amount.toString()).toBe("20");
  });

  it("compares the contribution with the budget only when both parameters are set", () => {
    expect(traded().budget_eur).toBeUndefined();
    const controls = traded({ bucket_pct_of_contribution: "10", monthly_contribution_eur: "500" });
    // From 2027-01-01 to 2027-12-31: twelve months of 50 €.
    expect(controls.months_elapsed).toBe(12);
    expect(controls.budget_eur?.amount.toString()).toBe("600");
  });

  it("cuts the contribution at the date asked, like every other view (ADR-0016)", () => {
    const b = bucket([{ id: "t1", buyPrice: "10", sellPrice: "12" }]);
    b.deposit({ account_id: "acc_bucket", amount: "1000", value_date: "2027-11-01" });
    const events = b.build();
    const state = projectLedger(events, { asOf: "2027-06-30" });
    const { controls } = bucketStats(state, events, "2027-06-30", settings(), "2027-06-30");
    expect(controls.contribution_gross_eur.amount.toString()).toBe("5000");
    const whole = bucketStats(projectLedger(events), events, DATE, settings());
    expect(whole.controls.contribution_gross_eur.amount.toString()).toBe("6000");
  });

  it("has no latent total when a position has no cost behind it", () => {
    // The `lots_mismatch` shape again: with no cost there is no latent gain, and
    // a missing row means there is no total either.
    const b = bucket([{ id: "t1", buyPrice: "10", close: false }]);
    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      date: "2027-12-01",
      quantity: "10",
      unit_value: "12",
    });
    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_spec2",
      date: "2027-12-01",
      quantity: "5",
      unit_value: "3",
    });
    const events = b.build();
    const state = projectLedger(events);
    state.positions.set("acc_bucket|ast_spec2", Quantity.parse("5"));
    const { controls } = bucketStats(state, events, DATE, settings());
    expect(controls.unrealized_eur).toBeUndefined();
    expect(controls.loss_pct).toBeUndefined();
  });

  it("counts the months from the first event of the bucket, day of month included", () => {
    const b = bucket([{ id: "t1", buyPrice: "10", sellPrice: "12" }]);
    const events = b.build();
    const state = projectLedger(events);
    const config = { bucket_pct_of_contribution: "10", monthly_contribution_eur: "500" };
    // The first event is on the 1st: a date earlier in the month counts one less.
    expect(bucketStats(state, events, "2027-03-15", settings(config)).controls.months_elapsed).toBe(
      3,
    );
    const b2 = new LedgerBuilder();
    catalogue(b2);
    b2.deposit({ account_id: "acc_bucket", amount: "5000", value_date: "2027-01-20" });
    const events2 = b2.build();
    expect(
      bucketStats(projectLedger(events2), events2, "2027-03-15", settings(config)).controls
        .months_elapsed,
    ).toBe(2);
  });

  it("ignores an event the projection rejected, even in a degraded ledger (ADR-0015)", () => {
    const b = bucket([{ id: "t1", buyPrice: "10", sellPrice: "12" }]);
    // A deposit into an account that does not exist: invalid, and no money.
    b.deposit({ account_id: "acc_ghost", amount: "9000", value_date: "2027-05-01" });
    const events = b.build();
    const state = projectLedger(events, { collectErrors: true });
    expect(state.invalid).toHaveLength(1);
    const { controls } = bucketStats(state, events, DATE, settings());
    expect(controls.contribution_gross_eur.amount.toString()).toBe("5000");
  });

  it("never pushes these warnings into the ledger's own warnings (decision (h))", () => {
    const b = bucket([{ id: "t1", buyPrice: "10", sellPrice: "8" }]);
    const events = b.build();
    const state = projectLedger(events);
    bucketStats(state, events, DATE, settings({ bucket_max_cumulative_contribution: "100" }));
    expect(state.warnings.filter((w) => w.code.startsWith("bucket_"))).toEqual([]);
  });
});
