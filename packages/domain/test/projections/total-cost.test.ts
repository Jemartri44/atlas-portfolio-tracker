import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { Money } from "../../src/money/money.js";
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

  it("falls back to the observed commission, and says what is missing without it", () => {
    const observed = costOf(pot("1"), settings);
    expect(observed.missing).toEqual(["exit_tax"]);
    expect(observed.commission_cost_eur?.amount.isPositive()).toBe(true);
    expect(observed.exit_tax_eur).toBeUndefined();

    // A position that arrived by transfer has no purchase: nothing to observe a commission from.
    const events = pot("1");
    const summary = costSummary(projectLedger(events), events, DATE, settings);
    const transferred = {
      ...summary,
      core: {
        ...summary.core,
        totals: { ...summary.core.totals, invested_eur: Money.zero("EUR") },
      },
    };
    const none = totalCost(transferred, settings, { years: 1, grossReturnPct: d("0") });
    expect(none.missing).toContain("commission");
    expect(none.commission_cost_eur?.isZero()).toBe(true);
  });

  it("reports the missing contribution and a TER-less part instead of guessing", () => {
    const noContribution = costOf(pot("1"), DEFAULT_SETTINGS);
    expect(noContribution.missing).toContain("monthly_contribution");
    expect(noContribution.monthly_core_eur.isZero()).toBe(true);
  });

  it("gives no figure with a missing price or with no TER", () => {
    expect(costOf(pot("1", false), settings).gap).toBe("partial");
    expect(costOf(pot(), settings).gap).toBe("no_ter");
    expect(costOf(pot(), settings).end_net_eur).toBeUndefined();
  });
});
