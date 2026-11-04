import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { bucketShareOf, coreMonthlyOf } from "../../src/projections/core-monthly.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";

const withPct = (bucket_pct_of_contribution: string) => ({
  ...DEFAULT_SETTINGS,
  bucket_pct_of_contribution,
});

describe("coreMonthlyOf", () => {
  it("takes the bucket's share off the contribution", () => {
    const { monthly, missing } = coreMonthlyOf({
      ...withPct("10"),
      monthly_contribution_eur: "600",
    });
    expect(monthly.toString()).toBe("540");
    expect(missing).toEqual([]);
  });

  it("says each setting that is absent instead of assuming it", () => {
    const {
      monthly_contribution_eur: _contribution,
      bucket_pct_of_contribution: _pct,
      ...rest
    } = withPct("10");
    expect(coreMonthlyOf(rest).missing).toEqual(["monthly_contribution", "bucket_pct"]);
  });
});

describe("bucketShareOf", () => {
  it("is the share of the whole: 540 to the core at 10 % leaves 60 for the bucket", () => {
    expect(bucketShareOf(Decimal.parse("540"), withPct("10"))?.toString()).toBe("60");
  });

  it("has no figure with a share of 100 or without one", () => {
    expect(bucketShareOf(Decimal.parse("540"), withPct("100"))).toBeUndefined();
    const { bucket_pct_of_contribution: _gone, ...rest } = withPct("10");
    expect(bucketShareOf(Decimal.parse("540"), rest)).toBeUndefined();
  });
});
