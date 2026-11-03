// Spanish consumer prices, December to December: the yearly change of the general CPI (Índice de
// Precios de Consumo, nacional, índice general, variación anual) published by the INE, as data in
// the code like the savings scales. The real return of the core reads it (`coreXirr`).
//
// Each year carries the day it was checked, and `cpiSourceOf(year)` gives the INE query that returns
// that December. The query is a function of its own, apart from the table, on purpose: the web bundle
// takes the figures and must not carry the address of a foreign origin (ADR-0017, ADR-0019). The
// INE publishes a year's figure in January of the next one: **every January the new year is added
// here** (the real return is measured up to the last year in this table). Nothing is estimated: a
// year not published is not in the table.
//
// Series: IPC206448 (base 2016, to December 2021) and IPC251856 (base 2021, from 2021; the two
// agree on 2021). Table: https://www.ine.es/jaxiT3/Tabla.htm?t=50902

export interface CpiYear {
  /** December to December, percent, as the INE gives it. */
  readonly pct: string;
  /** The day it was read there. */
  readonly checked: string;
}

const CHECKED = "2026-11-03";

export const SPANISH_CPI: Readonly<Record<string, CpiYear>> = {
  "2002": { pct: "4.0", checked: CHECKED },
  "2003": { pct: "2.6", checked: CHECKED },
  "2004": { pct: "3.2", checked: CHECKED },
  "2005": { pct: "3.7", checked: CHECKED },
  "2006": { pct: "2.7", checked: CHECKED },
  "2007": { pct: "4.2", checked: CHECKED },
  "2008": { pct: "1.4", checked: CHECKED },
  "2009": { pct: "0.8", checked: CHECKED },
  "2010": { pct: "3.0", checked: CHECKED },
  "2011": { pct: "2.4", checked: CHECKED },
  "2012": { pct: "2.9", checked: CHECKED },
  "2013": { pct: "0.3", checked: CHECKED },
  "2014": { pct: "-1.0", checked: CHECKED },
  "2015": { pct: "0.0", checked: CHECKED },
  "2016": { pct: "1.6", checked: CHECKED },
  "2017": { pct: "1.1", checked: CHECKED },
  "2018": { pct: "1.2", checked: CHECKED },
  "2019": { pct: "0.8", checked: CHECKED },
  "2020": { pct: "-0.5", checked: CHECKED },
  "2021": { pct: "6.5", checked: CHECKED },
  "2022": { pct: "5.7", checked: CHECKED },
  "2023": { pct: "3.1", checked: CHECKED },
  "2024": { pct: "2.8", checked: CHECKED },
  "2025": { pct: "2.9", checked: CHECKED },
};

/** The table as `coreXirr` takes it: calendar year → yearly change in percent. */
export const spanishCpiPct = (): Record<string, string> =>
  Object.fromEntries(Object.entries(SPANISH_CPI).map(([year, row]) => [year, row.pct]));

/**
 * The INE query that returns that December: IPC206448 up to 2021 and IPC251856 from 2022 (the two
 * agree on 2021). Not used by the web, so its bundle does not carry the address.
 */
export const cpiSourceOf = (year: string): string =>
  `https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/${Number(year) >= 2022 ? "IPC251856" : "IPC206448"}?date=${year}1201:${year}1201`;
