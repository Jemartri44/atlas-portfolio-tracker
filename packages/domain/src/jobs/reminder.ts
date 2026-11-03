// What the monthly reminder says (`docs/specification.md`
// §9.5), computed from data already read — the job decides nothing:
//
// - the contribution of the month split **by class of the core**, from
//   `contributionPlan`, with the note when a weight uses the reference-ETF
//   approximation; or the code of why it could not be computed;
// - the days since the last sign-in (ADR-0027, «Riesgo»): the date the API
//   records for the web, and the warning before the six months after which
//   Google may delete an unused OAuth client.

import { addMonths, type CivilDate, daysBetween } from "../dates/civil-date.js";
import { Decimal, HUNDRED } from "../money/decimal.js";
import { Money } from "../money/money.js";
import type { ContributionPlan } from "../projections/contribution.js";
import { ASSET_CLASSES, type AssetClass } from "../schema/events.js";

export interface ReminderInput {
  /** The period of the job, `YYYY-MM`. */
  readonly period: string;
  readonly today: CivilDate;
  readonly plan: ContributionPlan | { readonly failure: string };
  readonly webSignIn: CivilDate | "unreadable" | undefined;
  readonly idleWarningDays: number;
}

export interface ClassShare {
  readonly asset_class: AssetClass;
  /** Of the core amount, rounded to one decimal, half up. */
  readonly pct: Decimal;
  readonly eur: Money;
}

export type ContributionFacts =
  | {
      readonly ok: true;
      readonly classes: readonly ClassShare[];
      readonly total: Money;
      readonly core: Money;
      readonly bucket: Money;
      readonly approximation: boolean;
    }
  | { readonly ok: false; readonly code: string };

export interface SignInFacts {
  readonly last?: CivilDate;
  readonly days?: number;
  /** Set when the days reach the configured warning: the date by which to sign in. */
  readonly deadline?: CivilDate;
  readonly webUnreadable: boolean;
}

export interface ReminderFacts {
  readonly period: string;
  readonly contribution: ContributionFacts;
  readonly signIn: SignInFacts;
}

const contributionOf = (plan: ReminderInput["plan"]): ContributionFacts => {
  if ("failure" in plan) {
    return { ok: false, code: plan.failure };
  }
  const core = plan.core_amount_eur;
  const classes = ASSET_CLASSES.map((assetClass) => {
    const eur = plan.rows
      .filter((row) => row.asset_class === assetClass)
      .reduce((sum, row) => sum.add(row.allocation_eur), Money.zero(core.currency));
    return {
      asset_class: assetClass,
      pct: core.isZero() ? Decimal.ZERO : eur.amount.mul(HUNDRED).div(core.amount).round(1),
      eur,
    };
  });
  return {
    ok: true,
    classes,
    total: plan.amount_eur,
    core,
    bucket: plan.bucket_budget_eur,
    approximation: plan.warnings.some((warning) => warning.code === "weights_use_approximation"),
  };
};

export const reminderFacts = (input: ReminderInput): ReminderFacts => {
  const last =
    input.webSignIn === undefined || input.webSignIn === "unreadable" ? undefined : input.webSignIn;
  const webUnreadable = input.webSignIn === "unreadable";
  const days = last === undefined ? undefined : daysBetween(last, input.today);
  const since: SignInFacts =
    last === undefined || days === undefined
      ? { webUnreadable }
      : {
          last,
          days,
          ...(days >= input.idleWarningDays ? { deadline: addMonths(last, 6) } : {}),
          webUnreadable,
        };
  return {
    period: input.period,
    contribution: contributionOf(input.plan),
    signIn: since,
  };
};
