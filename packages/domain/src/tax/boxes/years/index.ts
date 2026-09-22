// The boxes of the Modelo 100, **one table per tax year** (prompt 010,
// decision (e)).
//
// They are data and nothing else: no `if` about a year lives outside this file,
// and a year with no table produces the concepts with **no numbers at all**
// instead of borrowing the numbers of another year. The Agencia Tributaria
// renumbers the form every campaign — in 2025 the ETFs got a section of their
// own, 2224–2236, that did not exist in 2024 — so a box inherited from the year
// before is a believable, wrong figure the user types into a real return.
//
// Adding a year is a procedure, not a copy: wait for the order of the BOE that
// approves the form, read every concept **in that year's form**, transcribe the
// label word for word with the URL of the image and the date it was checked,
// and only then compare with the year before, as a control.

import type { CivilDate } from "../../../dates/civil-date.js";
import type { ConceptId } from "../concepts.js";
import type { BoxMapping } from "../report.js";
import { BOXES_2025 } from "./2025.js";

/** A box of the table, before its source is composed: the page is an image of the annex. */
export interface YearBoxMapping extends BoxMapping {
  /** Number of the image of the annex in the BOE, which the URL is built from. */
  image: number;
}

export interface YearBoxes {
  year: number;
  /** The official document the whole table was read in. */
  document: string;
  /** Where the image of a page lives; `{image}` is replaced by the number of the image. */
  url_template: string;
  /** The day every box of the table was checked against the image, one by one. */
  checked_at: CivilDate;
  concepts: Partial<Record<ConceptId, YearBoxMapping>>;
  /**
   * Concepts whose box depends on the **year the pending loss comes from**: the
   * form has one box per origin year, and they are not consecutive (in 2025 the
   * fourth of two of the runs jumps to 0447 and 0448).
   */
  by_origin_year: Partial<Record<ConceptId, Record<number, YearBoxMapping>>>;
}

/** Every year whose boxes were checked in its own official form. */
export const BOX_YEARS: readonly YearBoxes[] = [BOXES_2025];

export const boxesOfYear = (year: number): YearBoxes | undefined =>
  BOX_YEARS.find((entry) => entry.year === year);
