import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import type { Money } from "../../src/money/money.js";
import { costSummary } from "../../src/projections/costs.js";
import { grow } from "../../src/projections/growth.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { totalCost } from "../../src/projections/total-cost.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
const d = (text: string) => Decimal.parse(text);

/** 10 units bought at 100 (fee 5), valued 100: a pot of 1000, 1005 invested, TER 1. */
const pot = (ter?: string, priced = true): LedgerEvent[] => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.asset("ast_ter", { ...(ter === undefined ? {} : { ter }) });
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_ter",
    quantity: "10",
    unit_price: "100",
    fee: "5",
  });
  if (priced) {
    b.valuation({ account_id: "acc_fund", asset_id: "ast_ter", date: DATE, unit_value: "100" });
  }
  return b.build();
};

const costOf = (
  events: LedgerEvent[],
  settings: Settings,
  assumptions: Partial<Parameters<typeof totalCost>[2]> = {},
) =>
  totalCost(costSummary(projectLedger(events), events, DATE, settings), settings, {
    years: 1,
    grossReturnPct: d("0"),
    ...assumptions,
  });

describe("grow", () => {
  it("compounds the annual rate monthly and lands each contribution after its month's growth", () => {
    const [, end] = grow({ start: d("1000"), monthly: d("0"), annualReturnPct: d("12"), years: 1 });
    expect(end?.value.round(6).toString()).toBe("1126.82503");
    const two = grow({
      start: d("0"),
      monthly: d("100"),
      annualReturnPct: d("6"),
      years: 2,
      entryFeePct: d("1"),
    });
    expect(two.map((point) => point.year)).toEqual([0, 1, 2]);
    expect(two[2]?.value.round(6).toString()).toBe("2517.763569");
    expect(two[2]?.contributed.toString()).toBe("2400");
  });
});

describe("totalCost", () => {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    monthly_contribution_eur: "100",
    bucket_pct_of_contribution: "10",
  };

  it("splits the cost into TER, commissions and exit tax, and keeps the bucket's share out", () => {
    const result = costOf(pot("1"), settings, {
      years: 2,
      grossReturnPct: d("5"),
      commissionPct: d("1"),
      exitTaxPct: d("20"),
    });
    expect(result.gap).toBeUndefined();
    expect(result.monthly_core_eur.amount.toString()).toBe("90");
    const free = grow({ start: d("1000"), monthly: d("90"), annualReturnPct: d("5"), years: 2 });
    const net = grow({
      start: d("1000"),
      monthly: d("90"),
      annualReturnPct: d("4"),
      years: 2,
      entryFeePct: d("1"),
    });
    const end = (points: ReturnType<typeof grow>) => points[2]?.value as Decimal;
    expect(result.end_without_costs_eur?.amount.toString()).toBe(end(free).toString());
    expect(result.end_net_eur?.amount.toString()).toBe(end(net).toString());
    const parts = [result.ter_cost_eur, result.commission_cost_eur, result.exit_tax_eur].map((m) =>
      ((m as Money).amount as Decimal).toString(),
    );
    // gain over 1005 invested + 24 contributions of 90
    const gain = end(net).sub(d("1005")).sub(d("2160"));
    expect(parts[2]).toBe(gain.mul(d("20")).div(d("100")).toString());
    expect(result.total_eur?.amount.toString()).toBe(
      d(parts[0] as string)
        .add(d(parts[1] as string))
        .add(d(parts[2] as string))
        .toString(),
    );
    expect(result.missing).toEqual([]);
  });

  it("charges no exit tax on a loss", () => {
    const result = costOf(pot("1"), settings, {
      grossReturnPct: d("-50"),
      commissionPct: d("0"),
      exitTaxPct: d("20"),
    });
    expect(result.exit_tax_eur?.isZero()).toBe(true);
  });

  it("gives no commission figure without the owner's assumption, and says so", () => {
    const result = costOf(pot("1"), settings);
    expect(result.missing).toEqual(["commission", "exit_tax"]);
    expect(result.commission_cost_eur).toBeUndefined();
    expect(result.exit_tax_eur).toBeUndefined();
    expect(result.total_eur?.amount.toString()).toBe(result.ter_cost_eur?.amount.toString());
  });

  it("projects only the value that declares a TER and says how much is left out", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_ter", { ter: "1" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_ter", quantity: "10", unit_price: "100" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10", unit_price: "100" });
    for (const asset of ["ast_ter", "ast_world"]) {
      b.valuation({ account_id: "acc_fund", asset_id: asset, date: DATE, unit_value: "100" });
    }
    const result = costOf(b.build(), settings, { commissionPct: d("0") });
    expect(result.ter_partial).toBe(true);
    expect(result.ter_missing_eur.amount.toString()).toBe("1000");
    const alone = costOf(pot("1"), settings, { commissionPct: d("0") });
    expect(result.ter_cost_eur?.amount.toString()).toBe(alone.ter_cost_eur?.amount.toString());
    // The exit-tax basis is the 1000 invested in the TER asset, not the 2000 of the whole core.
    const taxed = costOf(b.build(), settings, {
      commissionPct: d("0"),
      exitTaxPct: d("20"),
      grossReturnPct: d("5"),
    });
    const net = taxed.end_net_eur?.amount as Decimal;
    expect(taxed.exit_tax_eur?.amount.toString()).toBe(
      net.sub(d("1000")).sub(d("1080")).mul(d("20")).div(d("100")).toString(),
    );
  });

  it("reports a missing contribution and bucket share instead of assuming them", () => {
    const result = costOf(pot("1"), DEFAULT_SETTINGS);
    expect(result.missing).toEqual(expect.arrayContaining(["monthly_contribution", "bucket_pct"]));
    expect(result.monthly_core_eur.isZero()).toBe(true);
  });

  it("refuses a horizon that is not a whole number of years", () => {
    for (const years of [0.5, -1, Number.NaN]) {
      expect(() => costOf(pot("1"), settings, { years })).toThrow("whole number");
    }
    expect(costOf(pot("1"), settings, { years: 0 }).ter_cost_eur?.amount.isZero()).toBe(true);
  });

  it("gives no figure with a missing price or with no TER", () => {
    expect(costOf(pot("1", false), settings).gap).toBe("partial");
    expect(costOf(pot(), settings).gap).toBe("no_ter");
    expect(costOf(pot(), settings).end_net_eur).toBeUndefined();
  });
});
