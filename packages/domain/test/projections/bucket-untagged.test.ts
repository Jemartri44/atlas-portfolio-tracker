// The thesis is optional (rule 15): what the bucket bought with none still
// counts in the comparison with the index (rule 16), and stays out of every
// thesis statistic.

import { describe, expect, it } from "vitest";
import { bucketIndexSeries } from "../../src/charts/bucket-index.js";
import { bucketStats } from "../../src/projections/bucket-stats.js";
import { bucketTheses } from "../../src/projections/bucket-theses.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const settings = mergeSettings(DEFAULT_SETTINGS, {
  bucket_benchmark_asset_id: "ast_world",
  stale_price_days: 400,
});
const EUR = { currency: "EUR", fx_rate: "1" } as const;

/** 10 shares at 10 € on 01/11, sold at 13 € on 07/12; the index goes 100 → 120. */
const ledger = (steps: { thesisBuy?: boolean; thesisSell?: boolean }) => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.settings(settings);
  for (const [date, unit_value] of [
    ["2027-01-01", "100"],
    ["2027-07-01", "120"],
  ] as const) {
    b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date, unit_value });
  }
  b.deposit({ account_id: "acc_bucket", amount: "1000" });
  if (steps.thesisBuy === true) {
    b.thesisOpened({ thesis_id: "th1" });
  }
  b.buy({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    quantity: "10",
    unit_price: "10",
    fee: "0",
    ...EUR,
    trade_date: "2027-01-11",
    value_date: "2027-01-13",
    ...(steps.thesisBuy === true ? { thesis_id: "th1" } : {}),
  });
  b.sell({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    quantity: "10",
    unit_price: "13",
    ...EUR,
    trade_date: "2027-07-12",
    ...(steps.thesisSell === true ? { thesis_id: "th1" } : {}),
  });
  if (steps.thesisBuy === true && steps.thesisSell === true) {
    b.thesisClosed("th1");
  }
  return b;
};

const vsIndex = (b: LedgerBuilder) => {
  const events = b.build();
  const state = projectLedger(events);
  return {
    view: bucketTheses(state, "2027-12-31", settings),
    stats: bucketStats(state, events, "2027-12-31", settings).stats,
    events,
  };
};

describe("a bucket operation with no thesis", () => {
  it("is measured against the index like a thesis would be, with the same figures", () => {
    const withThesis = vsIndex(ledger({ thesisBuy: true, thesisSell: true }));
    const without = vsIndex(ledger({}));

    expect(withThesis.view.untagged).toEqual([]);
    expect(without.view.rows).toEqual([]);
    const [pair] = without.view.untagged;
    const [thesis] = withThesis.view.rows;
    expect(pair?.benchmark_equivalent_eur?.amount.toString()).toBe("120");
    expect(pair?.result_vs_index_eur?.amount.toString()).toBe("10");
    expect(pair?.status).toBe("closed");
    expect(pair?.result_vs_index_eur).toEqual(thesis?.result_vs_index_eur);
    expect(without.stats.vs_index_total_eur?.amount.toString()).toBe("10");
    expect(without.stats.vs_index_total_eur).toEqual(withThesis.stats.vs_index_total_eur);
    expect(without.stats.vs_index_missing).toBe(0);
  });

  it("stays out of the thesis statistics", () => {
    const { stats } = vsIndex(ledger({}));
    expect(stats.closed_theses).toBe(0);
    expect(stats.measured_theses).toBe(0);
    expect(stats.hit_rate).toBeUndefined();
    expect(stats.excluded).toEqual([]);
  });

  it("draws the curve of the index comparison", () => {
    const withThesis = bucketIndexSeries(ledger({ thesisBuy: true, thesisSell: true }).build(), {
      to: "2027-07-31",
    });
    const without = bucketIndexSeries(ledger({}).build(), { to: "2027-07-31" });
    expect(without.points.map((p) => p.vs_index_eur)).toEqual(
      withThesis.points.map((p) => p.vs_index_eur),
    );
    expect(without.points.at(-1)?.vs_index_eur?.amount.toString()).toBe("10");
  });

  it("splits a pair between the thesis and the rest without losing or counting twice", () => {
    // Thesis buys 10, a buy with none adds 10 more, then a sale with none takes
    // 10 (FIFO: the thesis's lot) and a sale with the thesis takes the rest.
    const b = new LedgerBuilder();
    catalogue(b);
    b.settings(settings);
    for (const [date, unit_value] of [
      ["2027-01-01", "100"],
      ["2027-07-01", "120"],
    ] as const) {
      b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date, unit_value });
    }
    b.thesisOpened({ thesis_id: "th1" });
    const buy = (date: string, thesis?: string) =>
      b.buy({
        account_id: "acc_bucket",
        asset_id: "ast_spec",
        quantity: "10",
        unit_price: "10",
        fee: "0",
        ...EUR,
        trade_date: date,
        value_date: date,
        ...(thesis === undefined ? {} : { thesis_id: thesis }),
      });
    buy("2027-01-11", "th1");
    buy("2027-01-12");
    for (const thesis of [undefined, "th1"]) {
      b.sell({
        account_id: "acc_bucket",
        asset_id: "ast_spec",
        quantity: "10",
        unit_price: "13",
        ...EUR,
        trade_date: "2027-07-12",
        ...(thesis === undefined ? {} : { thesis_id: thesis }),
      });
    }
    const { view } = vsIndex(b);
    const parts = [...view.rows, ...view.untagged];
    expect(parts).toHaveLength(2);
    // All the realised gain of the bucket is in exactly one of the two.
    const realised = parts.reduce((sum, p) => sum + Number(p.result_eur.amount.toString()), 0);
    expect(realised).toBe(60);
    // Every euro put in is in exactly one of the two.
    const invested = parts.reduce((sum, p) => sum + Number(p.invested_eur.amount.toString()), 0);
    expect(invested).toBe(200);
    expect(parts.every((p) => p.result_vs_index_eur !== undefined)).toBe(true);
  });

  it("reports an untagged pair that cannot be compared, like a thesis", () => {
    const { stats } = vsIndex(
      (() => {
        const b = new LedgerBuilder();
        catalogue(b);
        b.settings(settings);
        b.buy({
          account_id: "acc_bucket",
          asset_id: "ast_spec",
          quantity: "1",
          unit_price: "10",
          fee: "0",
          ...EUR,
          trade_date: "2027-01-11",
          value_date: "2027-01-11",
        });
        return b;
      })(),
    );
    expect(stats.vs_index_total_eur).toBeUndefined();
    expect(stats.vs_index_missing).toBe(1);
  });
});
