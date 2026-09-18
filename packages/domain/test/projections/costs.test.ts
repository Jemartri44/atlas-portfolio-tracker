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
  it("ignores a commission whose business date is after the cut (asOf)", () => {
    const b = traded();
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2028-02-01",
      quantity: "1",
      unit_price: "100",
      fee: "50",
    });
    const events = b.build();
    const cut = costSummary(
      projectLedger(events, { asOf: DATE }),
      events,
      DATE,
      DEFAULT_SETTINGS,
      DATE,
    );
    expect(rowOf(cut, "ast_world")?.fees_eur.amount.toString()).toBe("8");
    // Without the cut the fee of 2028 counts in a table dated 2027.
    expect(rowOf(summary(events), "ast_world")?.fees_eur.amount.toString()).toBe("58");
  });

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

  it("does not count the commission of an invalid event (degraded ledger)", () => {
    const b = traded();
    // More than the position holds: the projection rejects it, so its fee is
    // not a cost of the portfolio either.
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-08-02",
      quantity: "999",
      unit_price: "110",
      fee: "100",
    });
    const events = b.build();
    const state = projectLedger(events, { collectErrors: true });
    expect(state.invalid).toHaveLength(1);
    const result = costSummary(state, events, DATE, DEFAULT_SETTINGS);
    expect(rowOf(result, "ast_world")?.fees_eur.amount.toString()).toBe("8");
  });

  it("leaves an operation of an unknown account outside both books", () => {
    // A degraded ledger where the `account_created` did not survive: the
    // account has no book, and "not bucket" must not mean "core".
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
    const events = b.build();
    const state = projectLedger(events);
    state.accounts.delete("acc_fund");
    const result = costSummary(state, events, DATE, DEFAULT_SETTINGS);
    expect(result.core.totals.fees_eur.amount.toString()).toBe("0");
    expect(result.bucket.rows).toEqual([]);
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
    // ast_bonds only ever received a transfer: it is held (so it weighs in the
    // TER) but nothing was invested in it, so it has no percentage.
    const received = rowOf(transferOnly, "ast_bonds");
    expect(received?.fees_eur.amount.toString()).toBe("0");
    expect(received?.invested_eur.amount.toString()).toBe("0");
    expect(received?.fees_pct).toBeUndefined();
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

  it("keeps an asset that arrived by conversion out of the table only when it is gone", () => {
    const b = traded();
    b.asset("ast_new", { asset_class: "equity", ter: "0.09" });
    // Never traded and never held: nothing to report.
    expect(rowOf(summary(b.build()), "ast_new")).toBeUndefined();
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

/**
 * Charges that never touch the fiscal basis (art. 35 LIRPF,
 * `docs/business-rules.md` §5.2). Until this feature they were in the ledger and
 * in **no** view of either interface: the user could not see what custody cost.
 */
describe("costSummary: standalone fees", () => {
  it("adds them up per account, with a total per book and never one shared", () => {
    const b = traded();
    b.fee({
      account_id: "acc_fund",
      value_date: "2027-03-31",
      amount: "12",
      description: "custodia",
    });
    b.fee({
      account_id: "acc_fund",
      value_date: "2027-06-30",
      amount: "12",
      description: "custodia",
    });
    b.fee({
      account_id: "acc_bucket",
      value_date: "2027-06-30",
      amount: "9",
      description: "conectividad",
    });
    const events = b.build();

    const { standalone } = summary(events);

    expect(
      standalone.rows.map((row) => [row.account_id, row.book, row.fees_eur.amount.toString()]),
    ).toEqual([
      ["acc_bucket", "bucket", "9"],
      ["acc_fund", "core", "24"],
    ]);
    expect(standalone.core_eur.amount.toString()).toBe("24");
    expect(standalone.bucket_eur.amount.toString()).toBe("9");
  });

  it("keeps them out of the acquisition cost and out of the commissions of a trade", () => {
    const b = traded();
    b.fee({ account_id: "acc_fund", value_date: "2027-06-30", amount: "50" });
    const withFee = summary(b.build());
    const withoutFee = summary(traded().build());

    expect(withFee.core.totals.fees_eur.amount.toString()).toBe(
      withoutFee.core.totals.fees_eur.amount.toString(),
    );
    expect(withFee.core.totals.invested_eur.amount.toString()).toBe(
      withoutFee.core.totals.invested_eur.amount.toString(),
    );
    expect(withFee.standalone.core_eur.amount.toString()).toBe("50");
  });

  it("converts a charge in another currency with its own rate", () => {
    const b = traded();
    b.fee({
      account_id: "acc_etf",
      value_date: "2027-06-30",
      amount: "11",
      currency: "USD",
      fx_rate: "1.1",
      fx_rate_date: "2027-06-30",
    });
    const { standalone } = summary(b.build());

    expect(standalone.rows[0]?.fees_eur.amount.toString()).toBe("10");
  });

  it("dates the rate by the value date when the charge carries no fx_rate_date", () => {
    const b = traded();
    b.fee({
      account_id: "acc_etf",
      value_date: "2027-06-30",
      amount: "22",
      currency: "USD",
      fx_rate: "2",
    });
    const { standalone } = summary(b.build());

    expect(standalone.rows[0]?.fees_eur.amount.toString()).toBe("11");
  });

  it("does not count a reversed charge: it never happened", () => {
    const b = traded();
    const fee = b.fee({ account_id: "acc_fund", value_date: "2027-06-30", amount: "40" });
    b.reversal(fee.id, "cargo duplicado");
    const { standalone } = summary(b.build());

    expect(standalone.rows).toEqual([]);
    expect(standalone.core_eur.amount.toString()).toBe("0");
  });

  it("cuts by the business date, like every other cost", () => {
    const b = traded();
    b.fee({ account_id: "acc_fund", value_date: "2028-01-31", amount: "40" });
    const events = b.build();

    const upToDate = costSummary(
      projectLedger(events, { asOf: DATE }),
      events,
      DATE,
      DEFAULT_SETTINGS,
      DATE,
    );

    expect(upToDate.standalone.core_eur.amount.toString()).toBe("0");
    expect(summary(events).standalone.core_eur.amount.toString()).toBe("40");
  });

  it("leaves out a charge on an account the catalogue does not know, instead of guessing its book", () => {
    const b = traded();
    const events = b.build();
    const orphan = {
      ...b.fee({ account_id: "acc_fund", value_date: "2027-06-30", amount: "7" }),
      account_id: "acc_ghost",
    };
    const state = projectLedger(events, { collectErrors: true });

    const { standalone } = costSummary(state, [...events, orphan], DATE, DEFAULT_SETTINGS);

    expect(standalone.rows).toEqual([]);
  });

  it("says nothing when there are none", () => {
    expect(summary(traded().build()).standalone).toEqual({
      rows: [],
      core_eur: expect.objectContaining({}),
      bucket_eur: expect.objectContaining({}),
    });
  });
});
