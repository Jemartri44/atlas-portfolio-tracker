// Compound growth of a pot with a monthly contribution, in decimal. The one engine behind the
// 20-year projections (total cost, scenarios): the annual rate is nominal, applied as rate/12 each
// month, and a contribution lands at the end of its month, after the growth of that month.
//
// It is a what-if over assumptions the owner edits. It reads no price and no tax rule.

import { Decimal, HUNDRED } from "../money/decimal.js";
import type { Settings } from "../settings/settings.js";

export interface GrowthInput {
  start: Decimal;
  monthly: Decimal;
  /** Nominal annual percent; may be negative. */
  annualReturnPct: Decimal;
  years: number;
  /** Percent taken from each contribution before it is invested. */
  entryFeePct?: Decimal;
}

export interface GrowthPoint {
  /** 0 is today. */
  year: number;
  value: Decimal;
  /** Start plus the contributions made so far, before fees. */
  contributed: Decimal;
}

const MONTHS = 12;
const TWELVE = Decimal.parse("12");

export const grow = (input: GrowthInput): GrowthPoint[] => {
  const rate = input.annualReturnPct.div(HUNDRED).div(TWELVE);
  const invested = input.monthly.mul(
    Decimal.ONE.sub((input.entryFeePct ?? Decimal.ZERO).div(HUNDRED)),
  );
  let value = input.start;
  let contributed = input.start;
  const points: GrowthPoint[] = [{ year: 0, value, contributed }];
  for (let month = 1; month <= input.years * MONTHS; month += 1) {
    value = value.add(value.mul(rate)).add(invested);
    contributed = contributed.add(input.monthly);
    if (month % MONTHS === 0) {
      points.push({ year: month / MONTHS, value, contributed });
    }
  }
  return points;
};

/**
 * The first month (1-based) at which the pot reaches `goal` within `years`, or undefined if it
 * does not. Already there today is month 0.
 */
export const monthsToReach = (input: GrowthInput, goal: Decimal): number | undefined => {
  const rate = input.annualReturnPct.div(HUNDRED).div(TWELVE);
  const invested = input.monthly.mul(
    Decimal.ONE.sub((input.entryFeePct ?? Decimal.ZERO).div(HUNDRED)),
  );
  let value = input.start;
  if (!value.lt(goal)) {
    return 0;
  }
  for (let month = 1; month <= input.years * MONTHS; month += 1) {
    value = value.add(value.mul(rate)).add(invested);
    if (!value.lt(goal)) {
      return month;
    }
  }
  return undefined;
};

/**
 * What the owner puts into the **core** each month: the contribution of the settings minus the
 * bucket's share. A setting that is absent is said, not assumed (the contribution counts as 0).
 */
export const coreMonthlyOf = (
  settings: Settings,
): { monthly: Decimal; missing: ("monthly_contribution" | "bucket_pct")[] } => {
  const missing: ("monthly_contribution" | "bucket_pct")[] = [];
  if (settings.monthly_contribution_eur === undefined) {
    missing.push("monthly_contribution");
  }
  if (settings.bucket_pct_of_contribution === undefined) {
    missing.push("bucket_pct");
  }
  const contribution = Decimal.parse(settings.monthly_contribution_eur ?? "0");
  const bucketPct = Decimal.parse(settings.bucket_pct_of_contribution ?? "0");
  return { monthly: contribution.mul(HUNDRED.sub(bucketPct)).div(HUNDRED), missing };
};
