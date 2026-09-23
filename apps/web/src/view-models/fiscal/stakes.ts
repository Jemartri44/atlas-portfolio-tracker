// What a criterion puts at stake, turned into what the screen paints.
//
// Apart from `year.ts` because it answers a different question: that one says
// what the return holds, this one says what of it rests on a reading that
// could be another. Two rules govern it:
//
//   1. the **direction** of the risk and the **amount** are kept apart: the
//      direction is shown with the privacy mask on and the amount is not;
//   2. an entry that the engine gives no motive for is named by the operations
//      it comes from. The engine emits one entry per motive, so the same
//      criterion appears more than once in the list, and two identical lines
//      with different amounts beside them say nothing to anybody.

import type { Money } from "@atlas/domain";
import type { CriterionId, CriterionStake } from "@atlas/domain/fiscal";

/** A criterion with what its other reading would move, for either of the two lists. */
export interface StakeView {
  criterion: CriterionId;
  certainty: CriterionStake["certainty"];
  measure: CriterionStake["measure"];
  /** The amount, when there is one: a difference on the base or the exposure. */
  amount_eur?: Money;
  /** The other two differences, when the alternative reading moves them. */
  pending_eur?: Money;
  deferred_eur?: Money;
  direction: CriterionStake["direction"];
  reason?: CriterionStake["reason"];
  operations: number;
  /** The operations it comes from, by asset and fiscal date, at most three. */
  subjects: readonly string[];
  /** How many more operations there are beyond the three named. */
  more: number;
  markets?: readonly string[];
}

/** How many operations of a criterion are named before the rest are counted. */
const NAMED_SUBJECTS = 3;

export const stakeView = (
  stake: CriterionStake,
  /** Event id → "asset · fiscal date", the same wording the rows of the year use. */
  subjectOf: ReadonlyMap<string, string>,
): StakeView => {
  const named = [...new Set(stake.event_ids.map((id) => subjectOf.get(id)))].filter(
    (subject): subject is string => subject !== undefined,
  );
  return {
    criterion: stake.criterion,
    certainty: stake.certainty,
    measure: stake.measure,
    ...(stake.base_difference_eur === undefined
      ? stake.exposure_eur === undefined
        ? {}
        : { amount_eur: stake.exposure_eur }
      : { amount_eur: stake.base_difference_eur }),
    ...(stake.pending_difference_eur === undefined
      ? {}
      : { pending_eur: stake.pending_difference_eur }),
    ...(stake.deferred_difference_eur === undefined
      ? {}
      : { deferred_eur: stake.deferred_difference_eur }),
    direction: stake.direction,
    ...(stake.reason === undefined ? {} : { reason: stake.reason }),
    operations: stake.event_ids.length,
    subjects: named.slice(0, NAMED_SUBJECTS),
    more: Math.max(named.length - NAMED_SUBJECTS, 0),
    ...(stake.markets === undefined ? {} : { markets: stake.markets }),
  };
};
