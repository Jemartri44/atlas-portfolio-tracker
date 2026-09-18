// The less common shapes of the lines: a swap received at the greater value
// and sold later, a withholding on a forced sale, income converted at an older
// rate, deductible fees out of order, deferrals spread over several lots.

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { buy, lineOf, reportOf, sell, taxBuilder, text, transfer } from "./helpers.js";

describe("lines", () => {
  it("a swap valued at what was received, whose lot is sold later: its root is the swap", () => {
    const b = taxBuilder();
    buy(b, "coin_c", "2027-01-11", "1", "1000");
    const swap = b.swap({
      account_id: "acc_a",
      from_asset_id: "coin_c",
      to_asset_id: "coin_d",
      value_date: "2027-03-01",
      quantity_out: "1",
      market_value_out: "1100",
      quantity_in: "10",
      market_value_in: "1150",
    });
    const sale = sell(b, "coin_d", "2027-06-01", "10", "120");
    const report = reportOf(b.build(), 2027);
    expect(text(lineOf(report, swap.id).proceeds.eur)).toBe("1150");
    const line = lineOf(report, sale.id);
    expect(line.lots[0]?.root).toMatchObject({ event_id: swap.id, event_type: "swap" });
    expect(text(line.lots[0]?.root.cost.amount)).toBe("1150");
    expect(text(line.cost_eur)).toBe("1150");
  });

  it("the withholding of a forced sale is a withholding of the year", () => {
    const b = taxBuilder();
    buy(b, "fund_f", "2027-01-11", "10", "100");
    const liquidation = b.corporateAction({
      kind: "fund_liquidation",
      asset_id: "fund_f",
      effective_date: "2027-06-01",
      effects: [
        {
          op: "forced_sale",
          per_account: [{ account_id: "acc_a", quantity: "all", withholding: "38" }],
          unit_price: "120",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-06-01",
        },
      ],
    });
    const report = reportOf(b.build(), 2027);
    expect(
      report.withholdings.lines.map((l) => [l.event_id, l.source, text(l.amount_eur_rounded)]),
    ).toEqual([[liquidation.id, "forced_sale", "38"]]);
  });

  it("income in a foreign currency converted at an older rate carries #5; in euros, not", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.dividend({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2027-06-07",
      fx_rate_date: "2027-06-04",
      currency: "USD",
      fx_rate: "1.2",
    });
    b.dividend({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2027-06-14",
      fx_rate_date: "2027-06-11",
    });
    expect(reportOf(b.build(), 2027).movable_capital.dividends.map((d) => d.criteria)).toEqual([
      ["5", "6"],
      ["6"],
    ]);
  });

  it("lists the deductible fees in date order, with #5 when a foreign rate is older", () => {
    const b = taxBuilder();
    const late = b.fee({
      account_id: "acc_a",
      value_date: "2027-09-01",
      amount: "5",
      fee_kind: "administration",
    });
    b.fee({ account_id: "acc_a", value_date: "2027-08-02", amount: "7", fee_kind: "connectivity" });
    const early = b.fee({
      account_id: "acc_a",
      value_date: "2027-07-05",
      fx_rate_date: "2027-07-02",
      amount: "3",
      currency: "USD",
      fx_rate: "1.5",
      fee_kind: "custody",
    });
    const euros = b.fee({
      account_id: "acc_a",
      value_date: "2027-07-12",
      fx_rate_date: "2027-07-09",
      amount: "4",
      fee_kind: "custody",
    });
    const expenses = reportOf(b.build(), 2027).movable_capital.expenses;
    expect(expenses.map((e) => [e.event_id, text(e.amount_eur_rounded), e.criteria])).toEqual([
      [early.id, "-2", ["5", "6", "23"]],
      [euros.id, "-4", ["6", "23"]],
      [late.id, "-5", ["6", "23"]],
    ]);
  });
});

describe("deferrals over several lots of one acquisition", () => {
  it("a prior acquisition in several lots carries the deferral in proportion to each", () => {
    const b = taxBuilder();
    buy(b, "fund_f", "2027-01-11", "4", "100");
    buy(b, "fund_f", "2027-01-12", "6", "100");
    buy(b, "fund_g", "2025-01-10", "10", "100");
    // The transfer opens two lots of fund_g: an acquisition of fund_g in two pieces.
    transfer(b, "fund_f", "fund_g", "2027-02-01", "10", "10");
    const loss = sell(b, "fund_g", "2027-03-01", "10", "90");
    const later = sell(b, "fund_g", "2027-06-01", "10", "95");
    const report = reportOf(b.build(), 2027);
    const line = lineOf(report, loss.id);
    expect(text(line.deferred_eur)).toBe("-100");
    expect(
      line.deferral?.acquisitions.map((a) => [a.timing, a.via_transfer, a.units.toString()]),
    ).toEqual([["prior", true, "10"]]);
    expect(lineOf(report, later.id).released.map((r) => text(r.amount_eur))).toEqual([
      "-40",
      "-60",
    ]);
  });

  it("a posterior acquisition in several lots receives the deferral lot by lot", () => {
    const b = taxBuilder();
    buy(b, "fund_g", "2025-01-10", "10", "100");
    const loss = sell(b, "fund_g", "2027-03-01", "10", "90");
    buy(b, "fund_f", "2027-01-11", "4", "100");
    buy(b, "fund_f", "2027-01-12", "6", "100");
    transfer(b, "fund_f", "fund_g", "2027-04-01", "10", "10");
    const later = sell(b, "fund_g", "2027-06-01", "5", "95");
    const report = reportOf(b.build(), 2027);
    expect(text(lineOf(report, loss.id).deferred_eur)).toBe("-100");
    // The first lot (4 units) is sold whole and one unit of the second.
    expect(lineOf(report, later.id).released.map((r) => text(r.amount_eur))).toEqual([
      "-40",
      "-10",
    ]);
  });

  it("a grant with a cost in two accounts is one acquisition", () => {
    const b = taxBuilder();
    b.buy({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2025-01-10",
      quantity: "10",
      unit_price: "100",
    });
    const loss = sell(b, "stock_s", "2027-03-01", "10", "90");
    b.corporateAction({
      kind: "stock_dividend",
      asset_id: "stock_t",
      effective_date: "2027-03-15",
      effects: [
        {
          op: "grant",
          asset_id: "stock_s",
          per_account: [
            { account_id: "acc_a", quantity: "3" },
            { account_id: "acc_b", quantity: "2" },
          ],
          unit_cost: "90",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-03-15",
          acquisition_date: "2027-03-15",
          income_eur: "10",
          income_base: "savings",
        },
      ],
    });
    const report = reportOf(b.build(), 2027);
    expect(lineOf(report, loss.id).deferral?.acquisitions.map((a) => a.units.toString())).toEqual([
      "5",
    ]);
    expect(text(lineOf(report, loss.id).deferred_eur)).toBe("-50");
    // Income in kind that is not a fork: a note, and no #8.
    expect(report.notes.map((n) => n.code)).toContain("tax_in_kind_income_not_integrated");
    expect(report.doubtful.find((d) => d.criterion === "8")).toBeUndefined();
  });

  it("a carve-out of the whole cost, or of none, moves all or nothing", () => {
    const run = (share: string) => {
      const b = taxBuilder();
      buy(b, "stock_s", "2025-01-10", "10", "100");
      sell(b, "stock_s", "2027-02-01", "10", "90");
      buy(b, "stock_s", "2027-03-01", "10", "90");
      b.corporateAction({
        kind: "spin_off",
        asset_id: "stock_s",
        effective_date: "2027-04-01",
        effects: [{ op: "carve_out", to_asset_id: "stock_t", ratio: "1", cost_share: share }],
      });
      const s = sell(b, "stock_s", "2027-06-01", "10", "95");
      const t = sell(b, "stock_t", "2027-06-02", "10", "1");
      const report = reportOf(b.build(), 2027);
      return [text(lineOf(report, s.id).released_eur), text(lineOf(report, t.id).released_eur)];
    };
    expect(run("1")).toEqual(["0", "-100"]);
    expect(run("0")).toEqual(["-100", "0"]);
  });
});

describe("an alternative reading that breaks nothing of the year asked", () => {
  it("is left out when it leaves events invalid and no figure of the year applies it", () => {
    const b = taxBuilder();
    b.buy({
      account_id: "acc_a",
      asset_id: "fund_f",
      trade_date: "2027-01-15",
      value_date: "2027-01-18",
      quantity: "10",
      unit_price: "100",
    });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      trade_date: "2027-01-14",
      value_date: "2027-01-20",
      quantity: "10",
      unit_price: "90",
      fx_rate_date: "2027-01-14",
    });
    buy(b, "stock_s", "2028-01-10", "1", "10");
    expect(reportOf(b.build(), 2028).doubtful.find((d) => d.criterion === "1")).toBeUndefined();
    expect(DEFAULT_SETTINGS.fiscal_date_rule.fund).toBe("value_date");
  });
});
