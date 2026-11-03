// What has to be added by hand every January (`docs/business-rules.md`), said
// by the mail of the income tax: the CPI of the year that ended, and the index
// profiles and fund sheets read more than a year ago. Both tables are public
// reference data in the code, never the owner's: a profile is named by its
// index, and the funds are only counted, since which ones are listed says what
// the owner holds.

import { SPANISH_CPI } from "../charts/spanish-cpi.js";
import { addMonths, type CivilDate } from "../dates/civil-date.js";
import { DEFAULT_INDEX_TABLES, type IndexTables } from "../projections/index-profiles.js";

export interface AnnualUpkeep {
  /** The year whose CPI is not in the table, when it is not. */
  readonly missingCpi?: number;
  /** The names of the indexes whose sheet is more than a year old. */
  readonly staleProfiles: readonly string[];
  /** How many fund sheets are more than a year old. */
  readonly staleFunds: number;
}

const stale = (asOf: CivilDate, today: CivilDate): boolean => addMonths(asOf, 12) < today;

export const annualUpkeep = (
  year: number,
  today: CivilDate,
  cpi: Readonly<Record<string, unknown>> = SPANISH_CPI,
  tables: IndexTables = DEFAULT_INDEX_TABLES,
): AnnualUpkeep => ({
  ...(Object.hasOwn(cpi, String(year)) ? {} : { missingCpi: year }),
  staleProfiles: Object.values(tables.profiles)
    .filter((profile) => profile.as_of !== undefined && stale(profile.as_of, today))
    .map((profile) => profile.name),
  staleFunds: Object.values(tables.funds).filter((fund) => stale(fund.as_of, today)).length,
});
