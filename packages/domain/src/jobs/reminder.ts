// What the monthly reminder says (feature 016, E1, block 4; `docs/specification.md`
// §9.5), computed from data already read — the job decides nothing:
//
// - the contribution of the month split **by class of the core**, from
//   `contributionPlan`, with the note when a weight uses the reference-ETF
//   approximation; or the code of why it could not be computed;
// - the days since the last sign-in, **counting the console's** (ADR-0027,
//   «Riesgo»; ADR-0033, «Consecuencias»): the latest of the date the API
//   records for the web and the issue of every readable console token,
//   revoked and expired ones included, since each issue was a pass through
//   Google; and the warning before the six months after which Google may
//   delete an unused OAuth client;
// - how many console tokens are alive and how many were issued in the month
//   just ended, without names; **an unreadable record is counted as such,
//   never left out nor taken for alive** (mutant 8).

import { type TokenRecord, tokenStatus } from "../access/token.js";
import { addMonths, type CivilDate, daysBetween } from "../dates/civil-date.js";
import { madridDateOf } from "../dates/madrid.js";
import { Decimal } from "../money/decimal.js";
import { Money } from "../money/money.js";
import type { ContributionPlan } from "../projections/contribution.js";
import { ASSET_CLASSES, type AssetClass } from "../schema/events.js";
import { previousPeriod } from "./periods.js";

const HUNDRED = Decimal.parse("100");

export interface ReminderInput {
  /** The period of the job, `YYYY-MM`. */
  readonly period: string;
  readonly today: CivilDate;
  readonly nowMs: number;
  readonly plan: ContributionPlan | { readonly failure: string };
  readonly webSignIn: CivilDate | "unreadable" | undefined;
  readonly tokens: readonly (TokenRecord | "unreadable")[] | "unavailable";
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

export type TokenFacts =
  | { readonly alive: number; readonly issued: number; readonly unreadable: number }
  | "unavailable";

export interface ReminderFacts {
  readonly period: string;
  /** The month the issued tokens are counted in: the one just ended. */
  readonly issuedMonth: string;
  readonly contribution: ContributionFacts;
  readonly signIn: SignInFacts;
  readonly tokens: TokenFacts;
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

const latest = (dates: readonly CivilDate[]): CivilDate | undefined =>
  dates.length === 0 ? undefined : [...dates].sort().at(-1);

export const reminderFacts = (input: ReminderInput): ReminderFacts => {
  const issuedMonth = previousPeriod("monthly", input.today);
  const readable =
    input.tokens === "unavailable"
      ? []
      : input.tokens.filter((token): token is TokenRecord => token !== "unreadable");
  const last = latest([
    ...(input.webSignIn === undefined || input.webSignIn === "unreadable" ? [] : [input.webSignIn]),
    ...readable.map((token) => madridDateOf(token.issued_at)),
  ]);
  const days = last === undefined ? undefined : daysBetween(last, input.today);
  const since: SignInFacts =
    last === undefined || days === undefined
      ? { webUnreadable: input.webSignIn === "unreadable" }
      : {
          last,
          days,
          ...(days >= input.idleWarningDays ? { deadline: addMonths(last, 6) } : {}),
          webUnreadable: input.webSignIn === "unreadable",
        };
  return {
    period: input.period,
    issuedMonth,
    contribution: contributionOf(input.plan),
    signIn: since,
    tokens:
      input.tokens === "unavailable"
        ? "unavailable"
        : {
            alive: readable.filter((token) => tokenStatus(token, input.nowMs) === "active").length,
            issued: readable.filter(
              (token) => madridDateOf(token.issued_at).slice(0, 7) === issuedMonth,
            ).length,
            unreadable: input.tokens.length - readable.length,
          },
  };
};
