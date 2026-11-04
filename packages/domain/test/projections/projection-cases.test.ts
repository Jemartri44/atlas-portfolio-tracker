import { describe, expect, it } from "vitest";
import type { Decimal } from "../../src/money/decimal.js";
import { costSummary } from "../../src/projections/costs.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import {
  type ProjectionDiscounts,
  projectionCases,
} from "../../src/projections/projection-cases.js";
import {
  type ProjectionEdits,
  projectionAssumptions,
} from "../../src/projections/projection-file.js";
import { coreWeights } from "../../src/projections/weights.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
const NONE: ProjectionDiscounts = { inflation: false, taxes: false, fees: false };

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  monthly_contribution_eur: "0",
  bucket_pct_of_contribution: "10",
  target_weights: { ast_ter: "100" },
};

/** 10 units bought at 100, valued 100: a pot of 1000 of equity, all of it invested. */
const pot = (ter?: string, priced = true): LedgerEvent[] => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.asset("ast_ter", { ...(ter === undefined ? {} : { ter }) });
  b.buy({ account_id: "acc_fund", asset_id: "ast_ter", quantity: "10", unit_price: "100" });
  if (priced) {
    b.valuation({ account_id: "acc_fund", asset_id: "ast_ter", date: DATE, unit_value: "100" });
  }
  return b.build();
};

const run = (
  edits: ProjectionEdits = {},
  discounts: Partial<ProjectionDiscounts> = {},
  events: LedgerEvent[] = pot(),
  withSettings: Settings = settings,
  date: string = DATE,
) => {
  const state = projectLedger(events);
  return projectionCases(
    coreWeights(state, date, withSettings),
    costSummary(state, events, date, withSettings),
    withSettings,
    projectionAssumptions(edits),
    { ...NONE, ...discounts },
  );
};

const equity = (return_pct: string, volatility_pct = "0") => ({
  equity: { return_pct, volatility_pct },
});
const cents = (value?: { amount: Decimal }) => value?.amount.round(2).toString();

describe("projectionCases: the three cases", () => {
  it("compounds the published rate: 7 % over two years is 1.07², not a twelfth a month", () => {
    const result = run({ years: 2, classes: equity("7") });
    expect(result.points.map((point) => cents(point.normal_eur))).toEqual([
      "1000",
      "1070",
      "1144.9",
    ]);
  });

  it("lands each contribution at the end of its month: 1 % a month is 12.68… % a year", () => {
    // 100 × (1.01¹² − 1) / 0.01 on top of the pot of 1000 × 1.01¹².
    const result = run({
      years: 1,
      monthly_eur: "100",
      classes: equity("12.682503013196972"),
    });
    expect(cents(result.points[1]?.normal_eur)).toBe("2395.08");
  });

  it("adds the contributions as they are at a rate of zero", () => {
    const result = run({ years: 3, monthly_eur: "10", classes: equity("0") });
    expect(cents(result.points[3]?.normal_eur)).toBe("1360");
    expect(cents(result.points[3]?.contributed_eur)).toBe("1360");
  });

  it("opens the band by 1.28 · volatility / √t, narrower as a rate the longer it runs", () => {
    // At year 4 the margin is 1.28 × 10 / 2 = 6.4: 3.6 % and 16.4 % on a return of 10 %.
    const result = run({ years: 4, classes: equity("10", "10") });
    const end = result.points[4];
    expect(cents(end?.low_eur)).toBe("1151.96");
    expect(cents(end?.normal_eur)).toBe("1464.1");
    expect(cents(end?.high_eur)).toBe("1835.74");
    // At year 1 the whole 12.8: −2.8 % and 22.8 %.
    expect(cents(result.points[1]?.low_eur)).toBe("972");
    expect(cents(result.points[1]?.high_eur)).toBe("1228");
  });

  it("starts the three cases from the pot of today", () => {
    const [today] = run().points;
    expect([today?.low_eur, today?.normal_eur, today?.high_eur].map(cents)).toEqual([
      "1000",
      "1000",
      "1000",
    ]);
  });

  it("stops a year at −99 % when the volatility reaches past −100 %", () => {
    const result = run({ years: 1, classes: equity("0", "1000") });
    expect(cents(result.points[1]?.low_eur)).toBe("10");
  });
});

describe("projectionCases: the real core by class", () => {
  const mixed = (priced = true): LedgerEvent[] => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_coin", { asset_class: "crypto" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "9", unit_price: "100" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_coin", quantity: "1", unit_price: "100" });
    b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date: DATE, unit_value: "100" });
    if (priced) {
      b.valuation({ account_id: "acc_fund", asset_id: "ast_coin", date: DATE, unit_value: "100" });
    }
    return b.build();
  };
  const split: Settings = { ...settings, target_weights: { ast_world: "50", ast_coin: "50" } };

  it("grows what each class holds today, not the target weights", () => {
    const result = run(
      { years: 1, classes: { ...equity("10"), crypto: { return_pct: "0", volatility_pct: "0" } } },
      {},
      mixed(),
      split,
    );
    // 900 × 1.10 + 100: at the target weights it would be 1050.
    expect(cents(result.points[1]?.normal_eur)).toBe("1090");
  });

  it("spreads the contribution by the target weights", () => {
    const result = run(
      {
        years: 1,
        monthly_eur: "100",
        classes: { ...equity("0"), crypto: { return_pct: "100", volatility_pct: "0" } },
      },
      {},
      mixed(),
      split,
    );
    // Equity 900 + 600. Crypto 200 + 50 × (2 − 1) / (2^(1/12) − 1) = 200 + 840.86.
    expect(cents(result.points[1]?.normal_eur)).toBe("2540.86");
  });

  it("uses the cases published for crypto until its return or volatility is edited", () => {
    const published = run({ years: 1, classes: equity("0") }, {}, mixed(), split);
    // 900 + 100 × 0.888 and 900 + 100 × 1.166.
    expect(cents(published.points[1]?.low_eur)).toBe("988.8");
    expect(cents(published.points[1]?.high_eur)).toBe("1016.6");
    const edited = run(
      { years: 1, classes: { ...equity("0"), crypto: { volatility_pct: "10" } } },
      {},
      mixed(),
      split,
    );
    // 10 % ± 12.8 %.
    expect(cents(edited.points[1]?.low_eur)).toBe("997.2");
    expect(cents(edited.points[1]?.high_eur)).toBe("1022.8");
  });

  it("gives no figure without the price of an asset, and keeps saying what it can", () => {
    const result = run({}, {}, mixed(false), split);
    expect(result.gap).toBe("partial");
    expect(result.start_eur).toBeUndefined();
    expect(result.points).toEqual([]);
    expect(result.ends).toBeUndefined();
  });
});

describe("projectionCases: what is discounted", () => {
  const edits: ProjectionEdits = {
    years: 1,
    monthly_eur: "0",
    inflation_pct: "25",
    commission_pct: "10",
    classes: equity("1100"),
  };
  // TER 100 % of 1000 at 1100 % a year: 12000 gross, 11000 after the TER.
  const events = pot("100");
  const base = (discounts: Partial<ProjectionDiscounts>) =>
    cents(run(edits, discounts, events).points[1]?.normal_eur);

  it("leaves the figure undiscounted with every box off", () => {
    expect(base({})).toBe("12000");
  });

  it("takes the inflation alone: the euros of today", () => {
    expect(base({ inflation: true })).toBe("9600");
  });

  it("takes the fees alone: the TER off the rate", () => {
    expect(base({ fees: true })).toBe("11000");
  });

  it("takes the commission off each contribution, on top of the TER", () => {
    const withMonthly = { ...edits, monthly_eur: "100", classes: equity("0") };
    const noTer = pot();
    const gross = run(withMonthly, {}, noTer).points[1];
    const net = run(withMonthly, { fees: true }, noTer).points[1];
    expect(cents(gross?.normal_eur)).toBe("2200");
    expect(cents(net?.normal_eur)).toBe("2080");
  });

  it("takes the taxes alone: the scale over the gain, not a flat rate", () => {
    // Gain of 11000 at the 2027 scale: 6000 at 19 % and 5000 at 21 %.
    expect(base({ taxes: true })).toBe("9810");
  });

  it("applies the scale of the settings when they set one", () => {
    const flat: Settings = { ...settings, savings_tax_brackets: [{ rate_pct: "10" }] };
    expect(cents(run(edits, { taxes: true }, events, flat).points[1]?.normal_eur)).toBe("10900");
  });

  it("pays nothing on a loss", () => {
    const result = run({ years: 1, classes: equity("-50") }, { taxes: true });
    expect(cents(result.points[1]?.normal_eur)).toBe("500");
    expect(cents(result.ends?.normal.tax_eur)).toBe("0");
  });

  it("chains them: fees, then the tax on what is left, then the inflation", () => {
    // 11000 after the TER, gain 10000: 1140 + 840 of tax, 9020, over 1.25.
    expect(base({ fees: true, taxes: true, inflation: true })).toBe("7216");
  });

  it("says what fees and tax take at the end whatever the boxes say", () => {
    const off = run(edits, {}, events).ends?.normal;
    const on = run(edits, { fees: true, taxes: true, inflation: true }, events).ends?.normal;
    for (const end of [off, on]) {
      expect(cents(end?.gross_eur)).toBe("12000");
      expect(cents(end?.fees_eur)).toBe("1000");
      expect(cents(end?.tax_eur)).toBe("1980");
    }
    expect(cents(off?.value_eur)).toBe("12000");
    expect(cents(on?.value_eur)).toBe("7216");
  });

  it("counts a part with no TER as nothing rather than giving it the average", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_ter", { ter: "2" });
    b.asset("ast_none", {});
    for (const asset_id of ["ast_ter", "ast_none"]) {
      b.buy({ account_id: "acc_fund", asset_id, quantity: "5", unit_price: "100" });
      b.valuation({ account_id: "acc_fund", asset_id, date: DATE, unit_value: "100" });
    }
    const result = run({ years: 1, classes: equity("0") }, { fees: true }, b.build(), {
      ...settings,
      target_weights: { ast_ter: "50", ast_none: "50" },
    });
    expect(result.ter_pct?.toString()).toBe("1");
    expect(result.ter_partial).toBe(true);
    expect(cents(result.ter_missing_eur)).toBe("500");
    expect(cents(result.points[1]?.normal_eur)).toBe("990");
  });

  it("has no TER to take from a core with none declared, and says the commission is absent", () => {
    const result = run({ years: 1, classes: equity("0") }, { fees: true });
    expect(result.ter_pct).toBeUndefined();
    expect(result.missing).toEqual(["commission"]);
    expect(cents(result.points[1]?.normal_eur)).toBe("1000");
  });

  it("says the tax is missing when no scale covers the year, and takes none", () => {
    const events = pot();
    const state = projectLedger(events);
    const result = projectionCases(
      { ...coreWeights(state, DATE, settings), date: "2000-12-31" },
      costSummary(state, events, DATE, settings),
      settings,
      projectionAssumptions({ years: 1, commission_pct: "0", classes: equity("100") }),
      { ...NONE, taxes: true },
    );
    expect(result.missing).toEqual(["exit_tax"]);
    expect(cents(result.points[1]?.normal_eur)).toBe("2000");
  });
});

describe("projectionCases: the figures it cannot give", () => {
  it("takes the core's part of the contribution of the settings, without the bucket", () => {
    const result = run({}, {}, pot(), { ...settings, monthly_contribution_eur: "600" });
    expect(result.monthly_core_eur.amount.toString()).toBe("540");
  });

  it("needs no contribution in the settings when one is typed", () => {
    const { monthly_contribution_eur: _gone, ...rest } = settings;
    expect(run({}, {}, pot(), rest as Settings).gap).toBe("missing_settings");
    expect(run({ monthly_eur: "10" }, {}, pot(), rest as Settings).gap).toBeUndefined();
  });

  it("refuses without target weights or when they do not add up to 100", () => {
    expect(run({}, {}, pot(), { ...settings, target_weights: {} }).gap).toBe("no_targets");
    expect(run({}, {}, pot(), { ...settings, target_weights: { ast_ter: "90" } }).gap).toBe(
      "targets_not_100",
    );
  });

  it("projects an empty core from the contributions alone", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_ter", {});
    const result = run({ years: 1, monthly_eur: "10", classes: equity("0") }, {}, b.build());
    expect(cents(result.points[1]?.normal_eur)).toBe("120");
  });

  it("has only today at a horizon of zero", () => {
    const result = run({ years: 0 }, { fees: true, taxes: true, inflation: true });
    expect(result.points).toHaveLength(1);
    expect(cents(result.ends?.normal.value_eur)).toBe("1000");
    expect(cents(result.ends?.normal.fees_eur)).toBe("0");
  });

  it("gives the same figures twice", () => {
    expect(run({ years: 5 })).toEqual(run({ years: 5 }));
  });
});
