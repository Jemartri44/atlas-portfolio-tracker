// The weekly review (feature 016, E4; `docs/specification.md` §9.5: «Semanal
// — comprobar desviaciones de pesos y reglas del cubo — Sí, si se supera algún
// umbral»). What the domain already warns of, **read by code and by the
// details it enumerates, never by its message** (R3: the messages carry
// amounts and asset ids), with the thresholds of `Settings` — never a number
// of this file:
//
// - the core: each asset whose weight deviates from its target by more than
//   `deviation_threshold_pp` (`deviation_above_threshold`), said **by its
//   class**, never by the asset (§8.1 P9);
// - the bucket, rules 17 and 18 of the plan (`bucketStats`): the gross
//   contribution above its cap or near it, the stop-loss reached, and the
//   weight of the bucket over the net worth above its maximum.
//
// **Only when there is something to do** (mutant 32): a rule that could not
// be measured is said in a mail that goes anyway, never a reason to send one.

import type { Decimal } from "../money/decimal.js";
import { Decimal as D } from "../money/decimal.js";
import { Money } from "../money/money.js";
import type { Asset, LedgerState, Warning } from "../projections/state.js";
import type { CoreWeights } from "../projections/weights.js";
import type { AssetClass } from "../schema/events.js";

export interface ReviewDeviation {
  readonly asset_class: AssetClass;
  /** Signed: above the target is positive. */
  readonly deviation_pp: Decimal;
  readonly threshold_pp: Decimal;
}

export type ReviewRule =
  | {
      readonly code: "bucket_contribution_exceeded" | "bucket_contribution_near_limit";
      readonly gross: Money;
      readonly limit: Money;
    }
  | {
      readonly code: "bucket_stop_loss_reached";
      readonly loss_pct: Decimal;
      readonly limit_pct: Decimal;
      readonly loss: Money;
      readonly gross: Money;
    }
  | {
      readonly code: "bucket_weight_exceeded";
      readonly weight_pct: Decimal;
      readonly limit_pct: Decimal;
    };

export interface ReviewUnmeasured {
  readonly code:
    | "core_weights_partial"
    | "bucket_stop_loss_not_evaluated"
    | "bucket_weight_not_evaluated";
  /** Why, from the closed list of `ControlGap`; absent for the core. */
  readonly reason?: string;
}

export interface ReviewFacts {
  readonly deviations: readonly ReviewDeviation[];
  readonly rules: readonly ReviewRule[];
  readonly unmeasured: readonly ReviewUnmeasured[];
}

const CLASS_ORDER: readonly AssetClass[] = ["equity", "fixed_income", "gold", "crypto"];

const text = (warning: Warning, key: string): string => warning.details[key] as string;

const euros = (warning: Warning, key: string): Money => Money.parse(text(warning, key), "EUR");

export const reviewFacts = (input: {
  readonly state: LedgerState;
  readonly weights: CoreWeights;
  /** The warnings of the controls of the bucket (`bucketStats(…).controls.warnings`). */
  readonly bucket: readonly Warning[];
  /** `deviation_threshold_pp` of the settings: without it, no deviation is measured. */
  readonly deviationThreshold?: string;
}): ReviewFacts => {
  const deviations = input.weights.warnings
    .filter((warning) => warning.code === "deviation_above_threshold")
    .map((warning) => ({
      // The class of the asset, never the asset (§8.1 P9); a core asset always has one.
      asset_class: (input.state.assets.get(text(warning, "asset_id")) as Asset)
        .asset_class as AssetClass,
      deviation_pp: D.parse(text(warning, "deviation_pp")),
      threshold_pp: D.parse(text(warning, "threshold_pp")),
    }))
    .sort(
      (a, b) =>
        CLASS_ORDER.indexOf(a.asset_class) - CLASS_ORDER.indexOf(b.asset_class) ||
        b.deviation_pp.abs().cmp(a.deviation_pp.abs()),
    );
  const rules: ReviewRule[] = [];
  const unmeasured: ReviewUnmeasured[] = [];
  if (input.deviationThreshold !== undefined && input.weights.partial) {
    unmeasured.push({ code: "core_weights_partial" });
  }
  for (const warning of input.bucket) {
    switch (warning.code) {
      case "bucket_contribution_exceeded":
      case "bucket_contribution_near_limit":
        rules.push({
          code: warning.code,
          gross: euros(warning, "gross_eur"),
          limit: euros(warning, "limit_eur"),
        });
        break;
      case "bucket_stop_loss_reached":
        rules.push({
          code: warning.code,
          loss_pct: D.parse(text(warning, "loss_pct")),
          limit_pct: D.parse(text(warning, "limit_pct")),
          loss: euros(warning, "loss_eur"),
          gross: euros(warning, "gross_eur"),
        });
        break;
      case "bucket_weight_exceeded":
        rules.push({
          code: warning.code,
          weight_pct: D.parse(text(warning, "weight_pct")),
          limit_pct: D.parse(text(warning, "limit_pct")),
        });
        break;
      case "bucket_stop_loss_not_evaluated":
      case "bucket_weight_not_evaluated":
        unmeasured.push({ code: warning.code, reason: text(warning, "reason") });
        break;
    }
  }
  return { deviations, rules, unmeasured };
};

/** Whether the week has something to do: a threshold passed. Never what could not be measured alone. */
export const reviewDue = (facts: ReviewFacts): boolean =>
  facts.deviations.length > 0 || facts.rules.length > 0;
