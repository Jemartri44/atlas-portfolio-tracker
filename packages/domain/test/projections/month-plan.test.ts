// «Este mes»: the plan fixed at the end of the month before, and which of its tasks the month
// already holds (docs/business-rules.md, «Este mes»).

import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { monthPlan } from "../../src/projections/month-plan.js";
import type { ExternalPrices } from "../../src/projections/prices.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const PLAN_DATE = "2027-12-31";

const settings = (extra: Partial<Settings> = {}): Settings =>
  mergeSettings(DEFAULT_SETTINGS, {
    target_weights: { ast_world: "60", ast_bonds: "30", ast_gold: "10" },
    monthly_contribution_eur: "600",
    bucket_pct_of_contribution: "10",
    ...extra,
  });

/** A core worth 600 / 300 / 100 at the end of December: the plan sends 324 / 162 / 54 and 60. */
const december = (extra: Partial<Settings> = {}): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.settings(settings(extra));
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "6", unit_price: "100" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_bonds", quantity: "3", unit_price: "100" });
  b.buy({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    quantity: "1",
    unit_price: "100",
    currency: "USD",
    fx_rate: "1",
  });
  for (const [account_id, asset_id, currency] of [
    ["acc_fund", "ast_world", "EUR"],
    ["acc_fund", "ast_bonds", "EUR"],
    ["acc_etf", "ast_gold", "USD"],
  ] as const) {
    b.valuation({
      account_id,
      asset_id,
      date: PLAN_DATE,
      unit_value: "100",
      currency,
      fx_rate: "1",
    });
  }
  return b;
};

const read = (b: LedgerBuilder, date = "2028-01-20") => {
  const events = b.build();
  const plan = monthPlan(events, date);
  if (plan.status !== "ready") {
    throw new Error(`plan ${plan.code}`);
  }
  return plan;
};

const proposed = (plan: ReturnType<typeof read>) =>
  Object.fromEntries(plan.assets.map((row) => [row.asset_id, row.proposed_eur.amount.toString()]));

describe("monthPlan: the plan of the month", () => {
  it("is computed at the last day of the month before, with its amount and budget", () => {
    const plan = read(december());
    expect(plan.month).toBe("2028-01");
    expect(plan.plan_date).toBe(PLAN_DATE);
    expect(plan.deposit.proposed_eur.amount.toString()).toBe("600");
    expect(plan.bucket.proposed_eur.amount.toString()).toBe("60");
    expect(proposed(plan)).toEqual({ ast_world: "324", ast_bonds: "162", ast_gold: "54" });
  });

  it("does not move when the month records purchases, prices or new settings", () => {
    const b = december();
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2028-01-05",
      quantity: "3",
      unit_price: "100",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2028-01-15",
      quantity: "9",
      unit_value: "150",
    });
    b.recordedAt("2028-01-10");
    b.settings(settings({ monthly_contribution_eur: "900" }));
    const plan = read(b);
    expect(plan.deposit.proposed_eur.amount.toString()).toBe("600");
    expect(proposed(plan)).toEqual({ ast_world: "324", ast_bonds: "162", ast_gold: "54" });
  });

  it("takes the settings in force on the plan date, changed before it", () => {
    const b = december();
    b.recordedAt("2027-12-15");
    b.settings(settings({ monthly_contribution_eur: "900" }));
    expect(read(b).deposit.proposed_eur.amount.toString()).toBe("900");
  });
});

describe("monthPlan: what is done", () => {
  it("marks the deposit, an asset and the bucket with the first date and what went in", () => {
    const b = december();
    b.deposit({ account_id: "acc_fund", amount: "600", value_date: "2028-01-02" });
    b.thesisOpened({ thesis_id: "th_spec" });
    // Recorded out of order: the first date is the earliest, whatever the order of the file.
    for (const [trade_date, amount] of [
      ["2028-01-08", "50"],
      ["2028-01-05", "100"],
      ["2028-01-10", "12"],
    ] as const) {
      b.buy({
        account_id: "acc_fund",
        asset_id: "ast_bonds",
        trade_date,
        amount,
        quantity: "1",
        unit_price: undefined,
      });
    }
    // An asset the plan sends nothing to is no task.
    b.asset("ast_other");
    b.buy({ account_id: "acc_fund", asset_id: "ast_other", trade_date: "2028-01-06" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      thesis_id: "th_spec",
      trade_date: "2028-01-09",
      amount: "66",
      quantity: "1",
      unit_price: undefined,
      currency: "USD",
      fx_rate: "1.1",
    });
    const plan = read(b);
    expect([plan.deposit.done_on, plan.deposit.done_eur.amount.toString()]).toEqual([
      "2028-01-02",
      "600",
    ]);
    const bonds = plan.assets.find((row) => row.asset_id === "ast_bonds");
    expect([bonds?.done_on, bonds?.done_eur.amount.toString()]).toEqual(["2028-01-05", "162"]);
    expect([plan.bucket.done_on, plan.bucket.done_eur.amount.toString()]).toEqual([
      "2028-01-09",
      "60",
    ]);
    expect(plan.assets.map((row) => row.asset_id)).not.toContain("ast_other");
    const world = plan.assets.find((row) => row.asset_id === "ast_world");
    expect([world?.done_on, world?.done_eur.amount.toString()]).toEqual([undefined, "0"]);
  });

  it("leaves out what is outside the month or after the date read, the bucket's deposits and reversed events", () => {
    const b = december();
    b.deposit({ account_id: "acc_fund", amount: "600", value_date: "2027-12-30" });
    b.deposit({ account_id: "acc_bucket", amount: "60", value_date: "2028-01-03" });
    const reversed = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2028-01-04",
    });
    b.reversal(reversed.id);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_gold",
      trade_date: "2028-01-25",
      currency: "USD",
      quantity: "1",
      unit_price: "54",
    });
    const plan = read(b, "2028-01-20");
    expect(plan.deposit.done_on).toBeUndefined();
    expect(plan.bucket.done_on).toBeUndefined();
    expect(plan.assets.every((row) => row.done_on === undefined)).toBe(true);
  });
});

describe("monthPlan: when there is no plan", () => {
  it("prices the plan with the automatic closes it is given, like every view", () => {
    // Only the core in euros is valued by hand: gold has no price until a close comes.
    const b = december();
    const events = b
      .build()
      .filter((event) => !(event.type === "valuation" && event.asset_id === "ast_gold"));
    expect(monthPlan(events, "2028-01-20").status).toBe("unavailable");
    const closes: ExternalPrices = {
      at: (asset, date) =>
        asset === "ast_gold" && date <= PLAN_DATE
          ? {
              date: PLAN_DATE,
              unit_value: Decimal.parse("100"),
              currency: "USD",
              source: "eodhd",
              fx_rate: Decimal.parse("1"),
            }
          : undefined,
    };
    expect(monthPlan(events, "2028-01-20", closes).status).toBe("ready");
  });

  it("says the code of the domain, at the plan date", () => {
    const b = december({ monthly_contribution_eur: undefined });
    const events = b.build();
    expect(monthPlan(events, "2028-01-20")).toEqual({
      status: "unavailable",
      month: "2028-01",
      plan_date: PLAN_DATE,
      code: "missing_amount",
      details: {},
    });
  });
});
