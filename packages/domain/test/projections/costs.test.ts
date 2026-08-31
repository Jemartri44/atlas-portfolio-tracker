import { describe, expect, it } from "vitest";
import { costSummary } from "../../src/projections/costs.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";

const summary = (events: LedgerEvent[]) =>
  costSummary(projectLedger(events), events, DATE, DEFAULT_SETTINGS);

const rowOf = (result: ReturnType<typeof summary>, assetId: string) =>
  result.core.rows.find((row) => row.asset_id === assetId);

/** A core with commissions and a valued position, plus a bucket that also trades. */
const traded = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "10",
    unit_price: "100",
    fee: "5",
  });
  b.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "2",
    unit_price: "110",
    fee: "3",
  });
  b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date: DATE, unit_value: "120" });
  return b;
};

describe("costSummary", () => {
  it("adds up the commissions of buys and sells per core asset, as a share of what was invested", () => {
    const b = traded();
    const result = summary(b.build());
    const row = rowOf(result, "ast_world");
    expect(row?.fees_eur.amount.toString()).toBe("8");
    expect(row?.invested_eur.amount.toString()).toBe("1005");
    expect(row?.fees_pct?.round(4).toString()).toBe("0.796");
    expect(row?.value_eur?.amount.toString()).toBe("960");
  });

  it("converts a commission in another currency at the rate of its event", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      quantity: "4",
      unit_price: "200",
      currency: "USD",
      fx_rate: "1.25",
      fee: "5",
    });
    const row = rowOf(summary(b.build()), "ast_gold");
    expect(row?.fees_eur.amount.toString()).toBe("4");
    expect(row?.invested_eur.amount.toString()).toBe("644");
  });

  it("takes the settled amount as the cost basis when the buy carries one", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "5.5871",
      unit_price: "107.39",
      amount: "600",
      fee: "2",
    });
    // 600 settled plus the 2 of commission: `amount` is the basis and
    // `unit_price` stays informative (ADR-0012).
    expect(rowOf(summary(b.build()), "ast_world")?.invested_eur.amount.toString()).toBe("602");
  });

  it("does not count the commission of a reversed event", () => {
    const b = traded();
    const extra = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "1",
      unit_price: "100",
      fee: "99",
    });
    b.reversal(extra.id);
    expect(rowOf(summary(b.build()), "ast_world")?.fees_eur.amount.toString()).toBe("8");
  });

  it("counts the commission of a forced sale like that of a sale (Q2)", () => {
    const b = traded();
    b.corporateAction({
      kind: "reverse_split",
      asset_id: "ast_world",
      effective_date: "2027-06-30",
      source_document: "doc",
      effects: [
        { op: "scale", ratio: "1/4" },
        {
          op: "forced_sale",
          per_account: [{ account_id: "acc_fund", quantity: "all", fee: "2" }],
          unit_price: "100",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-06-30",
        },
      ],
    });
    expect(rowOf(summary(b.build()), "ast_world")?.fees_eur.amount.toString()).toBe("10");
  });

  it("ignores a forced sale entry with no fee, and books a bucket one to its account", () => {
    const b = traded();
    b.thesisOpened({ thesis_id: "th", account_id: "acc_bucket", asset_id: "ast_spec" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "8",
      unit_price: "50",
      thesis_id: "th",
    });
    b.corporateAction({
      kind: "reverse_split",
      asset_id: "ast_spec",
      effective_date: "2027-06-30",
      source_document: "doc",
      effects: [
        { op: "scale", ratio: "1/3" },
        {
          op: "forced_sale",
          // No fee on this broker's charge: the entry is simply skipped.
          per_account: [{ account_id: "acc_bucket", quantity: "all" }],
          unit_price: "100",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-06-30",
        },
      ],
    });
    expect(summary(b.build()).bucket.rows[0]?.fees_eur.amount.toString()).toBe("0");

    const c = traded();
    c.thesisOpened({ thesis_id: "th", account_id: "acc_bucket", asset_id: "ast_spec" });
    c.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "8",
      unit_price: "50",
      thesis_id: "th",
    });
    c.corporateAction({
      kind: "reverse_split",
      asset_id: "ast_spec",
      effective_date: "2027-06-30",
      source_document: "doc",
      effects: [
        { op: "scale", ratio: "1/3" },
        {
          op: "forced_sale",
          per_account: [{ account_id: "acc_bucket", quantity: "all", fee: "4" }],
          unit_price: "100",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-06-30",
        },
      ],
    });
    const result = summary(c.build());
    expect(result.bucket.rows[0]?.fees_eur.amount.toString()).toBe("4");
    // Never in the core: the two books do not share a euro.
    expect(result.core.totals.fees_eur.amount.toString()).toBe("8");
  });

  it("leaves the percentage empty when the asset was never bought", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10", unit_price: "100" });
    b.transfer({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_out: "5",
      nav_out: "100",
      value_date_out: "2027-06-30",
      quantity_in: "5",
      nav_in: "100",
      value_date_in: "2027-07-02",
    });
    const transferOnly = summary(b.build());
    // ast_bonds only ever received a transfer: it never traded, so it has no row.
    expect(rowOf(transferOnly, "ast_bonds")).toBeUndefined();
    expect(rowOf(transferOnly, "ast_world")?.fees_pct).toBeDefined();

    // Once it is sold it does have a commission, but still nothing invested.
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      trade_date: "2027-08-02",
      quantity: "5",
      unit_price: "100",
      fee: "1",
    });
    const sold = rowOf(summary(b.build()), "ast_bonds");
    expect(sold?.fees_eur.amount.toString()).toBe("1");
    expect(sold?.invested_eur.amount.toString()).toBe("0");
    expect(sold?.fees_pct).toBeUndefined();
  });

  it("weights the TER by value and marks the aggregate partial when a price is missing", () => {
    const b = traded();
    b.asset("ast_low", { asset_class: "fixed_income", ter: "0.05" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_low", quantity: "10", unit_price: "10" });
    const withoutPrice = summary(b.build());
    expect(withoutPrice.core.totals.partial).toBe(true);
    b.valuation({ account_id: "acc_fund", asset_id: "ast_low", date: DATE, unit_value: "10" });
    const priced = summary(b.build());
    expect(priced.core.totals.partial).toBe(false);
    expect(priced.core.totals.value_eur.amount.toString()).toBe("1060");
    // ast_world has no declared TER in the test catalogue, so only ast_low weighs in.
    expect(priced.core.totals.weighted_ter?.round(6).toString()).toBe("0.004717");
    expect(priced.core.totals.annual_cost_eur?.amount.toString()).toBe("0.05");
  });

  it("keeps the bucket in its own table, per account and never mixed with the core", () => {
    const b = traded();
    b.thesisOpened({ thesis_id: "th", account_id: "acc_bucket", asset_id: "ast_spec" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: "50",
      fee: "7",
      thesis_id: "th",
    });
    const result = summary(b.build());
    expect(result.bucket.rows).toEqual([expect.objectContaining({ account_id: "acc_bucket" })]);
    expect(result.bucket.rows[0]?.fees_eur.amount.toString()).toBe("7");
    expect(result.core.rows.map((row) => row.asset_id)).not.toContain("ast_spec");
    expect(result.core.totals.fees_eur.amount.toString()).toBe("8");
  });

  it("answers with empty tables on a ledger that never traded", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const result = summary(b.build());
    expect(result.core.rows).toEqual([]);
    expect(result.bucket.rows).toEqual([]);
    expect(result.core.totals.partial).toBe(false);
    expect(result.core.totals.weighted_ter).toBeUndefined();
  });
});
