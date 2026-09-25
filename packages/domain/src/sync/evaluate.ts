// The validation of one unit on top of a base, **as the application writes
// it** (ADR-0026, Part A and Part B, step 3; §6.3 (V1) of prompt 014): every
// member added together — a pair is its reversal **and** its correction, a
// chain all its pairs, like `checkCandidate` in `rectify.ts` and
// `rule-change.ts` —, never the reversal alone. A buy of 10, a sale of 10 and
// the buy corrected to 12 is accepted, although the reversal alone would
// leave the sale without lots.
//
// Shared by the client, which decides what it holds back, and by the remote,
// which decides what it accepts: one definition of "the domain refuses it".
//
// **The base is valid**: both callers check it before re-applying anything
// (a remote that is already invalid stops the sync, `remote_ledger_invalid`),
// so everything the candidate breaks is the unit's doing.

import type { DomainError } from "../errors.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { LedgerState } from "../projections/state.js";
import type { LedgerEvent, SupportedEvent } from "../schema/events.js";
import { newlyInvalid } from "../usecases/invalid-events.js";
import { checkIsinUnique } from "../usecases/record-event.js";

/** A third event a unit leaves invalid, with the code it now fails with. */
export interface AffectedByUnit {
  readonly id: string;
  readonly code: string;
}

export interface UnitFailure {
  /**
   * Who fails: the only line of a single unit (`line`), a member of a pair or
   * a chain (`reversal`, `correction`), or a third event the unit leaves
   * invalid (`other`).
   */
  readonly member: "line" | "reversal" | "correction" | "other";
  /** Position of the failing member inside the unit; absent for `other`. */
  readonly member_index?: number;
  /** The code of the domain: `insufficient_position`, `duplicate_id`, `dependent_events`… */
  readonly domain_code: string;
  readonly affected?: readonly AffectedByUnit[];
}

export type UnitCheck =
  | { readonly ok: true; readonly state: LedgerState }
  | { readonly ok: false; readonly failure: UnitFailure };

const memberFailure = (unit: readonly LedgerEvent[], index: number, code: string): UnitFailure => ({
  member:
    unit.length === 1
      ? "line"
      : (unit[index] as LedgerEvent).type === "reversal"
        ? "reversal"
        : "correction",
  member_index: index,
  domain_code: code,
});

/** Projects `base` plus the whole unit and says whether the domain accepts it. */
export const evaluateUnit = (
  base: readonly LedgerEvent[],
  unit: readonly LedgerEvent[],
): UnitCheck => {
  let check: ReturnType<typeof newlyInvalid>;
  try {
    check = newlyInvalid(base, [...base, ...unit]);
  } catch (error) {
    // Only `duplicate_id` is raised even while collecting errors (pass 0 of
    // the projection), and it is always about an id the unit brings, because
    // the base alone projects. Anything else thrown here is a bug, and reading
    // its details fails loudly rather than holding a line back for it.
    const failure = error as DomainError;
    const id = failure.details.event_id;
    return {
      ok: false,
      failure: memberFailure(
        unit,
        unit.findIndex((event) => event.id === id),
        failure.code,
      ),
    };
  }
  const own = unit.findIndex((event) => check.fresh.some((entry) => entry.event.id === event.id));
  if (own >= 0) {
    const entry = check.fresh.find(
      (candidate) => candidate.event.id === (unit[own] as LedgerEvent).id,
    );
    return {
      ok: false,
      failure: memberFailure(unit, own, (entry as { error: DomainError }).error.code),
    };
  }
  if (check.fresh.length > 0) {
    const settings = unit.length === 1 && (unit[0] as LedgerEvent).type === "settings_changed";
    return {
      ok: false,
      failure: {
        member: "other",
        domain_code: settings ? "newly_invalid_events" : "dependent_events",
        affected: check.fresh.map((entry) => ({ id: entry.event.id, code: entry.error.code })),
      },
    };
  }
  for (const [index, event] of unit.entries()) {
    try {
      checkIsinUnique(check.state, event as SupportedEvent, () =>
        projectLedger(base, { collectErrors: true }),
      );
    } catch (error) {
      return { ok: false, failure: memberFailure(unit, index, (error as DomainError).code) };
    }
  }
  return { ok: true, state: check.state };
};
