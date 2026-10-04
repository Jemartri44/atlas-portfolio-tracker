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
// **Verified or not, year by year (read in the BOE and the AEAT on 2026-10-04,
// `specs/020-visual-refresh/questions.md` §14).** A year is `verified` when its
// 31 March is a working day, so the literal date of the order is the deadline.
// When 31 March falls on a Saturday or a Sunday (rows 2017, 2018 and 2023) the
// deadline is **left at 31 March and marked unverified**: art. 30.5 of the Law
// 39/2015 carries a deadline that ends on a non-working day to the next
// working one, and the press of the time says it was done (2 April 2018, 1
// April 2019, 1 April 2024), but no primary source naming that day for this
// model was found, and a legal date is not guessed. The AEAT confirms
// «del 1 de enero al 31 de marzo de 2026» for both models on its pages of
// filing periods (the 2025 rows), read on 2026-10-04 at
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

import type { CivilDate } from "../dates/civil-date.js";

export interface FilingDeadline {
  model: "720" | "721";
  /** The fiscal year the return refers to. */
  year: number;
  /** The last day to file it. */
  deadline: CivilDate;
  /**
   * `false` when nobody has verified the day against a primary source: the
   * calendar says it, the interface marks it. Never supposed.
   */
  verified: boolean;
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

/**
 * The years whose 31 March is a Saturday or a Sunday: nobody has verified what
 * the day becomes (the question for the advisor is in `fiscal-questions.md`).
 */
const WEEKEND_YEARS: readonly number[] = [2017, 2018, 2023];

/** One row per year, `first` to `last`: from 1 January to 31 March of the next year. */
const rows = (
  model: FilingDeadline["model"],
  first: number,
  last: number,
  source: FilingDeadline["source"],
): FilingDeadline[] =>
  Array.from({ length: last - first + 1 }, (_, index) => {
    const year = first + index;
    return {
      model,
      year,
      deadline: `${year + 1}-03-31`,
      verified: !WEEKEND_YEARS.includes(year),
      source,
    };
  });

export const FILING_DEADLINES: readonly FilingDeadline[] = [
  ...rows("720", 2013, 2026, ORDER_720),
  ...rows("721", 2023, 2026, ORDER_721),
];
