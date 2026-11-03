// «Este mes»: the contribution plan of the month as a list of tasks, each with whether it is already
// recorded. It never writes and never places an order: it reads the ledger.
//
// **The plan is fixed for the whole month.** It is `contributionPlan` computed with the state, the
// settings in force and the prices of the **last day of the month before**, with the monthly amount
// of those settings. Computed at today's date instead, every purchase recorded would move what is
// left to buy, and the list would never close.
//
// A row is done when the month holds a live operation for it, from its first day to the date read:
// - the deposit, with any `cash_deposit` into a core account;
// - an asset of the core, with any `buy` of that asset in a core account;
// - the bucket's budget, with any `buy` in a bucket account.
// Each done row carries the date of the first one and the euros recorded (gross basis of the
// purchase, or the deposit, at the rate of its own event), next to what the plan proposed. A row is
// not marked half done by amount: the user sees how much went in.

import { addDays, type CivilDate } from "../dates/civil-date.js";
import { asDomainError } from "../errors.js";
import { Money } from "../money/money.js";
import type { AssetClass, AssetId, LedgerEvent } from "../schema/events.js";
import { cashEurOf } from "./bucket-stats.js";
import { type ContributionPlan, contributionPlan } from "./contribution.js";
import { basisOf, fxOf } from "./operations.js";
import type { ExternalPrices } from "./prices.js";
import { businessDateOf, liveOperations, projectLedger } from "./project-ledger.js";
import { settingsAt } from "./settings-at.js";

export interface MonthTask {
  proposed_eur: Money;
  /** Business date of the first operation of the month that does it; absent while pending. */
  done_on?: CivilDate;
  /** What those operations add up to, in euros; zero while pending. */
  done_eur: Money;
}

export interface MonthAssetTask extends MonthTask {
  asset_id: AssetId;
  asset_class: AssetClass;
}

export type MonthPlan =
  | {
      status: "ready";
      /** `YYYY-MM` of the date read. */
      month: string;
      /** The day the plan was computed at: the last of the month before. */
      plan_date: CivilDate;
      plan: ContributionPlan;
      deposit: MonthTask;
      /** The core assets the plan sends money to, in its order. */
      assets: MonthAssetTask[];
      bucket: MonthTask;
    }
  | {
      /** The plan cannot be computed at `plan_date`; `code` is the domain's. */
      status: "unavailable";
      month: string;
      plan_date: CivilDate;
      code: string;
      details: Readonly<Record<string, unknown>>;
    };

const ZERO = Money.zero("EUR");

const task = (proposed: Money): MonthTask => ({ proposed_eur: proposed, done_eur: ZERO });

const record = (row: MonthTask, date: CivilDate, eur: Money): void => {
  if (row.done_on === undefined || date < row.done_on) {
    row.done_on = date;
  }
  row.done_eur = row.done_eur.add(eur);
};

export const monthPlan = (
  events: readonly LedgerEvent[],
  date: CivilDate,
  external?: ExternalPrices,
): MonthPlan => {
  const month = date.slice(0, 7);
  const first = `${month}-01`;
  const planDate = addDays(first, -1);
  // The ledger as it stood that day: a purchase of this month must not move the plan.
  const before = projectLedger(events, { collectErrors: true, asOf: planDate });
  const state = projectLedger(events, { collectErrors: true, asOf: date });
  let plan: ContributionPlan;
  try {
    plan = contributionPlan(before, {
      date: planDate,
      settings: settingsAt(before, planDate).settings,
      ...(external === undefined ? {} : { external }),
    });
  } catch (error) {
    const failure = asDomainError(error);
    return {
      status: "unavailable",
      month,
      plan_date: planDate,
      code: failure.code,
      details: failure.details,
    };
  }

  const deposit = task(plan.amount_eur);
  const bucket = task(plan.bucket_budget_eur);
  const assets: MonthAssetTask[] = plan.rows
    .filter((row) => row.allocation_eur.amount.isPositive())
    .map((row) => ({
      asset_id: row.asset_id,
      asset_class: row.asset_class,
      ...task(row.allocation_eur),
    }));
  const byAsset = new Map(assets.map((row) => [row.asset_id, row]));

  for (const event of liveOperations(state, events)) {
    if (event.type !== "cash_deposit" && event.type !== "buy") {
      continue;
    }
    const day = businessDateOf(state, event);
    if (day < first || day > date) {
      continue;
    }
    const book = state.accounts.get(event.account_id)?.book;
    if (event.type === "cash_deposit") {
      if (book === "core") {
        record(deposit, day, cashEurOf(event));
      }
      continue;
    }
    const eur = fxOf(event).toEur(basisOf(event));
    // A core purchase of an asset the plan sends nothing to is not a task of the month.
    const row =
      book === "bucket" ? bucket : book === "core" ? byAsset.get(event.asset_id) : undefined;
    if (row !== undefined) {
      record(row, day, eur);
    }
  }

  return { status: "ready", month, plan_date: planDate, plan, deposit, assets, bucket };
};
