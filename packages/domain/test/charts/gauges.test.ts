import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bucketGauges } from "../../src/charts.js";
import type { Decimal } from "../../src/money/decimal.js";
import { bucketStats, NEAR_LIMIT_PCT } from "../../src/projections/bucket-stats.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
const EUR = { currency: "EUR", fx_rate: "1" } as const;

const settings = (extra: Partial<Settings> = {}): Settings =>
  mergeSettings(DEFAULT_SETTINGS, extra);

/** A bucket with `deposit` euros in, and one thesis: 10 units bought at 10 and, maybe, sold. */
const ledger = (deposit: string | undefined, sellPrice?: string, close = true): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  if (deposit !== undefined) {
    b.deposit({ account_id: "acc_bucket", amount: deposit, value_date: "2027-01-01" });
  }
  b.thesisOpened({ thesis_id: "t1", asset_id: "ast_spec", planned_size_eur: "100000" });
  b.buy({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    quantity: "10",
    unit_price: "10",
    fee: "0",
    ...EUR,
    trade_date: "2027-01-11",
    value_date: "2027-01-11",
    thesis_id: "t1",
  });
  if (sellPrice !== undefined) {
    b.sell({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: sellPrice,
      fee: "0",
      ...EUR,
      trade_date: "2027-06-01",
      thesis_id: "t1",
    });
  }
  if (close) {
    b.thesisClosed("t1");
  }
  return b;
};

const report = (b: LedgerBuilder, extra: Partial<Settings> = {}) => {
  const events = b.build();
  const config = settings(extra);
  const { controls } = bucketStats(projectLedger(events), events, DATE, config);
  return { controls, gauges: bucketGauges(controls, config) };
};

describe("bucketGauges: the contribution against the cap", () => {
  it("is the gross contribution over the cap, in percent, with the mark of the domain", () => {
    const { gauges } = report(ledger("5000", "8"), { bucket_max_cumulative_contribution: "6250" });
    expect(gauges.contribution_pct_of_cap?.toString()).toBe("80");
    expect(gauges.near_limit_pct).toBe(NEAR_LIMIT_PCT);
  });

  it("has no percentage without a cap, or with a cap that is not positive", () => {
    expect(report(ledger("5000", "8")).gauges.contribution_pct_of_cap).toBeUndefined();
    const zero = report(ledger("5000", "8"), { bucket_max_cumulative_contribution: "0" });
    expect(zero.gauges.contribution_pct_of_cap).toBeUndefined();
  });

  it("goes past 100 when the cap is exceeded, and says zero when nothing was put in", () => {
    const over = report(ledger("5000", "8"), { bucket_max_cumulative_contribution: "4000" });
    expect(over.gauges.contribution_pct_of_cap?.toString()).toBe("125");
    const none = report(ledger(undefined, "8"), { bucket_max_cumulative_contribution: "4000" });
    expect(none.gauges.contribution_pct_of_cap?.toString()).toBe("0");
  });

  it("is past the mark exactly when the domain warns, near the limit or past it (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20_000 }),
        fc.integer({ min: 1, max: 30_000 }),
        (gross, cap) => {
          const { controls, gauges } = report(ledger(String(gross), "8"), {
            bucket_max_cumulative_contribution: String(cap),
          });
          const warned = controls.warnings.some(
            (warning) =>
              warning.code === "bucket_contribution_near_limit" ||
              warning.code === "bucket_contribution_exceeded",
          );
          const pct = gauges.contribution_pct_of_cap as Decimal;
          expect(pct.gt(gauges.near_limit_pct)).toBe(warned);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("agrees with the warning on the very mark and one unit either side", () => {
    for (const [cap, warned] of [
      ["6250", false],
      ["6249", true],
      ["6251", false],
    ] as const) {
      const { controls, gauges } = report(ledger("5000", "8"), {
        bucket_max_cumulative_contribution: cap,
      });
      const said = controls.warnings.some((w) => w.code === "bucket_contribution_near_limit");
      expect(said).toBe(warned);
      expect((gauges.contribution_pct_of_cap as Decimal).gt(gauges.near_limit_pct)).toBe(warned);
    }
  });
});

describe("bucketGauges: the result over what was contributed", () => {
  it("carries the sign: a loss is negative and equals the negative of loss_pct", () => {
    // 10 units bought at 10 and sold at 8: −20 over 5.000 contributed.
    const { controls, gauges } = report(ledger("5000", "8"), { bucket_stop_loss_pct: "30" });
    expect(gauges.result_pct?.toString()).toBe("-0.4");
    expect(gauges.result_pct?.neg().toString()).toBe(controls.loss_pct?.toString());
    expect(gauges.stop_loss_pct?.toString()).toBe("30");
  });

  it("is positive on a gain, where the domain has no loss", () => {
    const { controls, gauges } = report(ledger("5000", "12"));
    expect(gauges.result_pct?.toString()).toBe("0.4");
    expect(controls.loss_pct).toBeUndefined();
    expect(gauges.stop_loss_pct).toBeUndefined();
  });

  it("is absent when nothing was contributed, and when a position has no price", () => {
    expect(report(ledger(undefined, "8")).gauges.result_pct).toBeUndefined();
    const unpriced = report(ledger("5000", undefined, false));
    expect(unpriced.controls.unrealized_eur).toBeUndefined();
    expect(unpriced.gauges.result_pct).toBeUndefined();
  });
});

describe("bucketGauges: the weight of the bucket over net worth", () => {
  it("takes the weight of the domain and the maximum of the settings", () => {
    const b = ledger("5000", undefined, false);
    b.valuation({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      date: "2027-12-01",
      quantity: "10",
      unit_value: "12",
    });
    const { controls, gauges } = report(b, { bucket_max_weight_pct: "10" });
    expect(gauges.weight_pct?.toString()).toBe(controls.weight_pct?.toString());
    expect(gauges.weight_pct).toBeDefined();
    expect(gauges.max_weight_pct?.toString()).toBe("10");
  });

  it("has neither when the net worth is partial and no maximum is set", () => {
    const { gauges } = report(ledger("5000", undefined, false));
    expect(gauges.weight_pct).toBeUndefined();
    expect(gauges.max_weight_pct).toBeUndefined();
  });
});
