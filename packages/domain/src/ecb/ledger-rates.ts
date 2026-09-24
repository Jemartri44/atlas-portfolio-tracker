// The ECB rates the ledger carries, found through **the one enumeration** of
// the schema (`FX_FIELDS` of `schema/validate.ts`; decision (q) of prompt 012).

import { type CivilDate, isCivilDate } from "../dates/civil-date.js";
import type { LedgerEvent } from "../schema/events.js";
import { FX_FIELDS } from "../schema/validate.js";

/** The earliest `fx_rate_date` of the ledger: where the TARGET cross-check starts. */
export const firstRateDateOf = (events: readonly LedgerEvent[]): CivilDate | undefined => {
  let first: CivilDate | undefined;
  for (const event of events) {
    const fields =
      (FX_FIELDS.dates as Partial<Record<string, readonly string[]>>)[event.type] ?? [];
    for (const field of fields) {
      const value = (event as unknown as Record<string, unknown>)[field];
      if (isCivilDate(value) && (first === undefined || value < first)) {
        first = value;
      }
    }
  }
  return first;
};
