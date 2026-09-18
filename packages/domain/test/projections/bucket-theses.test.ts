import { describe, expect, it } from "vitest";
import { bucketTheses } from "../../src/projections/bucket.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const withBenchmark = (extra: Partial<Settings> = {}): Settings =>
  mergeSettings(DEFAULT_SETTINGS, { bucket_benchmark_asset_id: "ast_world", ...extra });

/**
 * A thesis that buys 10 shares at 10 € on 2027-01-11 and sells them at 13 € on
 * 2027-07-12, with the index priced on both dates. Everything in euros, so the
 * arithmetic can be checked by hand, which is the point of the metric.
 */
const scenario = (options: { indexStart?: string; indexEnd?: string; sell?: boolean } = {}) => {
  const b = new LedgerBuilder();
  catalogue(b);
  if (options.indexStart !== undefined) {
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-01-01",
      unit_value: options.indexStart,
    });
  }
  if (options.indexEnd !== undefined) {
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-07-01",
      unit_value: options.indexEnd,
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
  if (options.sell === true) {
    b.sell({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: "13",
      currency: "EUR",
      fx_rate: "1",
      trade_date: "2027-07-12",
      thesis_id: "th1",
    });
    b.thesisClosed("th1");
  }
  return b;
};

const view = (b: LedgerBuilder, settings = withBenchmark(), date = "2027-12-31") =>
  bucketTheses(projectLedger(b.build()), date, settings)[0];

describe("bucketTheses: the result against the index (business rule 16)", () => {
  it("values the same money in the index between the same dates", () => {
    // 100 € invested; the index goes from 100 to 120, so it would be worth 120.
    // The thesis sold for 130, so it beat the index by 10.
    const closed = view(scenario({ indexStart: "100", indexEnd: "120", sell: true }));
    expect(closed?.benchmark_equivalent_eur?.amount.toString()).toBe("120");
    expect(closed?.result_eur.amount.toString()).toBe("30");
    expect(closed?.unrealized_eur?.isZero()).toBe(true);
    expect(closed?.result_vs_index_eur?.amount.toString()).toBe("10");
    expect(closed?.missing_benchmark).toEqual([]);
  });

  it("is exactly zero when the asset and the index return the same", () => {
    // The thesis makes 30 on 100; the index goes from 100 to 130: a tie.
    const tie = view(scenario({ indexStart: "100", indexEnd: "130", sell: true }));
    expect(tie?.result_vs_index_eur?.isZero()).toBe(true);
  });

  it("uses the latent gain of an open thesis, not the value of its position", () => {
    // Open, priced at 13: latent 30 on a cost of 100, index 100 → 120.
    const b = scenario({ indexStart: "100", indexEnd: "120" });
    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      date: "2027-07-01",
      quantity: "10",
      unit_value: "13",
    });
    const open = view(b);
    expect(open?.status).toBe("open");
    expect(open?.unrealized_eur?.amount.toString()).toBe("30");
    // (0 + 30) − (120 − 100) = 10, not 130 − 20 as the literal reading of the
    // prompt gave (Q1: the prompt was corrected).
    expect(open?.result_vs_index_eur?.amount.toString()).toBe("10");
  });

  it("has no comparison without a benchmark configured", () => {
    const none = view(
      scenario({ indexStart: "100", indexEnd: "120", sell: true }),
      DEFAULT_SETTINGS,
    );
    expect(none?.benchmark_equivalent_eur).toBeUndefined();
    expect(none?.result_vs_index_eur).toBeUndefined();
    expect(none?.missing_benchmark).toEqual([{ reason: "no_benchmark" }]);
  });

  it("has no comparison when the benchmark is not in the catalogue", () => {
    const unknown = view(
      scenario({ indexStart: "100", indexEnd: "120", sell: true }),
      withBenchmark({ bucket_benchmark_asset_id: "ast_typo" }),
    );
    expect(unknown?.result_vs_index_eur).toBeUndefined();
    expect(unknown?.missing_benchmark).toEqual([{ reason: "unknown_asset", asset_id: "ast_typo" }]);
  });

  it("has no comparison when the index has no price at all", () => {
    const priceless = view(scenario({ sell: true }));
    expect(priceless?.benchmark_equivalent_eur).toBeUndefined();
    expect(priceless?.missing_benchmark).toEqual([
      { reason: "no_price", asset_id: "ast_world", date: "2027-07-12" },
    ]);
  });

  it("has no comparison when a purchase predates the first price of the index", () => {
    // The index is only priced from July: the January purchase has no P(d_i).
    const late = view(scenario({ indexEnd: "120", sell: true }));
    expect(late?.benchmark_equivalent_eur).toBeUndefined();
    expect(late?.missing_benchmark).toEqual([
      { reason: "no_price", asset_id: "ast_world", date: "2027-01-11" },
    ]);
  });

  it("has no comparison for an open thesis whose own asset has no price", () => {
    const open = view(scenario({ indexStart: "100", indexEnd: "120" }));
    expect(open?.unrealized_eur).toBeUndefined();
    expect(open?.result_vs_index_eur).toBeUndefined();
    expect(open?.missing_benchmark).toContainEqual({
      reason: "no_asset_price",
      asset_id: "ast_spec",
      date: "2027-12-31",
    });
    // The thesis is still listed: it exists, and its numbers from the ledger are shown.
    expect(open?.thesis_id).toBe("th1");
    expect(open?.invested_eur.amount.toString()).toBe("100");
  });

  it("has no comparison for a thesis with no linked purchase", () => {
    // A thesis opened after a swap, which only sells what it inherited: the sum
    // over its purchases is empty, and an empty sum is no data, never zero (Q6).
    const b = new LedgerBuilder();
    catalogue(b);
    b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date: "2027-01-01" });
    b.thesisOpened({ thesis_id: "th_empty" });
    b.thesisClosed("th_empty");
    const empty = bucketTheses(projectLedger(b.build()), "2027-12-31", withBenchmark())[0];
    expect(empty?.benchmark_equivalent_eur).toBeUndefined();
    expect(empty?.missing_benchmark).toEqual([{ reason: "no_linked_buys" }]);
  });

  it("measures a closed thesis to its last sale, not to today", () => {
    const b = scenario({ indexStart: "100", indexEnd: "120", sell: true });
    // A later price of the index must not move a comparison that ended in July.
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-11-01",
      unit_value: "200",
    });
    expect(view(b)?.benchmark_equivalent_eur?.amount.toString()).toBe("120");
  });
});
