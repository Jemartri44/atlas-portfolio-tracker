// Which **original loss** each deferred amount belongs to (ficha F5, question
// Q10 of feature 010).
//
// The engine integrates what a repurchase released **into the disposal that
// releases it** and applies the rule again to the total (#20, #21). The form of
// 2025 is organised the other way round: every operation carries its own "loss
// obtained" and "loss imputable to 2025", and what comes back from an **earlier
// year** goes to a section of its own (0394–0396). The totals are the same; the
// rows are not. A sale with a gain of its own that releases an earlier loss is a
// **gain** on the form and a loss in the engine.
//
// So the layout needs something the engine never had to write down: of what is
// still deferred at 31/12, how much belongs to each original loss. The rule the
// direction numbered:
//
//   - a deferral produced by a disposal whose **own** result was negative is
//     its own, up to the size of that own loss;
//   - whatever is left of it belongs to the losses that disposal **released**,
//     pro rata, and so on backwards.
//
// Every split keeps the remainder on the last part, so the pieces add up to the
// whole **exactly**: the invariant that the rows reproduce the balance of the
// report is checked on these amounts, and a division that lost a cent would
// turn it into an approximation nobody could tell from a defect.

import { Money } from "../../money/money.js";
import type { RealizedGain } from "../../projections/state.js";
import { type ChainCore, deferredAt } from "../chain.js";
import type { PendingDeferral, WashSaleOutcome } from "../wash-sale.js";

const EUR = "EUR";

/** A share of a deferral, in magnitude: which original loss it belongs to, and how much. */
interface Part {
  /** Index in `state.gains` of the disposal whose own loss this is. */
  origin: number;
  weight: Money;
}

const zero = (): Money => Money.zero(EUR);

/**
 * The one closer to zero. Every amount here is a loss, so it is negative, and
 * everything is kept with its sign: a deferral, what it took from the own
 * result of the operation and what it took from what that operation released.
 */
const nearerZero = (a: Money, b: Money): Money => (a.cmp(b) > 0 ? a : b);

/**
 * How a deferral is shared among the losses behind it, in amounts that add up
 * to the deferral itself.
 *
 * The **first part is always the disposal's own**, even when it is zero, so a
 * deferral that comes only from the operation itself has exactly one part and
 * the walk that reads these has an end. What is left after the own loss belongs
 * to what the disposal released, pro rata, and the last release takes the
 * remainder so that the pieces add up exactly.
 */
const partsOf = (outcome: WashSaleOutcome): Part[] => {
  const deferred = outcome.deferred_eur;
  // At most the whole of the own result, which the deferral never exceeds on
  // its own account: what goes beyond it came from a release (#21).
  const own = outcome.own_eur.isNegative() ? nearerZero(deferred, outcome.own_eur) : zero();
  const rest = deferred.sub(own);
  const parts: Part[] = [{ origin: outcome.gain_index, weight: own }];
  if (rest.isZero()) {
    return parts;
  }
  // The total of the releases is never zero here: a deferral larger than the
  // own loss only exists because a release made the operation worse.
  const releases = outcome.released.filter((release) => !release.amount_eur.isZero());
  const whole = releases.reduce((total, release) => total.add(release.amount_eur), zero());
  let left = rest;
  releases.forEach((release, index) => {
    const share =
      index === releases.length - 1 ? left : rest.mul(release.amount_eur.amount).div(whole.amount);
    left = left.sub(share);
    parts.push({ origin: release.origin, weight: share });
  });
  return parts;
};

/**
 * What is still deferred at the close of `year`, by the **original** loss it
 * comes from. Negative amounts, exact, and they add up to the deferred total of
 * that year.
 */
export const deferredByOrigin = (chain: ChainCore, year: number): Map<number, Money> => {
  const byGain = new Map<number, WashSaleOutcome>(
    chain.walk.outcomes.map((outcome) => [outcome.gain_index, outcome]),
  );
  const parts = new Map<number, Part[]>();
  const partsFor = (gainIndex: number): Part[] => {
    let found = parts.get(gainIndex);
    if (found === undefined) {
      found = partsOf(byGain.get(gainIndex) as WashSaleOutcome);
      parts.set(gainIndex, found);
    }
    return found;
  };
  const total = new Map<number, Money>();
  const add = (origin: number, amount: Money): void => {
    total.set(origin, (total.get(origin) ?? zero()).add(amount));
  };
  /**
   * Splits `amount`, deferred by the disposal `gainIndex`, among the original
   * losses behind it. The chain of releases always goes backwards in time, so
   * it terminates.
   */
  const split = (gainIndex: number, amount: Money): void => {
    const shares = partsFor(gainIndex);
    const whole = shares.reduce((sum, part) => sum.add(part.weight), zero());
    // One part is always the disposal's own, and a second only ever comes from
    // a release: a single part is therefore its own loss, and the end of the
    // walk. It is the ordinary case, and the only one most ledgers ever see.
    if (shares.length === 1) {
      add(gainIndex, amount);
      return;
    }
    let left = amount;
    shares.forEach((part, index) => {
      const piece =
        index === shares.length - 1 ? left : amount.mul(part.weight.amount).div(whole.amount);
      left = left.sub(piece);
      if (part.origin === gainIndex) {
        add(gainIndex, piece);
      } else {
        split(part.origin, piece);
      }
    });
  };
  for (const entry of deferredAt(chain.walk, year) as readonly PendingDeferral[]) {
    split(entry.origin, entry.amount_eur);
  }
  return total;
};

/** The disposal an index of `state.gains` names, which every row is anchored to. */
export const gainOf = (chain: ChainCore, index: number): RealizedGain =>
  chain.state.gains[index] as RealizedGain;

/** The index in `state.gains` of a disposal, by the event and account its line names. */
export const gainIndexOf = (chain: ChainCore): Map<string, number> => {
  const index = new Map<string, number>();
  chain.state.gains.forEach((gain, position) => {
    index.set(`${gain.event_id}|${gain.account_id}`, position);
  });
  return index;
};
