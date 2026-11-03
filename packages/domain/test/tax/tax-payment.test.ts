// Payments of the income tax return (`tax_payment`) and the core's return after the tax it causes.
//
// The return is paid after the year it declares, in one go or split 60 % / 40 % (RIRPF art. 62.2;
// the second instalment by the date the order of each campaign sets: 5/11/2026 for 2025, Orden
// HAC/277/2026 art. 11.5). A refund comes in one go. The payment is of the **whole** return, so it
// is compared with the estimate, never subtracted from the return of the portfolio.
//
// Scale of the savings base from 2025 (arts. 66.1 and 76 LIRPF): 19 % up to 6,000 €, 21 % up to
// 50,000 €. Losses of one box offset up to 25 % of the other's positive balance (art. 49.1).

import { describe, expect, it } from "vitest";
import { coreXirrAfterTax } from "../../src/charts/core-xirr-after-tax.js";
import { ValidationError } from "../../src/errors.js";
import type { Money } from "../../src/money/money.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { snapshotOf } from "../../src/projections/snapshot.js";
import { validateShape } from "../../src/schema/validate.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { SAMPLES } from "../samples.js";

const text = (money: Money | undefined): string | undefined => money?.amount.toString();

describe("the tax_payment event", () => {
  it.each([
    ["a date inside the year it pays", { date: "2027-12-31" }, "payment_before_year_end"],
    ["a refund in instalments", { kind: "refund", instalment: "first" }, "refund_split"],
    ["an amount of zero", { amount_eur: "0" }, "invalid_field"],
    ["an instalment that does not exist", { instalment: "third" }, "invalid_field"],
  ])("is refused with %s", (_, fields, code) => {
    const attempt = () => validateShape({ ...SAMPLES.tax_payment, ...fields });
    expect(attempt).toThrow(ValidationError);
    expect(attempt).toThrow(expect.objectContaining({ code }));
  });

  it("moves no cash, keeps a refund negative, enters the snapshot only when there is one", () => {
    const b = new LedgerBuilder();
    b.account("acc_a");
    expect("tax_payments" in snapshotOf(projectLedger(b.build()))).toBe(false);
    b.taxPayment({ tax_year: 2026, date: "2027-06-25", amount_eur: "300" });
    b.taxPayment({ tax_year: 2027, date: "2028-07-10", amount_eur: "80", kind: "refund" });
    const events = b.build();
    const state = projectLedger(events);
    expect(state.cash.size).toBe(0);
    expect(state.taxPayments.map((entry) => [entry.tax_year, text(entry.amount_eur)])).toEqual([
      [2026, "300"],
      [2027, "-80"],
    ]);
    expect(snapshotOf(state).tax_payments).toHaveLength(2);
    expect(projectLedger(events, { asOf: "2028-07-09" }).taxPayments).toHaveLength(1);
  });

  it("says, never refuses, a repeated instalment and a second one with no first", () => {
    const b = new LedgerBuilder();
    b.taxPayment({ tax_year: 2026, date: "2027-11-05", instalment: "second", amount_eur: "400" });
    b.taxPayment({ date: "2028-06-30", instalment: "first", amount_eur: "600" });
    b.taxPayment({ date: "2028-07-01", instalment: "first", amount_eur: "600" });
    b.taxPayment({ date: "2028-07-02", amount_eur: "10" });
    b.taxPayment({ date: "2028-07-03", amount_eur: "10" });
    const state = projectLedger(b.build());
    expect(state.taxPayments).toHaveLength(5);
    expect(state.warnings.map((w) => [w.code, w.details])).toEqual([
      ["tax_second_without_first", { tax_year: 2026 }],
      ["tax_instalment_repeated", { tax_year: 2027, instalment: "first" }],
    ]);
  });
});

/**
 * The core: 1,000 € deposited on 02/01/2027 buy 10 units of a fund at 100; on 10/06/2027 `sold`
 * units are sold at `price`. At `to` what is left is worth `worth` a unit.
 */
const core = (sold: string, price: string, to: string, worth: string): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2027-01-05" });
  b.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: sold,
    unit_price: price,
    value_date: "2027-06-10",
  });
  b.valuation({
    account_id: "acc_fund",
    asset_id: "ast_world",
    date: to,
    quantity: String(10 - Number(sold)),
    unit_value: worth,
  });
  return b;
};

/** A fund of the bucket bought for 1,000 € and sold whole at `price` on 10/06/2027. */
const bucketSale = (b: LedgerBuilder, price: string): void => {
  b.asset("ast_bfund", { book: "bucket" });
  b.deposit({ account_id: "acc_bucket", amount: "1000", value_date: "2027-01-02" });
  b.thesisOpened({ thesis_id: "t1", asset_id: "ast_bfund", planned_size_eur: "1000" });
  b.buy({
    account_id: "acc_bucket",
    asset_id: "ast_bfund",
    thesis_id: "t1",
    trade_date: "2027-01-05",
  });
  b.sell({
    account_id: "acc_bucket",
    asset_id: "ast_bfund",
    quantity: "10",
    unit_price: price,
    value_date: "2027-06-10",
  });
};

const ONE_YEAR = "2028-01-02";

describe("the core's return after tax", () => {
  it("counts the tax of the year as one more contribution: 1,000 → 1,200 less 19 is +18.1 %", () => {
    // 5 units sold at 120: a gain of 100, 19 € at 19 %, owed on 30/06/2028, after the end date:
    // it counts at the end. 1,000 · (1 + r) + 19 = 1,200 → r = 18.1 %.
    const result = coreXirrAfterTax(core("5", "120", ONE_YEAR, "120").build(), ONE_YEAR);
    expect(result.before.xirr_pct?.toString()).toBe("20");
    expect(result.years).toEqual([
      expect.objectContaining({
        year: 2027,
        dated: [expect.objectContaining({ date: "2028-06-30" })],
      }),
    ]);
    expect(text(result.years[0]?.added_eur)).toBe("19");
    expect(result.years[0]?.core_share_pct?.toString()).toBe("100");
    expect(result.years[0]?.notes).toContain("scale_after_check");
    expect(text(result.tax_eur)).toBe("19");
    expect(text(result.gain_eur)).toBe("181");
    expect(result.xirr_pct?.toString()).toBe("18.1");
    expect(result.criteria).toEqual(["27", "29"]);
  });

  it("charges only what the portfolio adds over the income from outside, dated on each instalment", () => {
    // Outside: 6,000 of dividends with 1,140 withheld fill the 19 % bracket: alone, 1,140 − 1,140 = 0.
    // With the core's 100 of gain the base is 6,100: 1,140 + 100 · 21 % − 1,140 = 21. Paid 600 and
    // 400 (the whole return): 21 · 0.6 = 12.6 on 30/06/2028 and 21 · 0.4 = 8.4 on 05/11/2028.
    const to = "2029-01-02";
    const b = core("5", "120", to, "120");
    b.externalIncome({ value_date: "2027-06-30", gross_eur: "6000", withholding_eur: "1140" });
    b.taxPayment({ date: "2028-06-30", amount_eur: "600", instalment: "first" });
    b.taxPayment({ date: "2028-11-05", amount_eur: "400", instalment: "second" });
    const result = coreXirrAfterTax(b.build(), to);
    const [y2027, y2028] = result.years;
    expect(text(y2027?.added_eur)).toBe("21");
    expect(y2027?.dated.map((flow) => [flow.date, text(flow.eur)])).toEqual([
      ["2028-06-30", "12.6"],
      ["2028-11-05", "8.4"],
    ]);
    // 2028 has nothing of its own: nothing added, nothing to split.
    expect(text(y2028?.added_eur)).toBe("0");
    expect(y2028?.core_share_pct?.toString()).toBe("0");
    expect(y2028?.dated).toEqual([]);
    expect(text(result.tax_eur)).toBe("21");
    expect(result.criteria).toEqual(["27", "28", "29"]);
    // 731, 186 and 58 days to the end date.
    const rate = Number(result.xirr_pct?.toString()) / 100;
    const grown =
      1000 * (1 + rate) ** (731 / 365) +
      12.6 * (1 + rate) ** (186 / 365) +
      8.4 * (1 + rate) ** (58 / 365);
    expect(grown).toBeCloseTo(1200, 2);
  });

  it("leaves out an income from outside that was reversed", () => {
    // Only the core's 100 of gain is left in the base: 19 €, as with nothing from outside.
    const b = core("5", "120", ONE_YEAR, "120");
    const outside = b.externalIncome({
      value_date: "2027-06-30",
      gross_eur: "6000",
      withholding_eur: "1140",
    });
    b.reversal(outside.id);
    expect(text(coreXirrAfterTax(b.build(), ONE_YEAR).tax_eur)).toBe("19");
  });

  it.each([
    // Core +100, bucket +300: base 400, 76 € of tax, the core's 25 % is 19.
    ["a quarter", "130", "76", "25", "19"],
    // Core +100, bucket −50: base 50, 9.5 €; the core brings 200 % of it, bounded to all of it.
    ["all of it when the bucket's loss is smaller", "95", "9.5", "100", "9.5"],
  ])(
    "splits the tax with the bucket by what each adds to the base: %s",
    (_, price, added, share, cost) => {
      const b = core("5", "120", ONE_YEAR, "120");
      bucketSale(b, price);
      const [year] = coreXirrAfterTax(b.build(), ONE_YEAR).years;
      expect([
        text(year?.added_eur),
        year?.core_share_pct?.toString(),
        text(year?.core_eur),
      ]).toEqual([added, share, cost]);
    },
  );

  it("counts every line of the year in its own book: income, expenses, exchange differences", () => {
    // Core: +100 of gain, +100 of dividend, −3 of custody: 197. Bucket: 1,000 € bought 1,200 $ at
    // 1.2 and sold them for 1,100 €: +100 of exchange difference. Base 297: each half at 9.5 % is
    // 28.215, rounded 28.22, so 56.44 €; the core's share is 197 / 297, so 37.44 €.
    const b = core("5", "120", ONE_YEAR, "120");
    b.dividend({
      account_id: "acc_fund",
      asset_id: "ast_world",
      gross: "100",
      value_date: "2027-04-01",
    });
    b.fee({ account_id: "acc_fund", amount: "3", value_date: "2027-06-30", fee_kind: "custody" });
    b.deposit({ account_id: "acc_bucket", amount: "1000", value_date: "2027-01-02" });
    b.fx({
      account_id: "acc_bucket",
      value_date: "2027-03-01",
      sold_amount: "1000",
      sold_currency: "EUR",
      bought_amount: "1200",
      bought_currency: "USD",
      fee: "0",
      fx_rate_sold: "1",
      fx_rate_bought: "1.2",
      fx_rate_date: "2027-03-01",
    });
    b.fx({
      account_id: "acc_bucket",
      value_date: "2027-05-03",
      sold_amount: "1200",
      sold_currency: "USD",
      bought_amount: "1100",
      bought_currency: "EUR",
      fee: "0",
      fee_currency: "EUR",
      fx_rate_sold: "1.090909",
      fx_rate_bought: "1",
      fx_rate_date: "2027-05-03",
    });
    const [year] = coreXirrAfterTax(b.build(), ONE_YEAR).years;
    expect(text(year?.added_eur)).toBe("56.44");
    expect(year?.core_eur?.roundToCents().amount.toString()).toBe("37.44");
  });

  it("charges the core nothing when its loss is what the bucket's gain overcomes", () => {
    // Core −100 (5 sold at 80), bucket +300: base 200, 38 € of tax; the core's share would be
    // negative, so it is none.
    const b = core("5", "80", ONE_YEAR, "80");
    bucketSale(b, "130");
    const [year] = coreXirrAfterTax(b.build(), ONE_YEAR).years;
    expect([text(year?.added_eur), year?.core_share_pct?.toString(), year?.dated]).toEqual([
      "38",
      "0",
      [],
    ]);
  });

  it("gives back what the core's loss saves on the income from outside, on the day of the refund", () => {
    // Core −100; outside 1,000 with 190 withheld. The loss offsets 100 of the dividends (≤ 25 %):
    // base 900, 171 − 190 = −19; alone, 190 − 190 = 0. The core saves 19, refunded on 15/07/2028.
    // 1,000 · (1 + r) − 19 = 800 → r = −18.1 %.
    const b = core("5", "80", ONE_YEAR, "80");
    b.externalIncome({ value_date: "2027-06-30", gross_eur: "1000", withholding_eur: "190" });
    b.taxPayment({ date: "2028-07-15", amount_eur: "50", kind: "refund" });
    const result = coreXirrAfterTax(b.build(), ONE_YEAR);
    expect(result.years[0]?.dated.map((flow) => [flow.date, text(flow.eur)])).toEqual([
      ["2028-07-15", "-19"],
    ]);
    expect([text(result.tax_eur), text(result.gain_eur)]).toEqual(["-19", "-181"]);
    expect(result.xirr_pct?.toString()).toBe("-18.1");
  });

  it("gives no figure, and says why, when the one before has none", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    expect(coreXirrAfterTax(b.build(), ONE_YEAR)).toMatchObject({ gap: "before", years: [] });
  });

  it("gives no figure for a ledger with invalid events", () => {
    const b = core("5", "120", ONE_YEAR, "120");
    b.sell({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "1",
      value_date: "2027-07-01",
    });
    expect(coreXirrAfterTax(b.build(), ONE_YEAR).gap).toBe("invalid");
  });

  it("gives no figure when a closed year is before the regime of 2018, and names it", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2017-01-02" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2017-01-05" });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2018-01-02",
      quantity: "10",
      unit_value: "110",
    });
    const result = coreXirrAfterTax(b.build(), "2018-01-02");
    expect(result.gap).toBe("year");
    expect(result.years).toEqual([{ year: 2017, dated: [], notes: [], gap: "unsupported" }]);
  });

  it("gives no rate when the tax is more than what is left", () => {
    // A gain of 1,000 (190 € of tax) put into bonds that end worth 20: 1,000 · (1 + r) + 190 = 20
    // has no root above −99 %, though the rate before (−98 %) has one.
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2027-01-05" });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "200",
      value_date: "2027-02-01",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      quantity: "20",
      trade_date: "2027-02-02",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      date: ONE_YEAR,
      quantity: "20",
      unit_value: "1",
    });
    const result = coreXirrAfterTax(b.build(), ONE_YEAR);
    expect(result.before.xirr_pct?.toString()).toBe("-98");
    expect(text(result.tax_eur)).toBe("190");
    expect(result.gap).toBe("no_rate");
  });
});
