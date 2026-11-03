// The scales of the savings base, **one per wording of the law**.
//
// Articles 66.1 (state half) and 76 (regional half) LIRPF. A region of the
// common regime cannot change the savings scale —only the general one— so both
// halves are state law; the foral regimes of the Basque Country and Navarre
// have their own income tax and these tables do not apply there.
//
// They are data, like the boxes of each year (`boxes/years/`): a year outside
// every range has **no scale**, and the quota is not computed instead of
// borrowing the rates of another year. Each wording was read in the BOE in its
// own consolidated version (the selector "Seleccionar redacción" of the
// article) on `SCALES_CHECKED_AT`. The last wording has no end: it applies
// until a law changes it, and a year after the date of the check is reported
// as such.

import type { CivilDate } from "../dates/civil-date.js";
import type { DecimalString } from "../money/decimal.js";

export interface SavingsScaleBracket {
  /** Upper limit of the base for this bracket, cumulative; absent for the last. */
  up_to?: DecimalString;
  /** Rate of art. 66.1, in percent. */
  state_pct: DecimalString;
  /** Rate of art. 76, in percent. */
  regional_pct: DecimalString;
}

export interface SavingsScale {
  from_year: number;
  /** Last year of the wording; absent for the one in force. */
  to_year?: number;
  /** The law that gave this wording to both articles. */
  law: string;
  /** The consolidated version of art. 66 in the BOE (art. 76 is the same text with `b=109`). */
  url: string;
  brackets: SavingsScaleBracket[];
}

/** The day every scale below was read, rate by rate, in the BOE. */
export const SCALES_CHECKED_AT: CivilDate = "2026-11-03";

const version = (date: string): string =>
  `https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764&b=93&tn=1&p=${date}`;

const half = (up_to: string | undefined, pct: DecimalString): SavingsScaleBracket => ({
  ...(up_to === undefined ? {} : { up_to }),
  state_pct: pct,
  regional_pct: pct,
});

const BASE = [half("6000", "9.5"), half("50000", "10.5")];

export const SAVINGS_SCALES: readonly SavingsScale[] = [
  {
    from_year: 2018,
    to_year: 2020,
    law: "Ley 26/2014, art. 1.42 y 1.51 (BOE-A-2014-12327)",
    url: version("20141128"),
    brackets: [...BASE, half(undefined, "11.5")],
  },
  {
    from_year: 2021,
    to_year: 2022,
    law: "Ley 11/2020, art. 59 (BOE-A-2020-17339)",
    url: version("20201231"),
    brackets: [...BASE, half("200000", "11.5"), half(undefined, "13")],
  },
  {
    from_year: 2023,
    to_year: 2024,
    law: "Ley 31/2022, art. 63 (BOE-A-2022-22128)",
    url: version("20221224"),
    brackets: [...BASE, half("200000", "11.5"), half("300000", "13.5"), half(undefined, "14")],
  },
  {
    from_year: 2025,
    law: "Ley 7/2024, disposición final 7.ª (BOE-A-2024-26694)",
    url: version("20241221"),
    brackets: [...BASE, half("200000", "11.5"), half("300000", "13.5"), half(undefined, "15")],
  },
];

export const savingsScaleOf = (year: number): SavingsScale | undefined =>
  SAVINGS_SCALES.find(
    (scale) => scale.from_year <= year && (scale.to_year === undefined || year <= scale.to_year),
  );
