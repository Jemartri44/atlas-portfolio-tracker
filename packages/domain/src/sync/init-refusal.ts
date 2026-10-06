// What an initialisation refuses before calling the remote (ADR-0026, Part B;
// §6.3 (V7)): an invalid ledger never reaches the cloud.

import type { DomainError } from "../errors.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { LedgerEvent } from "../schema/events.js";
import type { Refusal } from "./permission.js";

/** The events of a ledger that are invalid now, with their code. */
const invalidOf = (events: readonly LedgerEvent[]): { id: string; code: string }[] => {
  try {
    return projectLedger(events, { collectErrors: true }).invalid.map((entry) => ({
      id: entry.event.id,
      code: entry.error.code,
    }));
  } catch (error) {
    return [
      { id: String((error as DomainError).details.event_id), code: (error as DomainError).code },
    ];
  }
};

/**
 * The client refuses to initialise **before calling** when its ledger is not
 * valid (a `settings_changed` recorded with `acceptInvalid` before the sync
 * was configured, any invalid event): the remote never receives an invalid
 * ledger, and an `init_rejected` must never be the normal path (V7).
 */
export const initRefusal = (events: readonly LedgerEvent[]): Refusal | undefined => {
  const invalid = invalidOf(events);
  return invalid.length > 0
    ? { code: "init_refused_invalid_ledger", details: { invalid } }
    : undefined;
};
