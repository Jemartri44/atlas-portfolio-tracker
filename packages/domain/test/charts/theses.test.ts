import { describe, expect, it } from "vitest";
import { thesisVsIndexPct } from "../../src/charts.js";
import { Money } from "../../src/money/money.js";
import { type BucketThesisView, bucketTheses } from "../../src/projections/bucket.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const withBenchmark = (extra: Partial<Settings> = {}): Settings =>
  mergeSettings(DEFAULT_SETTINGS, { bucket_benchmark_asset_id: "ast_world", ...extra });

/** Buys 10 at 10 € (100 € invested); the index is priced 100 → 120 when asked. */
const scenario = (options: { index?: boolean; sellAt?: string; valuationAt?: string }) => {
  const b = new LedgerBuilder();
  catalogue(b);
  if (options.index !== false) {
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-01-01",
      unit_value: "100",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-07-01",
      unit_value: "120",
    });
  }
  b.thesisOpened({ thesis_id: "th1" });
  b.buy({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    quantity: "10",
    unit_price: "10",
    fee: "0",
    currency: "EUR",
    fx_rate: "1",
    trade_date: "2027-01-11",
    value_date: "2027-01-13",
    thesis_id: "th1",
  });
  if (options.sellAt !== undefined) {
    b.sell({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: options.sellAt,
      currency: "EUR",
      fx_rate: "1",
      trade_date: "2027-07-12",
      thesis_id: "th1",
    });
    b.thesisClosed("th1");
  }
  if (options.valuationAt !== undefined) {
    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      date: "2027-07-01",
      quantity: "10",
      unit_value: options.valuationAt,
    });
  }
  return b;
};

const row = (b: LedgerBuilder, settings = withBenchmark()): BucketThesisView => {
  const found = bucketTheses(projectLedger(b.build()), "2027-12-31", settings).rows[0];
  if (found === undefined) {
    throw new Error("the scenario has one thesis");
  }
  return found;
};

describe("thesisVsIndexPct", () => {
  it("is each result over what was invested, with the index and the difference in points", () => {
    // 100 € in, sold for 130: +30 %. The index 100 → 120 would have made +20 %.
    const thesis = row(scenario({ sellAt: "13" }));
    const pct = thesisVsIndexPct(thesis);
    expect(pct.thesis_pct?.toString()).toBe("30");
    expect(pct.index_pct?.toString()).toBe("20");
    expect(pct.vs_index_pp?.toString()).toBe("10");
  });

  it("counts the latent gain of an open thesis and keeps the sign of a loss", () => {
    // Open, priced at 8: latent −20 on 100 (−20 %); the index made +20 %: −40 pp.
    const thesis = row(scenario({ valuationAt: "8" }));
    const pct = thesisVsIndexPct(thesis);
    expect(pct.thesis_pct?.toString()).toBe("-20");
    expect(pct.index_pct?.toString()).toBe("20");
    expect(pct.vs_index_pp?.toString()).toBe("-40");
  });

  it("is the difference of the two percentages, to the last decimal that matters", () => {
    const thesis = row(scenario({ sellAt: "13.37" }));
    const pct = thesisVsIndexPct(thesis);
    const { thesis_pct: thesisPct, index_pct: indexPct, vs_index_pp: vs } = pct;
    if (thesisPct === undefined || indexPct === undefined || vs === undefined) {
      throw new Error("the thesis is comparable");
    }
    expect(vs.round(6).toString()).toBe(thesisPct.sub(indexPct).round(6).toString());
  });

  it("has nothing without a comparison: no index set, or no price of the index", () => {
    const none = row(scenario({ sellAt: "13" }), DEFAULT_SETTINGS) as NonNullable<
      ReturnType<typeof row>
    >;
    expect(thesisVsIndexPct(none)).toEqual({});
    const unpriced = row(scenario({ index: false, sellAt: "13" })) as NonNullable<
      ReturnType<typeof row>
    >;
    expect(thesisVsIndexPct(unpriced)).toEqual({});
  });

  it("has nothing when nothing was invested: a share of nothing is not zero", () => {
    const thesis = row(scenario({ sellAt: "13" }));
    expect(thesisVsIndexPct({ ...thesis, invested_eur: Money.zero("EUR") })).toEqual({});
  });
});
