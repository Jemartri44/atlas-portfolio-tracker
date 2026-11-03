// The currency and region split of the indexes the owner's funds follow, as data in the code like
// the CPI table (`charts/spanish-cpi.ts`). They are the **defaults** of the exposure: the owner
// does not have to know these percentages (`exposure.ts` marks them «por defecto» and the owner's
// own always wins).
//
// - Each profile comes from the index provider's factsheet: the split by currency (of the
//   countries, for an unhedged index; EUR for one hedged to euros) and by region, with the date of
//   the factsheet (`as_of`) and the day it was read (`checked`).
// - Each fund (ISIN → index) is there only if the fund's own factsheet was read and says which index
//   it follows. A fund not in the table gets no proposal: «sin propuesta», never a guess.
// - The address of every factsheet is a function apart (`indexSourceOf`, `fundSourceOf`), unused by
//   the web, so its bundle does not carry a foreign origin (ADR-0017, ADR-0019).
// - **Review it every January**, with the CPI (`docs/business-rules.md`): factsheets move.

import type { AssetClass } from "../schema/events.js";
import type { Split } from "./exposure.js";

export interface IndexProfile {
  readonly key: string;
  readonly name: string;
  /** Percent by ISO currency, adding up to 100. */
  readonly currency: Split;
  /** Percent by region key, adding up to 100. */
  readonly region: Split;
  /** The date of the factsheet the figures come from. */
  readonly as_of: string;
  /** The day it was read there. */
  readonly checked: string;
}

export interface KnownFund {
  readonly isin: string;
  readonly name: string;
  /** Key of the profile of the index the fund follows. */
  readonly index: string;
  readonly as_of: string;
  readonly checked: string;
}

export interface IndexTables {
  readonly profiles: Readonly<Record<string, IndexProfile>>;
  readonly funds: Readonly<Record<string, KnownFund>>;
  /** The profile proposed for an asset of that class when nothing else tells (gold, crypto). */
  readonly byClass: Readonly<Partial<Record<AssetClass, string>>>;
}

export const INDEX_PROFILES: Readonly<Record<string, IndexProfile>> = {};
export const KNOWN_FUNDS: Readonly<Record<string, KnownFund>> = {};
export const INDEX_BY_CLASS: Readonly<Partial<Record<AssetClass, string>>> = {};

export const DEFAULT_INDEX_TABLES: IndexTables = {
  profiles: INDEX_PROFILES,
  funds: KNOWN_FUNDS,
  byClass: INDEX_BY_CLASS,
};
