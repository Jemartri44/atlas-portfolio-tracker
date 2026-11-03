// The deadlines of the income tax campaign, **as normative data by fiscal
// year**, like the informative returns (`informative/deadlines.ts`): the order
// of each campaign sets them, so every row carries its norm, its articles, its
// address and the day it was read. A year nobody has read has no row, and the
// warning says it is unverified: no date is ever supposed.
//
// **Every spring the row of the new campaign is added**, from its order in the
// BOE. Read through the API of the BOE (consolidated text):
// - art. 7.1: filing from 8 April to 30 June 2026, both included;
// - art. 12.3: direct debit until 25 June 2026; only the second instalment,
//   until 30 June;
// - art. 11.5: the second instalment, 40 %, until 5 November 2026, included;
// - art. 12.2: having debited the first, the second may be debited until
//   2 November 2026, included.

import type { CivilDate } from "../dates/civil-date.js";

export interface IncomeTaxDeadlines {
  /** The fiscal year of the return; the campaign is the spring after it. */
  readonly year: number;
  /** The last day to file. */
  readonly filing_end: CivilDate;
  /** The last day to file with the payment by direct debit. */
  readonly direct_debit_end: CivilDate;
  /** The last day of the second instalment. */
  readonly second_instalment: CivilDate;
  /** The last day to debit the second instalment, having debited the first. */
  readonly second_direct_debit_end: CivilDate;
  readonly source: {
    readonly norm: string;
    readonly articles: string;
    readonly url: string;
    /** The day the text was read in the BOE. */
    readonly checked: CivilDate;
  };
}

const ROWS: readonly IncomeTaxDeadlines[] = [
  {
    year: 2025,
    filing_end: "2026-06-30",
    direct_debit_end: "2026-06-25",
    second_instalment: "2026-11-05",
    second_direct_debit_end: "2026-11-02",
    source: {
      norm: "Orden HAC/277/2026",
      articles: "arts. 7.1, 11.5, 12.2 y 12.3",
      url: "https://www.boe.es/buscar/act.php?id=BOE-A-2026-7041",
      checked: "2026-11-03",
    },
  },
];

/** The deadlines of that fiscal year, or nothing when nobody has read its order. */
export const incomeTaxDeadlines = (year: number): IncomeTaxDeadlines | undefined =>
  ROWS.find((row) => row.year === year);
