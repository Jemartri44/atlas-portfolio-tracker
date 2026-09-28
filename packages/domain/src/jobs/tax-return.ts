// The income tax of January (feature 016, E4; `docs/specification.md` §9.5,
// «Anual (enero) — preparar datos de la Renta del ejercicio anterior»): the
// report of the year before, computed from the ledger alone (domain trap 5),
// said by **how many notes and how many criteria in dispute** it carries
// (ADR-0024) — **never a figure, whatever the switch says** (Q10, decided on
// 2026-09-27): a base or a quota in a mailbox is the most sensitive thing
// Atlas computes, and the mail only has to say the data is ready.

import { type CivilDate, yearOf } from "../dates/civil-date.js";
import { DomainError } from "../errors.js";
import type { LedgerEvent } from "../schema/events.js";
import { taxYear } from "../tax/year.js";
import { CODE_SHAPE } from "./strict.js";

export type TaxReturnFacts =
  | {
      readonly ok: true;
      readonly year: number;
      /** The notes of the report: every caveat it says (ADR-0024). */
      readonly notes: number;
      /** The criteria whose reading is open (`doubtful`), not the settled ones. */
      readonly disputed: number;
    }
  | { readonly ok: false; readonly year: number; readonly code: string };

export const taxReturnFacts = (input: {
  readonly events: readonly LedgerEvent[];
  readonly today: CivilDate;
  /** The findings of the ECB check, as `atlas tax` passes them: they only note lines. */
  readonly rateFindings?: readonly { readonly event_id: string; readonly code: string }[];
}): TaxReturnFacts => {
  const year = yearOf(input.today) - 1;
  try {
    const report = taxYear(input.events, year, {
      today: input.today,
      ...(input.rateFindings === undefined ? {} : { rateFindings: input.rateFindings }),
    });
    return { ok: true, year, notes: report.notes.length, disputed: report.doubtful.length };
  } catch (error) {
    return {
      ok: false,
      year,
      code: error instanceof DomainError && CODE_SHAPE.test(error.code) ? error.code : "tax_failed",
    };
  }
};
