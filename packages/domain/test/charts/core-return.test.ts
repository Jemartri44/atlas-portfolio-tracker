// The return of the core over a period, by Modified Dietz, worked out by hand case by case
// (docs/business-rules.md, «Variación de la cartera principal»).

import { describe, expect, it } from "vitest";
import { coreReturn, monthPeriod, yearPeriod } from "../../src/charts.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const FEB = { from: "2027-01-31", to: "2027-02-28" };

/** A core funded with `funded` euros that bought 10 units at 100 in January. */
const core = (funded = "1000"): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.deposit({ account_id: "acc_fund", amount: funded, value_date: "2027-01-02" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2027-01-05" });
  return b;
};

const valueAt = (b: LedgerBuilder, date: string, unit: string): void => {
  b.valuation({
    account_id: "acc_fund",
    asset_id: "ast_world",
    date,
    quantity: "10",
    unit_value: unit,
  });
};

const pctOf = (b: LedgerBuilder, period = FEB): string | undefined =>
  coreReturn(b.build(), period).pct?.round(6).toString();

describe("coreReturn: the figure", () => {
  it("without flows is the change of the value over the start: 1000 → 1100 is +10 %", () => {
    const b = core();
    valueAt(b, "2027-01-31", "100");
    valueAt(b, "2027-02-28", "110");
    expect(pctOf(b)).toBe("10");
  });

  it("weights a deposit by the days it was inside: 300 on the 15th of February", () => {
    // V0 1000, V1 1100 + 300 of cash, F 300 with w = 13/28:
    // (1400 − 1000 − 300) / (1000 + 300 × 13/28) = 2800 / 31900.
    const b = core();
    valueAt(b, "2027-01-31", "100");
    b.deposit({ account_id: "acc_fund", amount: "300", value_date: "2027-02-15" });
    valueAt(b, "2027-02-28", "110");
    expect(pctOf(b)).toBe("8.777429");
  });

  it("takes money moved to the bucket as a withdrawal of the core", () => {
    // V0 1000 + 200 of cash, V1 1100, F −200 with w = 13/28:
    // (1100 − 1200 + 200) / (1200 − 200 × 13/28) = 2800 / 31000.
    const b = core("1200");
    valueAt(b, "2027-01-31", "100");
    b.withdrawal({ account_id: "acc_fund", amount: "200", value_date: "2027-02-15" });
    b.deposit({ account_id: "acc_bucket", amount: "200", value_date: "2027-02-15" });
    valueAt(b, "2027-02-28", "110");
    expect(pctOf(b)).toBe("9.032258");
  });

  it("counts a dividend as return, not as a flow", () => {
    // 50 of dividend in cash: (1150 − 1000) / 1000.
    const b = core();
    valueAt(b, "2027-01-31", "100");
    b.dividend({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2027-02-10",
      gross: "50",
      fx_rate_date: "2027-02-10",
    });
    valueAt(b, "2027-02-28", "110");
    expect(pctOf(b)).toBe("15");
  });
});

describe("coreReturn: no figure, and why", () => {
  it("with a price missing at one end", () => {
    const b = core();
    valueAt(b, "2027-01-31", "100");
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      trade_date: "2027-02-10",
      amount: "0.01",
      quantity: "1",
      unit_price: undefined,
    });
    expect(coreReturn(b.build(), FEB)).toEqual({ ...FEB, gap: "partial" });
  });

  it("with less history than the period, instead of measuring from the first day", () => {
    const b = core();
    valueAt(b, "2027-01-31", "100");
    valueAt(b, "2027-02-28", "110");
    expect(coreReturn(b.build(), yearPeriod("2027-02-28")).gap).toBe("short_history");
  });

  it("when a purchase came before the money that paid it", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2027-01-05" });
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-10" });
    valueAt(b, "2027-01-31", "100");
    valueAt(b, "2027-02-28", "110");
    expect(coreReturn(b.build(), FEB).gap).toBe("uncovered_buys");
  });

  it("when nothing was invested over the period", () => {
    const b = core();
    valueAt(b, "2027-01-31", "100");
    b.sell({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2027-01-31" });
    b.withdrawal({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-31" });
    valueAt(b, "2027-02-28", "110");
    expect(coreReturn(b.build(), FEB).gap).toBe("no_base");
  });
});

describe("the periods", () => {
  it("reads «este mes» from the last day of the month before", () => {
    expect(monthPeriod("2029-01-20")).toEqual({ from: "2028-12-31", to: "2029-01-20" });
    expect(monthPeriod("2028-03-01")).toEqual({ from: "2028-02-29", to: "2028-03-01" });
  });

  it("reads «12 meses» from the same day a year before", () => {
    expect(yearPeriod("2029-01-20")).toEqual({ from: "2028-01-20", to: "2029-01-20" });
    expect(yearPeriod("2028-02-29")).toEqual({ from: "2027-02-28", to: "2028-02-29" });
  });
});
