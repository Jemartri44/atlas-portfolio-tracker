// The money-weighted return of the core since the first deposit, worked out by hand.

import { describe, expect, it } from "vitest";
import { annualRateOf } from "../../src/charts/core-xirr.js";
import { coreXirr } from "../../src/charts.js";
import { Decimal } from "../../src/money/decimal.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const END = "2028-01-02";

/** 1000 deposited on 2027-01-02 and spent on 10 units at 100: exactly 365 days before `END`. */
const core = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2027-01-05" });
  return b;
};

const worth = (b: LedgerBuilder, date: string, unit: string): void => {
  b.valuation({
    account_id: "acc_fund",
    asset_id: "ast_world",
    date,
    quantity: "10",
    unit_value: unit,
  });
};

describe("coreXirr", () => {
  it("is the plain yearly return for one deposit held exactly a year: 1000 → 1100 is +10 %", () => {
    const b = core();
    worth(b, END, "110");
    const result = coreXirr(b.build(), END);
    expect(result.gap).toBeUndefined();
    expect(result.from).toBe("2027-01-02");
    expect(result.contributed_eur?.amount.toString()).toBe("1000");
    expect(result.value_eur?.amount.toString()).toBe("1100");
    expect(result.gain_eur?.amount.toString()).toBe("100");
    expect(result.gain_pct?.toString()).toBe("10");
    expect(result.xirr_pct?.toString()).toBe("10");
  });

  it("is negative for a loss: 1000 → 900 over a year is −10 %", () => {
    const b = core();
    worth(b, END, "90");
    const result = coreXirr(b.build(), END);
    expect(result.xirr_pct?.toString()).toBe("-10");
    expect(result.gain_pct?.toString()).toBe("-10");
  });

  it("weights by when the money went in: the rate makes the dated flows add up to the value", () => {
    const b = core();
    b.deposit({ account_id: "acc_fund", amount: "500", value_date: "2027-07-02" });
    worth(b, END, "110");
    const result = coreXirr(b.build(), END);
    // 1000 for 365 days and 500 for 184 days end at 1100 + 500 of cash = 1600.
    const rate = Number(result.xirr_pct?.toString()) / 100;
    const grown = 1000 * (1 + rate) + 500 * (1 + rate) ** (184 / 365);
    expect(grown).toBeCloseTo(1600, 2);
    expect(result.contributed_eur?.amount.toString()).toBe("1500");
  });

  it("counts a withdrawal as money taken out", () => {
    const b = core();
    b.withdrawal({ account_id: "acc_fund", amount: "100", value_date: "2027-07-02" });
    worth(b, END, "110");
    const result = coreXirr(b.build(), END);
    expect(result.contributed_eur?.amount.toString()).toBe("900");
    expect(result.gain_eur?.amount.toString()).toBe("100");
    // 1000 in for 365 days, 100 out for 184 days, 1000 left: 1000·(1+r) − 100·(1+r)^(184/365) = 1000.
    const rate = Number(result.xirr_pct?.toString()) / 100;
    expect(1000 * (1 + rate) - 100 * (1 + rate) ** (184 / 365)).toBeCloseTo(1000, 2);
  });

  it("gives no gain percentage when nothing net was contributed", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-01-02" });
    b.withdrawal({ account_id: "acc_fund", amount: "1000", value_date: "2027-07-02" });
    const result = coreXirr(b.build(), END);
    expect(result.gain_pct).toBeUndefined();
    expect(result.xirr_pct?.toString()).toBe("0");
  });

  it("gives no rate when it lies beyond any real portfolio (a hundredfold in a year)", () => {
    const b = core();
    worth(b, END, "10000");
    const result = coreXirr(b.build(), END);
    expect(result.gap).toBe("no_rate");
    expect(result.gain_eur?.amount.toString()).toBe("99000");
  });

  it.each([
    ["no flows at all", () => new LedgerBuilder(), "no_flows"],
    [
      "a purchase before any deposit",
      () => {
        const b = new LedgerBuilder();
        catalogue(b);
        b.buy({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2027-01-05" });
        b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2027-02-02" });
        worth(b, END, "110");
        return b;
      },
      "uncovered_buys",
    ],
    ["a held asset with no price", core, "partial"],
  ])("gives no figure with %s", (_name, build, gap) => {
    const result = coreXirr(build().build(), END);
    expect(result.gap).toBe(gap);
    expect(result.xirr_pct).toBeUndefined();
  });

  it("ignores flows after the end date", () => {
    const b = core();
    worth(b, END, "110");
    b.deposit({ account_id: "acc_fund", amount: "9999", value_date: "2028-06-01" });
    expect(coreXirr(b.build(), END).contributed_eur?.amount.toString()).toBe("1000");
  });

  describe("in real terms", () => {
    it("deflates by the calendar years of the period: +10 % nominal with 2 % prices is about +7.8 %", () => {
      const b = core();
      worth(b, END, "110");
      const result = coreXirr(b.build(), END, { "2027": "2", "2028": "0" });
      expect(result.real?.missing_years).toEqual([]);
      expect(result.xirr_pct?.toString()).toBe("10");
      // Independent: 364 days of 2027 at 2 % a year, then 1 day of 2028 at 0 %.
      const inflation = 1.02 ** (364 / 365);
      const real = Number(result.real?.xirr_pct?.toString()) / 100;
      expect(1000 * inflation * (1 + real) ** (365 / 365)).toBeCloseTo(1100, 0);
      expect(Number(result.real?.gain_eur?.amount.toString())).toBeCloseTo(
        1100 - 1000 * inflation,
        1,
      );
    });

    it("equals the nominal figure with no inflation", () => {
      const b = core();
      worth(b, END, "110");
      const result = coreXirr(b.build(), END, { "2027": "0", "2028": "0" });
      expect(result.real?.xirr_pct?.toString()).toBe("10");
      expect(result.real?.gain_eur?.amount.round(2).toString()).toBe("100");
    });

    it("measures the real figures at the 31/12 of the last year with inflation, nominal still at the end", () => {
      const b = core();
      worth(b, "2027-12-31", "105");
      worth(b, END, "110");
      const result = coreXirr(b.build(), END, { "2027": "2" });
      expect(result.xirr_pct?.toString()).toBe("10");
      expect(result.real?.until).toBe("2027-12-31");
      expect(result.real?.missing_years).toEqual(["2028"]);
      // 1000 held 363 days (2027-01-02 → 2027-12-31) ends at 1050; prices rose 2 % a year over them.
      const inflation = 1.02 ** (363 / 365);
      expect(Number(result.real?.gain_eur?.amount.toString())).toBeCloseTo(
        1050 - 1000 * inflation,
        0,
      );
    });

    it("gives no real figure when the first year has no inflation, and says which years", () => {
      const b = core();
      worth(b, END, "110");
      const result = coreXirr(b.build(), END, { "2028": "0" });
      expect(result.real).toEqual({ missing_years: ["2027"] });
      expect(result.xirr_pct?.toString()).toBe("10");
    });

    it("gives no real figure when a price is missing on the date it is measured at", () => {
      const b = core();
      worth(b, END, "110");
      const result = coreXirr(b.build(), END, { "2027": "2" });
      expect(result.real).toEqual({ until: "2027-12-31", missing_years: ["2028"], gap: "partial" });
    });

    it("gives no real rate when it lies out of bounds, but still the real gain", () => {
      const b = core();
      worth(b, END, "10000");
      const result = coreXirr(b.build(), END, { "2027": "0", "2028": "0" });
      expect(result.real?.xirr_pct).toBeUndefined();
      expect(result.real?.gain_eur?.amount.round(2).toString()).toBe("99000");
    });

    it.each(["-99", "1000", "-150"])("refuses a yearly change of prices of %s %%", (pct) => {
      const b = core();
      worth(b, END, "110");
      expect(() => coreXirr(b.build(), END, { "2027": pct, "2028": "0" })).toThrow("out of range");
    });
  });
});

describe("annualRateOf", () => {
  it("has no rate without a flow, instead of failing", () => {
    expect(annualRateOf([], Decimal.parse("100"))).toBeUndefined();
  });
});
