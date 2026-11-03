// Spanish consumer prices, December to December: the yearly change of the general CPI (Índice de
// Precios de Consumo, nacional, índice general, variación anual) published by the INE, as data in
// the code like the savings scales. The real return of the core reads it (`coreXirr`).
//
// Each year carries the INE series query that gives that December and the day it was checked. The
// INE publishes a year's figure in January of the next one: **every January the new year is added
// here** (the real return is measured up to the last year in this table). Nothing is estimated: a
// year not published is not in the table.
//
// Series: IPC206448 (base 2016, to December 2021) and IPC251856 (base 2021, from 2021; the two
// agree on 2021). Table: https://www.ine.es/jaxiT3/Tabla.htm?t=50902

export interface CpiYear {
  /** December to December, percent, as the INE gives it. */
  readonly pct: string;
  /** The INE query that returns that December. */
  readonly source: string;
  /** The day it was read there. */
  readonly checked: string;
}

const CHECKED = "2026-11-03";
const query = (series: string, year: number): string =>
  `https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/${series}?date=${year}1201:${year}1201`;
const OLD = "IPC206448";
const NEW = "IPC251856";

export const SPANISH_CPI: Readonly<Record<string, CpiYear>> = {
  "2002": { pct: "4.0", source: query(OLD, 2002), checked: CHECKED },
  "2003": { pct: "2.6", source: query(OLD, 2003), checked: CHECKED },
  "2004": { pct: "3.2", source: query(OLD, 2004), checked: CHECKED },
  "2005": { pct: "3.7", source: query(OLD, 2005), checked: CHECKED },
  "2006": { pct: "2.7", source: query(OLD, 2006), checked: CHECKED },
  "2007": { pct: "4.2", source: query(OLD, 2007), checked: CHECKED },
  "2008": { pct: "1.4", source: query(OLD, 2008), checked: CHECKED },
  "2009": { pct: "0.8", source: query(OLD, 2009), checked: CHECKED },
  "2010": { pct: "3.0", source: query(OLD, 2010), checked: CHECKED },
  "2011": { pct: "2.4", source: query(OLD, 2011), checked: CHECKED },
  "2012": { pct: "2.9", source: query(OLD, 2012), checked: CHECKED },
  "2013": { pct: "0.3", source: query(OLD, 2013), checked: CHECKED },
  "2014": { pct: "-1.0", source: query(OLD, 2014), checked: CHECKED },
  "2015": { pct: "0.0", source: query(OLD, 2015), checked: CHECKED },
  "2016": { pct: "1.6", source: query(OLD, 2016), checked: CHECKED },
  "2017": { pct: "1.1", source: query(OLD, 2017), checked: CHECKED },
  "2018": { pct: "1.2", source: query(OLD, 2018), checked: CHECKED },
  "2019": { pct: "0.8", source: query(OLD, 2019), checked: CHECKED },
  "2020": { pct: "-0.5", source: query(OLD, 2020), checked: CHECKED },
  "2021": { pct: "6.5", source: query(OLD, 2021), checked: CHECKED },
  "2022": { pct: "5.7", source: query(NEW, 2022), checked: CHECKED },
  "2023": { pct: "3.1", source: query(NEW, 2023), checked: CHECKED },
  "2024": { pct: "2.8", source: query(NEW, 2024), checked: CHECKED },
  "2025": { pct: "2.9", source: query(NEW, 2025), checked: CHECKED },
};

/** The table as `coreXirr` takes it: calendar year → yearly change in percent. */
export const spanishCpiPct = (): Record<string, string> =>
  Object.fromEntries(Object.entries(SPANISH_CPI).map(([year, row]) => [year, row.pct]));
