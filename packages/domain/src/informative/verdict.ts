// Whether a category of an informative return obliges (feature 010, block 3;
// decision (h) of the prompt).
//
// **Never "not obliged" with incomplete data.** Saying there is nothing to file
// when there is has consequences; saying "this cannot be determined yet" with
// the action that resolves it is the fail-safe reading of constitution V. So
// the only way to reach `not_obliged` is with every asset of the category
// valued and none of the values marked — and even then, an amount that is
// already above the threshold obliges whether or not the rest is known, and the
// output names the marked values it was decided with.
//
// Every comparison is **strictly above**: 50.000,00 does not oblige and
// 50.000,01 does; a rise of 20.000,00 does not and one of 20.000,01 does. The
// law says "superior a", and the hand-computed exercise §6.2 sits on both
// edges on purpose.

import { Decimal } from "../money/decimal.js";
import type { Money } from "../money/money.js";
import type { AccountId, AssetId } from "../schema/events.js";
import type { InformativeCategory, InformativeItem, VerdictReason } from "./report.js";

/** An asset of the category the verdict could not use, or used with a mark. */
export interface FlaggedItem {
  account_id: AccountId;
  asset_id?: AssetId;
  flag: InformativeItem["flags"][number];
}

export interface Limits {
  threshold: Decimal;
  increase: Decimal;
  alert: Decimal;
}

/** What the last return declared of this category, when it declared it at all. */
export interface Declared {
  year: number;
  value_eur?: Money;
  q4_average_eur?: Money;
  /** An asset of its list that is no longer held: the second trigger (S7, Q7). */
  extinct: { account_id: AccountId; asset_id?: AssetId }[];
}

export interface VerdictInput {
  items: readonly InformativeItem[];
  /** Sum of the rounded values of the assets that have one. */
  value_eur: Money;
  /** Accounts only: the same for the average of the fourth quarter. */
  q4_average_eur?: Money;
  missing: FlaggedItem[];
  flagged: FlaggedItem[];
  /** Sum of the rounded values of the flagged assets: what the verdict would lose without them. */
  flagged_eur: Money;
  limits: Limits;
  declared?: Declared;
}

const above = (amount: Money, limit: Decimal): boolean => amount.amount.gt(limit);

const HUNDRED = Decimal.parse("100");

/**
 * How much of the threshold the category is. It is the one figure of the
 * informative card that is not an amount of the ledger, and it used to be
 * divided in the web view-model: down here, the console and the screen cannot
 * answer "how close am I to having to file" differently.
 */
const shareOf = (value: Money, threshold: Decimal): string | undefined =>
  threshold.isZero() ? undefined : value.amount.div(threshold).mul(HUNDRED).round(1).toString();

/** The two figures a category is judged on: at 31 December and, for cash, on average. */
const figures = (input: VerdictInput): { value: Money; average: boolean }[] => [
  { value: input.value_eur, average: false },
  ...(input.q4_average_eur === undefined ? [] : [{ value: input.q4_average_eur, average: true }]),
];

const reasonsOf = (input: VerdictInput): VerdictReason[] => {
  const reasons: VerdictReason[] = [];
  const declared = input.declared;
  if (declared === undefined || declared.value_eur === undefined) {
    // Nothing filed for this category before: the threshold decides, as it does
    // the first time. A return that declared other categories and not this one
    // is the same case, and says so.
    for (const figure of figures(input)) {
      if (above(figure.value, input.limits.threshold)) {
        reasons.push({
          kind: declared === undefined ? "threshold" : "first_time_category",
          after_eur: figure.value,
          ...(declared === undefined ? {} : { against_year: declared.year }),
        });
      }
    }
    return reasons;
  }
  const before = new Map<boolean, Money | undefined>([
    [false, declared.value_eur],
    [true, declared.q4_average_eur],
  ]);
  for (const figure of figures(input)) {
    const was = before.get(figure.average);
    if (was !== undefined && above(figure.value.sub(was), input.limits.increase)) {
      reasons.push({
        kind: figure.average ? "increase_q4_average" : "increase",
        before_eur: was,
        after_eur: figure.value,
        against_year: declared.year,
      });
    }
  }
  for (const gone of declared.extinct) {
    reasons.push({
      kind: "extinction",
      account_id: gone.account_id,
      ...(gone.asset_id === undefined ? {} : { asset_id: gone.asset_id }),
      against_year: declared.year,
    });
  }
  return reasons;
};

/** The verdict of one category, with every reason that reaches it. */
export const verdictOf = (
  category: InformativeCategory["category"],
  input: VerdictInput,
): Pick<
  InformativeCategory,
  | "category"
  | "items"
  | "value_eur"
  | "complete"
  | "verdict"
  | "reasons"
  | "missing"
  | "decided_with"
  | "threshold_share_pct"
> => {
  const complete = input.missing.length === 0 && input.flagged.length === 0;
  const reasons = reasonsOf(input);
  const obliged = reasons.length > 0;
  // Incomplete and not obliged with what is known: the answer is not "no".
  // Nothing written down at all is not "no" either, and it is not the same
  // thing as a category that was computed and came out under the threshold.
  const verdict = obliged
    ? "obliged"
    : input.items.length === 0
      ? "nothing_recorded"
      : complete
        ? "not_obliged"
        : "undetermined";
  if (verdict === "not_obliged") {
    for (const figure of figures(input)) {
      if (
        !figure.value.amount.lt(input.limits.alert) &&
        !above(figure.value, input.limits.threshold)
      ) {
        reasons.push({ kind: "alert", after_eur: figure.value });
      }
    }
  }
  // Which marked values the verdict leans on: those without which it would not
  // be reached. With them removed the category may still oblige, and then they
  // decided nothing (S16).
  const withoutFlagged = {
    ...input,
    value_eur: input.value_eur.sub(input.flagged_eur),
    ...(input.q4_average_eur === undefined
      ? {}
      : { q4_average_eur: input.q4_average_eur.sub(input.flagged_eur) }),
  };
  const decided =
    verdict === "obliged" && input.flagged.length > 0 && reasonsOf(withoutFlagged).length === 0
      ? input.flagged
      : [];
  const share = shareOf(input.value_eur, input.limits.threshold);
  return {
    category,
    items: [...input.items],
    value_eur: input.value_eur,
    complete,
    verdict,
    reasons,
    missing: input.missing,
    decided_with: decided,
    ...(share === undefined ? {} : { threshold_share_pct: share }),
  };
};
