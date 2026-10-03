// The three gauges of the bucket (feature 020, E3, M1 and M10): how much of the
// cap has been contributed, the result over what was contributed against the
// stop rule, and the weight of the bucket over net worth against its maximum.
//
// **Nothing here is a new rule.** Each figure is the one a control of
// `bucketStats` already computes, written with the **same expression** the
// warning uses, so that a screen drawing "past the mark" and the domain
// emitting the warning cannot drift apart: a property test ties
// `contribution_pct_of_cap > near_limit_pct` to `bucket_contribution_near_limit`
// and `bucket_contribution_exceeded`. The interface draws; it never compares.

import { Decimal } from "../money/decimal.js";
import { type BucketControls, NEAR_LIMIT_PCT } from "../projections/bucket-stats.js";
import type { Settings } from "../settings/settings.js";

const HUNDRED = Decimal.parse("100");

export interface BucketGauges {
  /**
   * The gross contribution over the cap, in percent, like the warning of
   * `bucketStats` reads it. Absent without a positive cap.
   */
  contribution_pct_of_cap?: Decimal;
  /** The mark of the warning: `NEAR_LIMIT_PCT`, exported by the domain. */
  near_limit_pct: Decimal;
  /**
   * `(realized + unrealized) / gross contribution`, in percent and with its
   * sign (the negative of `loss_pct` when there is a loss). Absent when the
   * rule could not be measured: a position without a price, or nothing
   * contributed.
   */
  result_pct?: Decimal;
  /** `Settings.bucket_stop_loss_pct`: the rule the result is held against. */
  stop_loss_pct?: Decimal;
  /** The weight of the bucket over total net worth; absent over a partial one. */
  weight_pct?: Decimal;
  /** `Settings.bucket_max_weight_pct`. */
  max_weight_pct?: Decimal;
}

export const bucketGauges = (controls: BucketControls, settings: Settings): BucketGauges => {
  const gross = controls.contribution_gross_eur.amount;
  const limit = settings.bucket_max_cumulative_contribution;
  const cap = limit === undefined ? undefined : Decimal.parse(limit);
  const unrealized = controls.unrealized_eur;
  const stop = settings.bucket_stop_loss_pct;
  const maxWeight = settings.bucket_max_weight_pct;
  return {
    ...(cap?.isPositive() === true ? { contribution_pct_of_cap: gross.div(cap).mul(HUNDRED) } : {}),
    near_limit_pct: NEAR_LIMIT_PCT,
    ...(unrealized !== undefined && gross.isPositive()
      ? { result_pct: controls.realized_eur.amount.add(unrealized.amount).div(gross).mul(HUNDRED) }
      : {}),
    ...(stop === undefined ? {} : { stop_loss_pct: Decimal.parse(stop) }),
    ...(controls.weight_pct === undefined ? {} : { weight_pct: controls.weight_pct }),
    ...(maxWeight === undefined ? {} : { max_weight_pct: Decimal.parse(maxWeight) }),
  };
};
