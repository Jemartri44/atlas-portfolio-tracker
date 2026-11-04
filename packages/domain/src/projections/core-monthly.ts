// What the owner contributes to the core each month, read from the settings.

import { Decimal, HUNDRED } from "../money/decimal.js";
import type { Settings } from "../settings/settings.js";

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

/**
 * What the bucket gets when `coreEur` goes to the core: its share of the whole, so that
 * `core × pct / (100 − pct)`. Undefined without a share below 100 in the settings.
 */
export const bucketShareOf = (coreEur: Decimal, settings: Settings): Decimal | undefined => {
  if (settings.bucket_pct_of_contribution === undefined) {
    return undefined;
  }
  const pct = Decimal.parse(settings.bucket_pct_of_contribution);
  return pct.lt(HUNDRED) ? coreEur.mul(pct).div(HUNDRED.sub(pct)) : undefined;
};
