// Which informative return the ledger has on record, and which one the rule of
// the 20.000 € is measured against (feature 010, block 3).

import type { CivilDate } from "../dates/civil-date.js";
import { type Filing, filingInForce } from "../projections/filings.js";
import type { LedgerState } from "../projections/state.js";
import type { InformativeModel } from "../settings/settings.js";

/**
 * The **last** return of the model filed for a year before `year`.
 *
 * The last, not the one of the year before: what obliges again is a rise over
 * what was actually declared, and if nothing was filed in 2028 then the rise of
 * 2029 is measured against 2027. Reading the previous year instead would let a
 * category creep up 20.000 € a year for ever without ever obliging — the mutant
 * the hand-computed exercise §6.2 exists to kill, where 2029 rises 20.000,01
 * over 2027 and only 0,01 over 2028.
 */
export const lastFiledBefore = (
  state: LedgerState,
  model: InformativeModel,
  year: number,
  at: CivilDate,
): Filing | undefined => {
  const years = new Set<number>();
  for (const filing of state.filings.values()) {
    if (filing.model === model && filing.tax_year < year && filing.filed_at <= at) {
      years.add(filing.tax_year);
    }
  }
  if (years.size === 0) {
    return undefined;
  }
  // The chain of that year decides which of its filings is in force: a
  // supplementary return replaces the original, and a query about the past does
  // not see what was filed after it (ADR-0016).
  return filingInForce(state, model, Math.max(...years), at);
};
