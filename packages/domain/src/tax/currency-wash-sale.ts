// The wash-sale rule on foreign currency (art. 33.5.e LIRPF, DGT V1613-25,
// criterion `4:currency_wash_sale`).
//
// A loss on converting currency to euros is not computed when the same
// currency is acquired again within the year after; it comes back when the
// currency acquired again is transmitted. The window looks only forwards, one
// year counted date to date, like direct crypto (letter e, not f or g).
//
// The readings, all in `docs/fiscal-questions.md` #4:
//
// - What is subject: a conversion to euros and a payment made with the
//   currency. Not the cover of currency spent without having it, what the
//   broker converted itself, nor the currency invested in an undertaking: those
//   stay computed (`4:auto_conversion` and the cover are open on their own).
// - What is an acquisition: every lot of the currency that opens after the
//   loss, whatever brought it in (a purchase with euros, a sale, a dividend).
// - When it comes back: when the lots that carry it are converted or paid
//   with. Investing, exchanging or withdrawing them imputes no difference
//   (art. 14.2.e, V2422-20), so the deferral passes to the next lots of the
//   currency in FIFO order and waits for the next conversion or payment.
// - Like a security (#19, #21): each unit acquired defers at most one unit
//   disposed of, what a transmission releases is looked at again with its own
//   loss, and a gain is never deferred.
//
// The walk reads `state.currencyJournal`, the record of what the single FIFO
// of currency did; which lots an outflow took is never decided again here.

import { addYears, type CivilDate, compareCivilDates } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { zero } from "../money/eur.js";
import { Money } from "../money/money.js";
import type { CurrencyGain, CurrencyGainKind } from "../projections/currency-lots.js";
import type { LedgerState } from "../projections/state.js";

const SUBJECT: ReadonlySet<CurrencyGainKind> = new Set(["conversion", "payment"]);

/** An acquisition of the currency that absorbed part of a loss. */
export interface CurrencyReacquisition {
  event_id: Ulid;
  lot_id: string;
  fiscal_date: CivilDate;
  /** Units of the lot used to defer the loss, in the currency. */
  amount: Money;
}

/** The rule applied to one exchange difference (one entry of `state.currencyGains`). */
export interface CurrencyWashOutcome {
  /** Deferred losses of earlier conversions that reached it with the lots it took. */
  released_eur: Money;
  /** Negative or zero, exact: of its own loss and of what reached it. */
  deferred_eur: Money;
  /** `own + released − deferred`, exact. Rounded once per operation by the caller. */
  computable_eur: Money;
  reacquired: CurrencyReacquisition[];
  /** Last day of the window, when something could be deferred. */
  window_end?: CivilDate;
  /** The window is still open on the date of the query. */
  provisional_until?: CivilDate;
}

export interface CurrencyWashResult {
  /** One per entry of `state.currencyGains`, in the same order. */
  outcomes: CurrencyWashOutcome[];
  /**
   * What is still deferred at 31/12 of `year`, per loss of origin (its index
   * in `state.currencyGains`): negative, exact, absent when nothing is.
   */
  pendingAt: (year: number) => Map<number, Money>;
}

/** Part of a deferred loss, with the conversion it came from. */
interface Share {
  origin: number;
  /** Negative, exact. */
  amount: Money;
}

const scale = (shares: readonly Share[], numerator: Money, denominator: Money): Share[] =>
  shares.map((share) => ({
    origin: share.origin,
    amount: share.amount.mul(numerator.amount).div(denominator.amount),
  }));

export const walkCurrencyWashSales = (state: LedgerState, today: CivilDate): CurrencyWashResult => {
  const outcomes: CurrencyWashOutcome[] = state.currencyGains.map((gain) => ({
    released_eur: zero(),
    deferred_eur: zero(),
    computable_eur: gain.gain_eur,
    reacquired: [],
  }));
  const journal = state.currencyJournal;
  /** What each lot of currency still holds, and the deferred losses it carries. */
  const held = new Map<string, Money>();
  const carried = new Map<string, Share[]>();
  /** Units of each lot already used to defer a loss (#19). */
  const used = new Map<string, Money>();
  /** The open lots of each currency, oldest first: the next a deferral passes to. */
  const queue = new Map<string, string[]>();
  /** Deferrals with no lot left to pass to: the next lot of the currency takes them. */
  const waiting = new Map<string, Share[]>();
  /** Every change of what is deferred: positive deferrals are negative amounts. */
  const movements: { year: number; origin: number; amount: Money }[] = [];

  const carry = (lotId: string, shares: readonly Share[]): void => {
    carried.set(lotId, [...(carried.get(lotId) ?? []), ...shares]);
  };

  journal.forEach((entry, index) => {
    if (entry.kind === "open") {
      held.set(entry.lot_id, entry.amount);
      queue.set(entry.currency, [...(queue.get(entry.currency) ?? []), entry.lot_id]);
      carry(entry.lot_id, waiting.get(entry.currency) ?? []);
      waiting.delete(entry.currency);
      return;
    }
    const moving: Share[] = [];
    for (const slice of entry.slices) {
      const before = held.get(slice.lot_id) as Money;
      const after = before.sub(slice.amount);
      // Every lot opened in the walk has its entry, empty or not.
      const shares = carried.get(slice.lot_id) as Share[];
      const parts = after.isZero() ? shares : scale(shares, slice.amount, before);
      held.set(slice.lot_id, after);
      carried.set(
        slice.lot_id,
        after.isZero()
          ? []
          : shares.map((share, i) => ({
              origin: share.origin,
              amount: share.amount.sub((parts[i] as Share).amount),
            })),
      );
      moving.push(...parts);
      if (after.isZero()) {
        queue.set(
          entry.currency,
          (queue.get(entry.currency) as string[]).filter((id) => id !== slice.lot_id),
        );
      }
    }
    const gain =
      entry.gain_index === undefined
        ? undefined
        : (state.currencyGains[entry.gain_index] as CurrencyGain);
    if (gain === undefined || !SUBJECT.has(gain.kind)) {
      // Nothing is realized: the deferral rides on the next lots of the currency.
      const next = queue.get(entry.currency)?.[0];
      if (next === undefined) {
        waiting.set(entry.currency, [...(waiting.get(entry.currency) ?? []), ...moving]);
      } else {
        carry(next, moving);
      }
      return;
    }
    const gainIndex = entry.gain_index as number;
    const outcome = outcomes[gainIndex] as CurrencyWashOutcome;
    // What the rule looks at (#21): the own loss, never a gain, and what is released.
    const deferrable: Share[] = [
      ...(gain.gain_eur.isNegative() ? [{ origin: gainIndex, amount: gain.gain_eur }] : []),
      ...moving,
    ];
    let reacquired = Money.zero(gain.amount.currency);
    if (deferrable.length > 0) {
      const end = addYears(gain.fiscal_date, 1);
      outcome.window_end = end;
      if (compareCivilDates(today, end) < 0) {
        outcome.provisional_until = end;
      }
      let left = gain.amount;
      for (const later of journal.slice(index + 1)) {
        if (left.isZero()) {
          break;
        }
        if (
          later.kind !== "open" ||
          later.currency !== entry.currency ||
          compareCivilDates(later.date, end) > 0
        ) {
          continue;
        }
        const before = used.get(later.lot_id) ?? Money.zero(later.currency);
        const free = later.amount.sub(before);
        if (free.isZero()) {
          continue;
        }
        const units = free.cmp(left) <= 0 ? free : left;
        used.set(later.lot_id, before.add(units));
        outcome.reacquired.push({
          event_id: later.event_id,
          lot_id: later.lot_id,
          fiscal_date: later.date,
          amount: units,
        });
        left = left.sub(units);
      }
      reacquired = gain.amount.sub(left);
    }
    // Each share is deferred in proportion to the units acquired again, and
    // the rest of it is computed now: the own loss stays, a release comes back.
    const deferred = scale(deferrable, reacquired, gain.amount);
    for (const line of outcome.reacquired) {
      carry(line.lot_id, scale(deferred, line.amount, reacquired));
    }
    deferrable.forEach((share, i) => {
      const kept = (deferred[i] as Share).amount;
      if (share.origin === gainIndex) {
        movements.push({ year: gain.year, origin: gainIndex, amount: kept });
        return;
      }
      const back = share.amount.sub(kept);
      if (!back.isZero()) {
        movements.push({ year: gain.year, origin: share.origin, amount: back.neg() });
      }
    });
    outcome.released_eur = moving.reduce((total, share) => total.add(share.amount), zero());
    outcome.deferred_eur = deferred.reduce((total, share) => total.add(share.amount), zero());
    outcome.computable_eur = gain.gain_eur.add(outcome.released_eur).sub(outcome.deferred_eur);
  });

  return {
    outcomes,
    pendingAt: (year) => {
      const pending = new Map<number, Money>();
      for (const movement of movements) {
        if (movement.year <= year) {
          pending.set(
            movement.origin,
            (pending.get(movement.origin) ?? zero()).add(movement.amount),
          );
        }
      }
      for (const [origin, amount] of pending) {
        if (amount.isZero()) {
          pending.delete(origin);
        }
      }
      return pending;
    },
  };
};
