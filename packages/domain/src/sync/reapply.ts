// **The** use case of the sync (ADR-0026, Part B, step 3; Consequences: "used
// by the client and by the Lambda"): re-apply units, one by one and in their
// order, on top of a base, and **stop at the first that fails**. What makes a
// unit fail is given by each side as a check — the client holds back what it
// must not upload, the remote refuses what it must not write —, and both
// checks run the same validation of the domain (`evaluateUnit`).

import type { LedgerEvent } from "../schema/events.js";

/** A unit as both sides see it: its exact lines and their events. */
export interface ReapplyUnit {
  readonly lines: readonly string[];
  readonly events: readonly LedgerEvent[];
}

/** The base the next unit lands on: the remote plus what was accepted before it. */
export interface ReapplyBase {
  readonly lines: readonly string[];
  readonly events: readonly LedgerEvent[];
}

export interface ReapplyOutcome<U, F> {
  /** The units accepted, from the first. */
  readonly accepted: readonly U[];
  /** The first unit that failed and why; absent when all were accepted. */
  readonly failed?: { readonly unit: U; readonly index: number; readonly reason: F };
  /** The base after the accepted units. */
  readonly base: ReapplyBase;
}

/**
 * Walks the units in order over `base`. `check` answers `undefined` to accept
 * a unit or the reason it fails; nothing after the first failure is looked at,
 * and a pair or a chain is one unit, so it counts as one line for the stop.
 */
export const reapplyUnits = <U extends ReapplyUnit, F>(
  base: ReapplyBase,
  units: readonly U[],
  check: (unit: U, base: ReapplyBase) => F | undefined,
): ReapplyOutcome<U, F> => {
  let current = base;
  const accepted: U[] = [];
  for (const [index, unit] of units.entries()) {
    const reason = check(unit, current);
    if (reason !== undefined) {
      return { accepted, failed: { unit, index, reason }, base: current };
    }
    accepted.push(unit);
    current = {
      lines: [...current.lines, ...unit.lines],
      events: [...current.events, ...unit.events],
    };
  }
  return { accepted, base: current };
};
