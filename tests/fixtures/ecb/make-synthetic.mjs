// Writes the synthetic ECB histories of the tests (feature 012): the **real
// format** of each source, verified on 2026-09-24
// (`specs/012-ecb-reference-rates/questions.md` §4), with **invented values**.
// The real history never enters the repository (CLAUDE.md, rule 7).
//
//   node tests/fixtures/ecb/make-synthetic.mjs
//
// Deterministic: running it again writes the same bytes.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// The header of the real file, column for column, trailing comma included.
const HEADER =
  "Date,USD,JPY,BGN,CYP,CZK,DKK,EEK,GBP,HUF,LTL,LVL,MTL,PLN,ROL,RON,SEK,SIT,SKK,CHF,ISK,NOK,HRK,RUB,TRL,TRY,AUD,BRL,CAD,CNY,HKD,IDR,ILS,INR,KRW,MXN,MYR,NZD,PHP,SGD,THB,ZAR,";
const COLUMNS = HEADER.split(",").slice(1, -1);

const pad = (n) => String(n).padStart(2, "0");
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const HOLIDAYS = new Set(["2025-12-25", "2025-12-26", "2026-01-01"]);

/** Working days of TARGET from `from` to `to`, oldest first. */
const days = (from, to) => {
  const out = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6 && !HOLIDAYS.has(iso(t))) {
      out.push(iso(t));
    }
  }
  return out;
};

/** A rate without trailing zeros, as the history writes it. */
const rate = (value, decimals) => {
  const text = value.toFixed(decimals);
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
};

const DAYS = days("2025-10-01", "2026-03-31");

/** Invented values per currency; `undefined` is N/A. */
const valueOf = (currency, date, index) => {
  switch (currency) {
    case "USD":
      return rate(1.1 + (index % 17) * 0.0013, 4);
    case "GBP":
      // 2026-01-05 is the day the tests compare `0.85950` with `0.8595`.
      return date === "2026-01-05" ? "0.8595" : rate(0.85 + (index % 11) * 0.0009, 5);
    case "JPY":
      return rate(170 + (index % 13) * 0.4, 2);
    case "CHF":
      return rate(0.93 + (index % 7) * 0.0021, 4);
    case "ISK":
      return String(130 + (index % 9));
    case "BGN":
      // Stops at the end of 2025, like the real lev when Bulgaria joined the euro.
      return date <= "2025-12-31" ? "1.9558" : undefined;
    default:
      return undefined;
  }
};

const rows = DAYS.map((date, index) => [
  date,
  ...COLUMNS.map((currency) => valueOf(currency, date, index) ?? "N/A"),
  "",
]);
const zipCsv = `${[HEADER, ...rows.reverse().map((row) => row.join(","))].join("\n")}\n`;
writeFileSync(join(here, "eurofxref-hist.csv"), zipCsv);

// The API, `format=csvdata&detail=dataonly`: CRLF, oldest first, one row per
// series and day — and, on a closing day, a row **with no value**.
const API_HEADER = "KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE";
const apiRows = [];
for (const currency of ["GBP", "USD"]) {
  const all = [...DAYS, "2025-12-25", "2025-12-26"].sort();
  all.forEach((date) => {
    const index = DAYS.indexOf(date);
    const value = index < 0 ? "" : valueOf(currency, date, index);
    apiRows.push(`EXR.D.${currency}.EUR.SP00.A,D,${currency},EUR,SP00,A,${date},${value}`);
  });
}
writeFileSync(join(here, "api-exr.csv"), `${[API_HEADER, ...apiRows].join("\r\n")}\r\n`);
