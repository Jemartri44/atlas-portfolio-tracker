// What is left to offset, and what is about to stop being possible.
//
// Apart from `year.ts` because it answers a different question: that one
// says what the return holds, this one says what the user still carries and
// how long he has to use it. The whole point of the file is in the comment
// of `ExpiryWarning`.

import type { Money } from "@atlas/domain";
import type { PendingLoss } from "@atlas/domain/fiscal";

/**
 * A balance that is about to stop being usable, with **when**.
 *
 * It exists because the table says the expiry year in a column and a column
 * does not shout: the only moment the user can do anything about a balance is
 * *during* its last usable year, by realising gains before 31 December to
 * absorb it. Later the warning arrives at the funeral.
 *
 * `last` is read off `expired` and **not** off `pending`, and that is the
 * whole point: in the year a balance can be used for the last time the engine
 * reports what is left of it as expired *at the close of that year*, so a
 * condition over `pending` with `expires_after === year` is never true. There
 * was one, it never fired once, and code that looks like it protects something
 * and never runs is worse than no code at all.
 */
export interface ExpiryWarning {
  key: string;
  category: PendingLoss["category"];
  origin_year: number;
  expires_after: number;
  /** `last`: its last year, still running. `next`: one more year after this one. */
  when: "last" | "next";
}

export interface PendingView {
  key: string;
  origin_year: number;
  category: PendingLoss["category"];
  amount_eur: Money;
  expires_after: number;
}

export const expiryWarning = (loss: PendingLoss, when: "last" | "next"): ExpiryWarning => ({
  key: `${loss.origin_year}:${loss.category}:${when}`,
  category: loss.category,
  origin_year: loss.origin_year,
  expires_after: loss.expires_after,
  when,
});

export const pendingView = (loss: PendingLoss): PendingView => ({
  key: `${loss.origin_year}:${loss.category}`,
  origin_year: loss.origin_year,
  category: loss.category,
  amount_eur: loss.amount_eur,
  expires_after: loss.expires_after,
});
