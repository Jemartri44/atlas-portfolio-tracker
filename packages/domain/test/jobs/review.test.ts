// Feature 016, E4 (plan §10.4; mutant 32): the weekly review reads the
// warnings the domain already raises — by code and by the details it
// enumerates, never by their message — and has something to do only when a
// threshold is passed.

import { describe, expect, it } from "vitest";
import { reviewDue, reviewFacts } from "../../src/jobs/review.js";
import { Decimal } from "../../src/money/decimal.js";
import { Money } from "../../src/money/money.js";
import type { LedgerState, Warning } from "../../src/projections/state.js";
import type { CoreWeights } from "../../src/projections/weights.js";

const state = {
  assets: new Map([
    ["ast_world", { asset_class: "equity" }],
    ["ast_small", { asset_class: "equity" }],
    ["ast_bonds", { asset_class: "fixed_income" }],
  ]),
} as unknown as LedgerState;

const warning = (code: string, details: Record<string, string>): Warning => ({
  code,
  event_id: "",
  // The message carries amounts and ids: the review never reads it (R3).
  message: "MESSAGE-SENTINEL 987654.32 ast_world",
  details,
});

const weights = (warnings: Warning[], partial = false) =>
  ({ warnings, partial }) as unknown as CoreWeights;

const deviation = (asset_id: string, deviation_pp: string) =>
  warning("deviation_above_threshold", { asset_id, deviation_pp, threshold_pp: "5" });

describe("the weekly review (E4)", () => {
  it("says each deviation by the class of its asset, in the order of the classes and by size", () => {
    const facts = reviewFacts({
      state,
      weights: weights([
        deviation("ast_bonds", "6.2"),
        deviation("ast_world", "-5.5"),
        deviation("ast_small", "7.25"),
        warning("satellite_below_minimum", {
          asset_class: "gold",
          weight_pct: "1",
          minimum_pct: "2",
        }),
      ]),
      bucket: [],
      deviationThreshold: "5",
    });
    expect(facts).toEqual({
      deviations: [
        {
          asset_class: "equity",
          deviation_pp: Decimal.parse("7.25"),
          threshold_pp: Decimal.parse("5"),
        },
        {
          asset_class: "equity",
          deviation_pp: Decimal.parse("-5.5"),
          threshold_pp: Decimal.parse("5"),
        },
        {
          asset_class: "fixed_income",
          deviation_pp: Decimal.parse("6.2"),
          threshold_pp: Decimal.parse("5"),
        },
      ],
      rules: [],
      unmeasured: [],
    });
    expect(reviewDue(facts)).toBe(true);
  });

  it("reads rules 17 and 18 of the bucket from their details, with the euros kept for the switch", () => {
    const facts = reviewFacts({
      state,
      weights: weights([]),
      bucket: [
        warning("bucket_contribution_exceeded", { gross_eur: "1234.56", limit_eur: "1000" }),
        warning("bucket_contribution_near_limit", { gross_eur: "850", limit_eur: "1000" }),
        warning("bucket_stop_loss_reached", {
          loss_pct: "23.4",
          limit_pct: "20",
          loss_eur: "234",
          gross_eur: "1000",
        }),
        warning("bucket_weight_exceeded", { weight_pct: "12.3", limit_pct: "10" }),
        warning("bucket_sample_too_small", { closed: "1" }),
      ],
    });
    expect(facts.rules).toEqual([
      {
        code: "bucket_contribution_exceeded",
        gross: Money.parse("1234.56", "EUR"),
        limit: Money.parse("1000", "EUR"),
      },
      {
        code: "bucket_contribution_near_limit",
        gross: Money.parse("850", "EUR"),
        limit: Money.parse("1000", "EUR"),
      },
      {
        code: "bucket_stop_loss_reached",
        loss_pct: Decimal.parse("23.4"),
        limit_pct: Decimal.parse("20"),
        loss: Money.parse("234", "EUR"),
        gross: Money.parse("1000", "EUR"),
      },
      {
        code: "bucket_weight_exceeded",
        weight_pct: Decimal.parse("12.3"),
        limit_pct: Decimal.parse("10"),
      },
    ]);
    expect(reviewDue(facts)).toBe(true);
  });

  it("has nothing to do when no threshold is passed, even with rules it could not measure (mutant 32)", () => {
    const facts = reviewFacts({
      state,
      weights: weights([], true),
      bucket: [
        warning("bucket_stop_loss_not_evaluated", { limit_pct: "20", reason: "missing_prices" }),
        warning("bucket_weight_not_evaluated", { limit_pct: "10", reason: "partial_net_worth" }),
      ],
      deviationThreshold: "5",
    });
    expect(facts).toEqual({
      deviations: [],
      rules: [],
      unmeasured: [
        { code: "core_weights_partial" },
        { code: "bucket_stop_loss_not_evaluated", reason: "missing_prices" },
        { code: "bucket_weight_not_evaluated", reason: "partial_net_worth" },
      ],
    });
    expect(reviewDue(facts)).toBe(false);
    // Without a threshold of deviation, a partial core is not something unmeasured.
    expect(reviewFacts({ state, weights: weights([], true), bucket: [] }).unmeasured).toEqual([]);
  });
});
