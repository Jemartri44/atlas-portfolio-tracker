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
