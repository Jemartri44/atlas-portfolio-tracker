// Where the core could be in N years, in three cases (specification §6.1): the real core class by
// class, the contributions spread by the target weights, every class good or bad at once.
//
// - **Normal**: each class compounds at its expected return. The rate is the compound one the
//   sources publish, so a month is the twelfth root of the year, not a twelfth of the rate.
// - **Bad and good at year t**: `return ± 1.28 · volatility / √t`, the band that holds some 8 times
//   out of 10 under that volatility: it narrows as a yearly rate and still widens in euros. A class
//   with cases published by its source uses them. No random draw: same data, same figures.
// - **What is discounted**, each on its own: `fees` (the TER off the rate, the commission off each
//   contribution), `taxes` (the savings scale over the gain of selling everything in year t, against
//   what was invested plus the contributions: historical cost, wrong in both directions, because
//   sales do not subtract their cost and a transfer has no purchase) and `inflation` (the value in
//   euros of today, applied last because the tax falls on the nominal gain).
// - Core only (constitution III). Without a price there is no figure. Informative: nothing fiscal
//   reads it, and no tax figure of the engine depends on it (constitution II).

import { yearOf } from "../dates/civil-date.js";
import { Decimal, HUNDRED } from "../money/decimal.js";
import { EUR, Money } from "../money/money.js";
import type { Settings } from "../settings/settings.js";
import { quotaOfBase } from "../tax/quota.js";
import { coreMonthlyOf } from "./core-monthly.js";
import type { CostSummary } from "./costs.js";
import { checkHorizon } from "./horizon.js";
import type { ClassStart, ResolvedAssumptions } from "./projection-file.js";
import type { ClassSubtotal, CoreWeights } from "./weights.js";

/** The normal quantile of the 10th and 90th percentiles, rounded. */
const BAND_Z = Decimal.parse("1.28");
/** A year cannot lose more than this: the band of a large volatility reaches past −100 %. */
const LOWEST_RATE_PCT = Decimal.parse("-99");
const TWELVE = Decimal.parse("12");
const DIGITS = 16;
/** `div` keeps 10 decimals: too few for `m − 1`, some 0.005, so the quotient is scaled first. */
const SCALE = Decimal.parse("10000000000");
const UNSCALE = Decimal.parse("0.0000000001");
/** Newton doubles its digits: a step this small leaves an error below the last of `DIGITS`. */
const CONVERGED = Decimal.parse("0.000000001");

export type ProjectionCase = "low" | "normal" | "high";
export const PROJECTION_CASES: readonly ProjectionCase[] = ["low", "normal", "high"];

export interface ProjectionDiscounts {
  inflation: boolean;
  taxes: boolean;
  fees: boolean;
}

export type ProjectionCasesGap =
  /** A core asset held has no price: the starting pot would be understated. */
  | "partial"
  /** No target weights (or all zero): there is nothing to spread the contributions with. */
  | "no_targets"
  /** The target weights of the core do not add up to 100. */
  | "targets_not_100"
  /** The contribution or the bucket's share is not in the settings and none was typed. */
  | "missing_settings";

export interface ProjectionCasesPoint {
  year: number;
  /** With the discounts asked for. */
  low_eur: Money;
  normal_eur: Money;
  high_eur: Money;
  /** Start plus the contributions so far, nominal. */
  contributed_eur: Money;
}

export interface ProjectionCaseEnd {
  /** With the discounts asked for. */
  value_eur: Money;
  /** Before anything is discounted. */
  gross_eur: Money;
  /** What the TER and the commissions take, whatever is asked for. */
  fees_eur: Money;
  /** What selling everything would pay over the value after fees, whatever is asked for. */
  tax_eur: Money;
}

export interface ProjectionCases {
  years: number;
  gap?: ProjectionCasesGap;
  /** Pieces the figures lack, so they are not read as complete. */
  missing: ("monthly_contribution" | "bucket_pct" | "commission" | "exit_tax")[];
  monthly_core_eur: Money;
  /** Absent when the core has an unpriced asset. */
  start_eur?: Money;
  /** The yearly TER taken off, over the whole core: what declares none counts as nothing. */
  ter_pct?: Decimal;
  ter_partial: boolean;
  ter_missing_eur: Money;
  points: ProjectionCasesPoint[];
  ends?: Record<ProjectionCase, ProjectionCaseEnd>;
}

const eur = (value: Decimal): Money => Money.of(value, EUR);

const precise = (value: Decimal): Decimal => value.round(DIGITS);

const powerOf = (base: Decimal, exponent: number): Decimal => {
  let result = Decimal.ONE;
  let square = base;
  for (let left = exponent; left > 0; left = Math.floor(left / 2)) {
    if (left % 2 === 1) {
      result = precise(result.mul(square));
    }
    square = precise(square.mul(square));
  }
  return result;
};

const fineDiv = (dividend: Decimal, divisor: Decimal): Decimal =>
  dividend.mul(SCALE).div(divisor).mul(UNSCALE);

/**
 * The twelfth root by Newton. It starts at `1 + (a − 1)/12`, never below the root (Bernoulli), so it
 * comes down without overshooting.
 */
const newtonRoot = (value: Decimal): Decimal => {
  let root = precise(Decimal.ONE.add(fineDiv(value.sub(Decimal.ONE), TWELVE)));
  for (;;) {
    const eleventh = powerOf(root, 11);
    const step = fineDiv(precise(eleventh.mul(root)).sub(value), TWELVE.mul(eleventh));
    root = precise(root.sub(step));
    if (step.abs().lt(CONVERGED)) {
      return root;
    }
  }
};

/** Most rates repeat from year to year and case to case, and the root is the slow step. */
const rootsOnce = (): ((value: Decimal) => Decimal) => {
  const known = new Map<string, Decimal>();
  return (value) => {
    const key = value.toString();
    const root = known.get(key) ?? newtonRoot(value);
    known.set(key, root);
    return root;
  };
};

/** The pot after `years` at a compound rate: the same as month by month, contribution at month end. */
const futureValue = (
  twelfthRoot: (value: Decimal) => Decimal,
  start: Decimal,
  monthly: Decimal,
  ratePct: Decimal,
  years: number,
): Decimal => {
  const rate = ratePct.lt(LOWEST_RATE_PCT) ? LOWEST_RATE_PCT : ratePct;
  const year = Decimal.ONE.add(rate.div(HUNDRED));
  const total = powerOf(year, years);
  const month = twelfthRoot(year);
  // Not `rate.isZero()`: a rate too small for `div` to keep leaves a month of exactly one.
  const annuity = month.eq(Decimal.ONE)
    ? TWELVE.mul(Decimal.parse(String(years)))
    : fineDiv(total.sub(Decimal.ONE), month.sub(Decimal.ONE));
  return precise(start.mul(total).add(monthly.mul(annuity)));
};

const rateAt = (origin: ClassStart, which: ProjectionCase, year: number): Decimal => {
  if (which === "normal") {
    return origin.returnPct;
  }
  const published = which === "low" ? origin.lowPct : origin.highPct;
  if (published !== undefined) {
    return published;
  }
  const margin = BAND_Z.mul(origin.volatilityPct).div(Decimal.parse(String(year)).sqrt());
  return which === "low" ? origin.returnPct.sub(margin) : origin.returnPct.add(margin);
};

export const projectionCases = (
  weights: CoreWeights,
  summary: CostSummary,
  settings: Settings,
  assumptions: ResolvedAssumptions,
  discounts: ProjectionDiscounts,
): ProjectionCases => {
  const { years } = assumptions;
  checkHorizon(years);
  const fromSettings = coreMonthlyOf(settings);
  const monthly = assumptions.monthlyEur ?? fromSettings.monthly;
  const missing: ProjectionCases["missing"] =
    assumptions.monthlyEur === undefined ? [...fromSettings.missing] : [];
  const { totals } = summary.core;
  const found = {
    years,
    missing,
    monthly_core_eur: eur(monthly),
    ter_partial: totals.ter_partial,
    ter_missing_eur: totals.ter_missing_eur,
    points: [],
  };
  if (weights.partial) {
    return { ...found, gap: "partial" };
  }
  const withStart = { ...found, start_eur: weights.total_eur };
  const targetTotal = weights.by_class.reduce(
    (sum, share) => sum.add(share.target_pct),
    Decimal.ZERO,
  );
  if (!targetTotal.isPositive()) {
    return { ...withStart, gap: "no_targets" };
  }
  if (!targetTotal.eq(HUNDRED)) {
    return { ...withStart, gap: "targets_not_100" };
  }
  if (missing.length > 0) {
    return { ...withStart, gap: "missing_settings" };
  }
  const commission = assumptions.commissionPct;
  if (commission === undefined) {
    missing.push("commission");
  }

  const value = weights.total_eur.amount;
  const ter =
    totals.weighted_ter === undefined
      ? undefined
      : totals.weighted_ter.mul(value.sub(totals.ter_missing_eur.amount)).div(value);
  const kept = Decimal.ONE.sub((commission ?? Decimal.ZERO).div(HUNDRED));
  const shares = weights.by_class.filter(
    (share) => share.value_eur.amount.isPositive() || share.target_pct.isPositive(),
  );
  const twelfthRoot = rootsOnce();
  const sum = (year: number, which: ProjectionCase, net: boolean): Decimal =>
    shares.reduce((total, share: ClassSubtotal) => {
      const rate = rateAt(assumptions.classes[share.asset_class], which, year);
      const contribution = monthly.mul(share.target_pct).div(HUNDRED);
      return total.add(
        futureValue(
          twelfthRoot,
          share.value_eur.amount,
          net ? contribution.mul(kept) : contribution,
          net ? rate.sub(ter ?? Decimal.ZERO) : rate,
          year,
        ),
      );
    }, Decimal.ZERO);

  const taxYear = yearOf(weights.date);
  const invested = totals.invested_eur.amount;
  const taxOn = (pot: Decimal, year: number): Decimal => {
    const gain = pot.sub(invested.add(monthly.mul(Decimal.parse(String(12 * year)))));
    if (!gain.isPositive()) {
      return Decimal.ZERO;
    }
    const quota = quotaOfBase(eur(gain), taxYear, settings.savings_tax_brackets);
    if (quota === undefined) {
      if (!missing.includes("exit_tax")) {
        missing.push("exit_tax");
      }
      return Decimal.ZERO;
    }
    return quota.amount;
  };
  const deflator = Decimal.ONE.add(assumptions.inflationPct.div(HUNDRED));
  const shown = (year: number, which: ProjectionCase): Decimal => {
    if (year === 0) {
      return value;
    }
    const pot = sum(year, which, discounts.fees);
    const taxed = discounts.taxes ? pot.sub(taxOn(pot, year)) : pot;
    return discounts.inflation ? taxed.div(powerOf(deflator, year)) : taxed;
  };

  const points: ProjectionCasesPoint[] = [];
  for (let year = 0; year <= years; year += 1) {
    points.push({
      year,
      low_eur: eur(shown(year, "low")),
      normal_eur: eur(shown(year, "normal")),
      high_eur: eur(shown(year, "high")),
      contributed_eur: eur(value.add(monthly.mul(Decimal.parse(String(12 * year))))),
    });
  }
  const endOf = (which: ProjectionCase): ProjectionCaseEnd => {
    const gross = years === 0 ? value : sum(years, which, false);
    const net = years === 0 ? value : sum(years, which, true);
    return {
      value_eur: eur(shown(years, which)),
      gross_eur: eur(gross),
      fees_eur: eur(gross.sub(net)),
      tax_eur: eur(taxOn(net, years)),
    };
  };
  return {
    ...withStart,
    ...(ter === undefined ? {} : { ter_pct: ter }),
    points,
    ends: { low: endOf("low"), normal: endOf("normal"), high: endOf("high") },
  };
};
