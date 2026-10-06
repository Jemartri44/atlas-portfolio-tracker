// The filing deadline of the informative returns, **as normative data by
// fiscal year** (feature 020, E4, M12; Q4, answered 2026-09-27), with its source:
// the order that sets it, the article, the address and the day it was read.
// Like the boxes of the Model 100, which live by year: the deadline of a year
// nobody has verified is **not supposed**, it says "unverified" until someone
// adds its row. An open-ended rule ("from 2013, while the order stands") would
// assume the order never changes, which is what this table exists not to do.
//
// Both orders say the same thing: the return is filed from 1 January to 31
// March of the year after the one the information refers to (art. 7 of the
// Order HAP/72/2013 for the 720, never amended in that article; art. 4 of the
// Order HFP/886/2023 for the 721, whose later amendment only replaced its
// annex). The first year of the Model 720 (2012) had a transitional deadline
// (1 February to 30 April 2013) that is not in the table.
//
// **A 31 March on a weekend.** When the last day falls on a Saturday or a
// Sunday it is carried to the next working day: art. 30.5 of the Law 39/2015,
// applied in a supplementary way to tax matters (first additional provision,
// 2.a). The deadline of the row is that day, computed (`nextWorkingDay`), for
// any year: the fiscal years 2017, 2018 and 2023 (31 March 2018, 2019 and 2024:
// Saturday, Sunday, Sunday) and, later, 2028, 2029 and 2034. The row keeps the
// literal day in `extended_from`, so the screen shows it as a **legal
// extension** and recommends filing by the last working day before it. No
// AEAT calendar of those years confirming the day was found: it is the legal
// rule, not an observed fact. Holidays are not modelled (art. 30.6: they
// depend on the taxpayer's region, so the Monday of Easter may still shift it).
// The AEAT confirms «del 1 de enero al 31 de marzo de 2026» for both models on
// its pages of filing periods (the 2025 rows), read on 2026-10-04 at
// https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/declaraciones-informativas/modelo-720-decla_____sobre-bienes-derechos-extranjero_/plazos-presentacion.html
// and
// https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/declaraciones-informativas/modelo-721-decla-sobre-monedas-extranjero/plazos-presentacion.html
// (kept in this comment and not in the data: the bundle holds no foreign
// address that is not allowed one by one, `check-bundle.mjs`).
//
// The general rule is read at https://www.boe.es/buscar/act.php?id=BOE-A-2015-10565
// (art. 30.5, Law 39/2015); the 720 order at its consolidated text
// https://www.boe.es/buscar/act.php?id=BOE-A-2013-954 (last update published
// 31/10/2023, by the Order HFP/1180/2023, which does not touch art. 7), and the
// 721 order at https://www.boe.es/buscar/act.php?id=BOE-A-2023-17429.

import { type CivilDate, nextWorkingDay } from "../dates/civil-date.js";

export interface FilingDeadline {
  model: "720" | "721";
  /** The fiscal year the return refers to. */
  year: number;
  /** The last day to file it: 31 March, or the next working day when that is a weekend. */
  deadline: CivilDate;
  /**
   * Only when 31 March is a Saturday or a Sunday: that literal day, which the
   * deadline was carried from (art. 30.5, Law 39/2015). The interface shows a
   * legal extension and recommends filing before it.
   */
  extended_from?: CivilDate;
  source: {
    norm: string;
    article: string;
    url: string;
    /** The day the text was read in the BOE. */
    checked: CivilDate;
  };
}

const ORDER_720 = {
  norm: "Orden HAP/72/2013, de 30 de enero",
  article: "art. 7",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2013-954",
  checked: "2026-10-04",
} as const;

const ORDER_721 = {
  norm: "Orden HFP/886/2023, de 26 de julio",
  article: "art. 4",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2023-17429",
  checked: "2026-10-04",
} as const;

/** One row per year, `first` to `last`: from 1 January to 31 March of the next year. */
const rows = (
  model: FilingDeadline["model"],
  first: number,
  last: number,
  source: FilingDeadline["source"],
): FilingDeadline[] =>
  Array.from({ length: last - first + 1 }, (_, index) => {
    const year = first + index;
    const literal = `${year + 1}-03-31`;
    const deadline = nextWorkingDay(literal);
    return {
      model,
      year,
      deadline,
      ...(deadline === literal ? {} : { extended_from: literal }),
      source,
    };
  });

export const FILING_DEADLINES: readonly FilingDeadline[] = [
  ...rows("720", 2013, 2026, ORDER_720),
  ...rows("721", 2023, 2026, ORDER_721),
];
