// Reading the ledger without the screen falling over.
//
// Several projections **reject** instead of returning an empty answer, and they
// are right to: the contribution calculator refuses to split money over a core
// where a price is missing, and the transfer simulator refuses to draw a table
// of blank cells (decision (c) of prompt 004). What must not happen is that the
// refusal takes the whole screen with it — Núcleo has five blocks and one of
// them failing is not a reason to hide the other four (FR-013).

import { DomainError } from "@atlas/domain";
import { toAppError } from "./actions.js";
import type { AppError } from "./state.js";

export type Attempt<T> = { ok: true; value: T } | { ok: false; error: AppError };

/**
 * Runs a projection and turns its refusal into something paintable. Only a
 * `DomainError` is caught: it is the deliberate "I will not answer that", and
 * it comes with a code the message catalogue translates. Anything else is a
 * bug and goes up to the error boundary, where it belongs.
 */
export const attempt = <T>(run: () => T): Attempt<T> => {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, error: toAppError(error) };
    }
    throw error;
  }
};
