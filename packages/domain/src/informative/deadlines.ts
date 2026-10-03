// The filing deadline of the informative returns, **as normative data by
// fiscal year** (feature 020, E4, M12; Q4, answered 2026-09-27), with its source:
// the order that sets it, the article, the address and the day it was read.
// Like the boxes of the Model 100, which live by year: the deadline of a year
// nobody has verified is **not supposed**, it says "unverified" until someone
// adds its row. An open-ended rule ("from 2013, while the order stands") would
// assume the order never changes, which is what this table exists not to do.
//
// Both orders say the same thing: the return is filed from 1 January to 31
// March of the year after the one the information refers to. The first year of
// the Model 720 (2012) had a transitional deadline that has not been verified,
// so it has no row.

import type { CivilDate } from "../dates/civil-date.js";

export interface FilingDeadline {
  model: "720" | "721";
  /** The fiscal year the return refers to. */
  year: number;
  /** The last day to file it. */
  deadline: CivilDate;
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
  checked: "2026-09-27",
} as const;

const ORDER_721 = {
  norm: "Orden HFP/886/2023, de 26 de julio",
  article: "art. 4",
  url: "https://www.boe.es/buscar/doc.php?id=BOE-A-2023-17429",
  checked: "2026-09-27",
} as const;

/** One row per year, `first` to `last`: from 1 January to 31 March of the next year. */
const rows = (
  model: FilingDeadline["model"],
  first: number,
  last: number,
  source: FilingDeadline["source"],
): FilingDeadline[] =>
  Array.from({ length: last - first + 1 }, (_, index) => ({
    model,
    year: first + index,
    deadline: `${first + index + 1}-03-31`,
    source,
  }));

export const FILING_DEADLINES: readonly FilingDeadline[] = [
  ...rows("720", 2013, 2026, ORDER_720),
  ...rows("721", 2023, 2026, ORDER_721),
];
