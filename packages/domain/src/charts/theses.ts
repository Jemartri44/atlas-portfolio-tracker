// Each thesis against the index, in percent (feature 020, E3, M1 and M10): the
// two percentages a dumbbell draws and the difference between them in points.
//
// The denominator is the one of business rule 16, "that same money": what was
// invested in the thesis. Nothing here decides whether a thesis can be compared
// — `bucketTheses` does, and leaves `result_vs_index_eur` out when anything is
// missing — so a thesis without a comparison has no percentage either, and a
// thesis with nothing invested has none: a share of nothing is not zero.

import { Decimal } from "../money/decimal.js";
import type { Money } from "../money/money.js";
import type { BucketThesisView } from "../projections/bucket.js";

const HUNDRED = Decimal.parse("100");

export interface ThesisPct {
  /** `(result + latent) / invested`, in percent: what the thesis did. */
  thesis_pct?: Decimal;
  /** `(equivalent − invested) / invested`, in percent: what the same money did in the index. */
  index_pct?: Decimal;
  /** `result against the index / invested`, in points: `thesis_pct − index_pct`. */
  vs_index_pp?: Decimal;
}

export const thesisVsIndexPct = (thesis: BucketThesisView): ThesisPct => {
  const vs = thesis.result_vs_index_eur;
  const invested = thesis.invested_eur.amount;
  if (vs === undefined || !invested.isPositive()) {
    return {};
  }
  // A thesis is comparable only when its latent gain and its equivalent exist:
  // `result_vs_index_eur` is built from both and absent without either.
  const latent = (thesis.unrealized_eur as Money).amount;
  const equivalent = (thesis.benchmark_equivalent_eur as Money).amount;
  return {
    thesis_pct: thesis.result_eur.amount.add(latent).div(invested).mul(HUNDRED),
    index_pct: equivalent.sub(invested).div(invested).mul(HUNDRED),
    vs_index_pp: vs.amount.div(invested).mul(HUNDRED),
  };
};
