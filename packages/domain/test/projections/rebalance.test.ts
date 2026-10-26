import { describe, expect, it } from "vitest";
import type { Decimal } from "../../src/money/decimal.js";
import { Money } from "../../src/money/money.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import {
  type RebalancePlan,
  rebalancePlan,
  roundSplit,
  type SaleStep,
  type TransferStep,
} from "../../src/projections/rebalance.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
const BRACKETS = [
  { up_to: "6000", rate_pct: "19" },
  { up_to: "50000", rate_pct: "21" },
  { rate_pct: "23" },
];
const TARGETS = { ast_world: "55", ast_bonds: "30", ast_gold: "15" };

/** The settings of the cases; a key given as `undefined` is taken out, as if it had never been set. */
const settings = (extra: { [K in keyof Settings]?: Settings[K] | undefined } = {}): Settings => {
  const merged: Record<string, unknown> = {
    ...mergeSettings(DEFAULT_SETTINGS, {
      bucket_pct_of_contribution: "0",
      target_weights: TARGETS,
      deviation_threshold_pp: "5",
      savings_tax_brackets: BRACKETS,
    }),
    ...extra,
  };
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) {
      delete merged[key];
    }
  }
  return merged as unknown as Settings;
};

/**
 * A core of 10,000 euros: the equity fund A (45 units in three lots, 150 each,
 * after selling one with no commission), the bonds fund B (29 at 100) and the gold
 * ETC G (5 at 100, bought with a 3 USD commission) on another platform.
 */
const core = (a = "6600", b = "2900", g = "500", pastSale = true): LedgerBuilder => {
  const x = new LedgerBuilder();
  catalogue(x);
  const price = (value: string, units: number) => (Number(value) / units).toString();
  x.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "21",
    unit_price: "100",
    value_date: "2022-02-01",
  });
  x.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "16",
    unit_price: "100",
    value_date: "2023-03-01",
  });
  x.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "8",
    unit_price: "100",
    value_date: "2024-04-01",
  });
  if (pastSale) {
    x.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "1",
      unit_price: "100",
      value_date: "2024-06-03",
    });
  }
  x.buy({
    account_id: "acc_fund",
    asset_id: "ast_bonds",
    quantity: "29",
    unit_price: "100",
    value_date: "2024-04-01",
  });
  x.buy({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    quantity: "5",
    unit_price: "100",
    currency: "USD",
    fx_rate: "1",
    fee: "3",
    value_date: "2024-04-02",
  });
  x.valuation({
    account_id: "acc_fund",
    asset_id: "ast_world",
    date: DATE,
    unit_value: price(a, 44),
  });
  x.valuation({
    account_id: "acc_fund",
    asset_id: "ast_bonds",
    date: DATE,
    unit_value: price(b, 29),
  });
  x.valuation({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    date: DATE,
    unit_value: price(g, 5),
    currency: "USD",
    fx_rate: "1",
  });
  return x;
};

const run = (
  b: LedgerBuilder,
  extra: { [K in keyof Settings]?: Settings[K] | undefined } = {},
  amount?: string,
): RebalancePlan => {
  const events = b.build();
  return rebalancePlan(projectLedger(events), events, {
    date: DATE,
    settings: settings(extra),
    ...(amount === undefined ? {} : { amount }),
  });
};

const eur = (money: Money | undefined) => money?.roundToCents().amount.toString();
const pct = (value: Decimal | undefined) => value?.toString();

describe("rebalancePlan", () => {
  it("proposes the free transfer first and the taxed sale after, with what each leaves", () => {
    const plan = run(core());
    expect(plan.status).toBe("steps");
    expect(plan.steps.map((step) => step.kind)).toEqual(["transfer", "sale"]);

    const transfer = plan.steps[0] as TransferStep;
    expect([transfer.from_asset_id, transfer.to_asset_id]).toEqual(["ast_world", "ast_bonds"]);
    expect(eur(transfer.amount_eur)).toBe("100");
    expect(transfer.from_account_id).toBe("acc_fund");
    // Stopping here is free and leaves the gold 10 points short, the equity fund 10 over.
    expect(pct(transfer.outcome.max_deviation_pp)).toBe("10");

    const sale = plan.steps[1] as SaleStep;
    expect(sale.asset_id).toBe("ast_world");
    expect(eur(sale.amount_eur)).toBe("1000");
    expect(sale.tax.available && eur(sale.tax.tax_eur)).toBe("63.33");
    expect(sale.tax.available && eur(sale.tax.gain_eur)).toBe("333.33");
    expect(sale.tax.available && sale.tax.lots[0]?.acquisition_date).toBe("2022-02-01");
    expect(sale.orders).toHaveLength(1);
    // The last sale in that account paid nothing; the gold purchase paid 3.
    expect(eur(sale.orders[0]?.fee?.fee_eur)).toBe("0");
    expect(sale.buys.rows[0]?.account_id).toBe("acc_etf");
    expect(eur(sale.buys.rows[0]?.lines[0]?.fee?.fee_eur)).toBe("3");
    expect(pct(sale.outcome.max_deviation_pp)).toBe("0");
  });

  it("says which platform has to send money to which", () => {
    const plan = run(core());
    const byAccount = Object.fromEntries(plan.cash.map((move) => [move.account_id, move]));
    expect(eur(byAccount.acc_fund?.net_eur)).toBe("-1000");
    // The gold purchase of 1000 plus its commission of 3.
    expect(eur(byAccount.acc_etf?.net_eur)).toBe("1003");
  });

  it("places new money first, with the same split as the contribution", () => {
    const plan = run(core("5800", "3500", "700"), {}, "900");
    const first = plan.steps[0];
    expect(first?.kind).toBe("contribution");
    if (first?.kind === "contribution") {
      const lines = first.platforms.rows.flatMap((row) => row.lines);
      expect(Object.fromEntries(lines.map((l) => [l.asset_id, eur(l.amount_eur)]))).toEqual({
        ast_world: "80",
        ast_gold: "820",
      });
    }
  });

  it("proposes nothing while every asset is inside the threshold", () => {
    const plan = run(core("5500", "3000", "1500"));
    expect(plan.status).toBe("within_threshold");
    expect(plan.steps).toEqual([]);
    expect(plan.diagnosis.every((row) => !row.beyond_threshold)).toBe(true);
  });

  it("proposes no sale when something is under its target but nothing is over", () => {
    // Equity 5800 vs 55, gold 700 vs 15: gold is 8 points under, nothing is over by more than the threshold.
    const plan = run(core("5800", "3500", "700"));
    expect(plan.status).toBe("only_deficits");
    expect(plan.steps).toEqual([]);
    // Purchases alone would need 3500 / 0.30 − 10000 of new money.
    expect(eur(plan.purchases_only_eur)).toBe("1666.67");
  });

  it("leaves the tax unknown, not zero, without brackets", () => {
    const sale = run(core(), { savings_tax_brackets: undefined }).steps[1] as SaleStep;
    expect(sale.tax.available && sale.tax.tax_eur).toBeUndefined();
    expect(sale.tax.available && eur(sale.tax.gain_eur)).toBe("333.33");
  });

  it("brings no tax for a sale at a loss and says how much of it the repurchase rule defers", () => {
    // The equity fund is worth 80 a unit against a cost of 100, and 5 units
    // were bought a month ago: part of the loss would not be deductible.
    const b = core("3520", "2900", "500");
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "5",
      unit_price: "100",
      value_date: "2027-12-01",
    });
    const plan = run(b, { target_weights: { ast_world: "30", ast_bonds: "30", ast_gold: "40" } });
    const sale = plan.steps.find((step) => step.kind === "sale") as SaleStep;
    expect(sale.tax.available && sale.tax.gain_eur.isNegative()).toBe(true);
    expect(sale.tax.available && sale.tax.tax_eur?.isZero()).toBe(true);
    expect(sale.tax.available && sale.tax.deferred_eur.amount.isPositive()).toBe(true);
    expect(sale.tax.available && sale.tax.deferral_window_end).toBe("2028-02-29");
  });

  it("refuses without a threshold, without target weights or with a missing price", () => {
    const codeOf = (run_: () => unknown) => {
      try {
        run_();
      } catch (error) {
        return (error as { code: string }).code;
      }
      return "accepted";
    };
    expect(codeOf(() => run(core(), { deviation_threshold_pp: undefined }))).toBe(
      "missing_deviation_threshold",
    );
    expect(codeOf(() => run(core(), { target_weights: undefined }))).toBe("missing_target_weights");
    expect(codeOf(() => run(core(), { target_weights: { ast_ghost: "100" } }))).toBe(
      "no_target_weight_in_table",
    );
    expect(codeOf(() => run(core(), {}, "-5"))).toBe("invalid_amount");
    const unpriced = core();
    unpriced.asset("ast_mm", { asset_class: "fixed_income", asset_type: "money_market" });
    unpriced.buy({ account_id: "acc_fund", asset_id: "ast_mm", quantity: "5", unit_price: "100" });
    expect(codeOf(() => run(unpriced))).toBe("missing_manual_prices");
  });

  it("never mentions the bucket", () => {
    const b = core();
    b.thesisOpened({ thesis_id: "th1" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      thesis_id: "th1",
      quantity: "10",
      unit_price: "100",
      currency: "USD",
      fx_rate: "1",
    });
    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      date: DATE,
      unit_value: "100",
      currency: "USD",
      fx_rate: "1",
    });
    const plan = run(b);
    expect(plan.diagnosis.map((row) => row.asset_id)).not.toContain("ast_spec");
    expect(JSON.stringify(plan.steps)).not.toContain("ast_spec");
  });
});

/** A core of plain assets, every one worth `value` euros, in the accounts and kinds each case needs. */
const plain = (
  assets: {
    id: string;
    value: string;
    target: string;
    type?: "fund" | "etc" | "etp";
    transferable?: boolean;
    account?: string;
    units?: number;
  }[],
): { ledger: LedgerBuilder; targets: Record<string, string> } => {
  const b = new LedgerBuilder();
  b.account("acc_fund");
  b.account("acc_etf", { platform: "ibkr" });
  b.account("acc_two", { platform: "other" });
  const targets: Record<string, string> = {};
  for (const asset of assets) {
    const type = asset.type ?? "fund";
    const classOf = type === "fund" ? "equity" : type === "etc" ? "gold" : "crypto";
    b.asset(asset.id, {
      asset_type: type,
      asset_class: classOf,
      transferable: asset.transferable ?? type === "fund",
    });
    targets[asset.id] = asset.target;
    const units = asset.units ?? 1;
    b.buy({
      account_id: asset.account ?? (type === "fund" ? "acc_fund" : "acc_etf"),
      asset_id: asset.id,
      quantity: String(units),
      unit_price: "100",
      value_date: "2024-04-01",
    });
    b.valuation({
      account_id: asset.account ?? (type === "fund" ? "acc_fund" : "acc_etf"),
      asset_id: asset.id,
      date: DATE,
      unit_value: String(Number(asset.value) / units),
    });
  }
  return { ledger: b, targets };
};

const kinds = (plan: RebalancePlan) =>
  plan.steps.map((step) =>
    step.kind === "transfer"
      ? `${step.from_asset_id}>${step.to_asset_id}:${eur(step.amount_eur)}`
      : step.kind === "sale"
        ? `sell ${step.asset_id}:${eur(step.amount_eur)}`
        : "contribution",
  );

describe("rebalancePlan cases", () => {
  it("transfers all it can between funds and sells the rest of what is above", () => {
    const { ledger, targets } = plain([
      { id: "f1", value: "6000", target: "50" },
      { id: "f2", value: "2000", target: "40" },
      { id: "g", value: "2000", target: "10", type: "etc" },
    ]);
    const plan = run(ledger, { target_weights: targets });
    expect(kinds(plan)).toEqual(["f1>f2:1000", "sell g:1000"]);
    expect(pct(plan.steps.at(-1)?.outcome.max_deviation_pp)).toBe("0");
  });

  it("sells less than what is above when the purchases cannot absorb it all", () => {
    // f2 is 3 points over: inside the threshold, so it is not sold and the gold gets less than it lacks.
    const { ledger, targets } = plain([
      { id: "f1", value: "6000", target: "50" },
      { id: "f2", value: "3800", target: "35" },
      { id: "g", value: "200", target: "15", type: "etc" },
    ]);
    const plan = run(ledger, { target_weights: targets });
    expect(kinds(plan)).toEqual(["sell f1:1000"]);
  });

  it("falls back to a sale when two funds cannot be transferred into each other", () => {
    // The gold ETC is flagged transferable by mistake: it is not a fund, so no transfer is proposed.
    const { ledger, targets } = plain([
      { id: "f1", value: "7000", target: "50" },
      { id: "g", value: "3000", target: "50", type: "etc", transferable: true },
    ]);
    const plan = run(ledger, { target_weights: targets });
    expect(kinds(plan)).toEqual(["sell f1:2000"]);
  });

  it("pairs two sources that fill one destination between them", () => {
    const { ledger, targets } = plain([
      { id: "f1", value: "3000", target: "20" },
      { id: "f2", value: "2600", target: "20" },
      { id: "f3", value: "4400", target: "60" },
    ]);
    const plan = run(ledger, { target_weights: targets });
    expect(kinds(plan)).toEqual(["f1>f3:1000", "f2>f3:600"]);
  });

  it("does not say which account a transfer goes to when the destination holds nothing yet", () => {
    const { ledger, targets } = plain([
      { id: "f1", value: "7000", target: "50" },
      { id: "f2", value: "3000", target: "30" },
    ]);
    ledger.asset("f3");
    const plan = run(ledger, { target_weights: { ...targets, f3: "20" } });
    const transfer = plan.steps.find(
      (step) => step.kind === "transfer" && step.to_asset_id === "f3",
    ) as TransferStep;
    expect(transfer.from_account_id).toBe("acc_fund");
    expect(transfer.to_account_id).toBeUndefined();
  });

  it("reports only the deficits when something is over its target but nothing can take it", () => {
    // The single asset is 100 % of the core against a target of 50: nobody lacks anything.
    const { ledger } = plain([{ id: "f1", value: "5000", target: "50" }]);
    const plan = run(ledger, { target_weights: { f1: "50" } });
    expect(plan.status).toBe("only_deficits");
    expect(plan.steps).toEqual([]);
  });

  it("pairs several sources with several destinations without crossing money", () => {
    const { ledger, targets } = plain([
      { id: "f1", value: "3500", target: "20" },
      { id: "f2", value: "3500", target: "20" },
      { id: "f3", value: "1500", target: "30" },
      { id: "f4", value: "1500", target: "30" },
    ]);
    const plan = run(ledger, { target_weights: targets });
    expect(kinds(plan)).toEqual(["f1>f3:1500", "f2>f4:1500"]);
  });

  it("finances several purchases from several sales", () => {
    const { ledger, targets } = plain([
      { id: "g", value: "3000", target: "10", type: "etc" },
      { id: "c", value: "3000", target: "10", type: "etp" },
      { id: "f1", value: "2000", target: "40" },
      { id: "f2", value: "2000", target: "40" },
    ]);
    const plan = run(ledger, { target_weights: targets });
    expect(kinds(plan)).toEqual(["sell g:2000", "sell c:2000"]);
    const buys = plan.steps.map((step) =>
      step.kind === "sale"
        ? step.buys.rows[0]?.lines.map((l) => [l.asset_id, eur(l.amount_eur)])
        : [],
    );
    expect(buys).toEqual([[["f1", "2000"]], [["f2", "2000"]]]);
  });

  it("splits an order over the accounts that hold the asset, largest first", () => {
    const b = new LedgerBuilder();
    b.account("acc_fund");
    b.account("acc_etf", { platform: "ibkr" });
    b.account("acc_two", { platform: "other" });
    b.asset("f", { asset_class: "equity" });
    b.asset("g", { asset_type: "etc", asset_class: "gold", transferable: false });
    b.buy({
      account_id: "acc_fund",
      asset_id: "f",
      quantity: "60",
      unit_price: "100",
      value_date: "2024-04-01",
    });
    b.buy({
      account_id: "acc_etf",
      asset_id: "g",
      quantity: "3",
      unit_price: "100",
      value_date: "2024-04-01",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "g",
      quantity: "1",
      unit_price: "100",
      value_date: "2024-04-01",
    });
    b.buy({
      account_id: "acc_two",
      asset_id: "g",
      quantity: "2",
      unit_price: "100",
      value_date: "2024-04-01",
    });
    b.valuation({ account_id: "acc_fund", asset_id: "f", date: DATE, unit_value: "100" });
    b.valuation({ account_id: "acc_etf", asset_id: "g", date: DATE, unit_value: "800" });
    const plan = run(b, { target_weights: { f: "90", g: "10" } });
    const sale = plan.steps[0] as SaleStep;
    expect(
      sale.orders.map((order) => [
        order.account_id,
        order.quantity.toString(),
        eur(order.amount_eur),
      ]),
    ).toEqual([
      ["acc_etf", "3", "2400"],
      ["acc_two", "1.65", "1320"],
    ]);
    expect(sale.tax.available && eur(sale.tax.gain_eur)).toBe("3255");
  });

  it("leaves a sale commission unknown, never zero, when the account has sold nothing", () => {
    const sale = run(core("6600", "2900", "500", false)).steps[1] as SaleStep;
    expect(sale.orders[0]?.fee).toBeUndefined();
    expect(sale.orders[0]?.fee_pct).toBeUndefined();
  });

  it("says the tax is unavailable instead of guessing when the engine does not cover the year", () => {
    // The compensation regime the engine applies starts in 2018.
    const b = new LedgerBuilder();
    b.account("acc_fund");
    b.account("acc_etf", { platform: "ibkr" });
    b.asset("f1");
    b.asset("g", { asset_type: "etc", asset_class: "gold", transferable: false });
    b.buy({
      account_id: "acc_fund",
      asset_id: "f1",
      quantity: "10",
      unit_price: "100",
      value_date: "2016-04-01",
    });
    b.buy({
      account_id: "acc_etf",
      asset_id: "g",
      quantity: "10",
      unit_price: "100",
      value_date: "2016-04-01",
    });
    b.valuation({ account_id: "acc_fund", asset_id: "f1", date: "2017-12-29", unit_value: "100" });
    b.valuation({ account_id: "acc_etf", asset_id: "g", date: "2017-12-29", unit_value: "300" });
    const events = b.build();
    const plan = rebalancePlan(projectLedger(events), events, {
      date: "2017-12-29",
      settings: settings({ target_weights: { f1: "50", g: "50" } }),
    });
    const sale = plan.steps[0] as SaleStep;
    expect(sale.tax).toEqual({ available: false, code: "tax_year_unsupported" });
  });

  it("proposes nothing for a core that owns nothing yet", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const plan = run(b);
    expect(plan.status).toBe("within_threshold");
    expect(plan.core_value_eur.isZero()).toBe(true);
    expect(plan.diagnosis.every((row) => row.weight_pct.isZero())).toBe(true);
  });
});

describe("roundSplit", () => {
  const text = (parts: Money[]) => parts.map((part) => part.amount.toString());

  it("keeps the cents when nothing is left over", () => {
    expect(text(roundSplit([Money.parse("1.5", "EUR")], Money.parse("1.5", "EUR")))).toEqual([
      "1.5",
    ]);
  });

  it("puts the residue of the rounding on the largest part", () => {
    const parts = [
      Money.parse("0.004", "EUR"),
      Money.parse("10.004", "EUR"),
      Money.parse("5.004", "EUR"),
    ];
    // 0 + 10 + 5 = 15 against a total of 15.01: the cent goes to the 10.
    expect(text(roundSplit(parts, Money.parse("15.01", "EUR")))).toEqual(["0", "10.01", "5"]);
  });
});
