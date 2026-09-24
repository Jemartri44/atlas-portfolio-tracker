// Writes the synthetic Alpha Vantage responses of the tests (feature 013):
// the **real format**, verified on 2026-09-24
// (`specs/013-daily-close-prices/questions.md` §1.4), with **invented symbols
// and round values**. Every one of them arrives with HTTP 200: success and
// failure are told apart only by the key of the body.
//
//   node tests/fixtures/alpha-vantage/make-synthetic.mjs
//
// Deterministic: running it again writes the same bytes.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const write = (name, value) => writeFileSync(join(here, name), `${JSON.stringify(value, null, 4)}\n`);

const day = (close) => ({
  "1. open": (close - 1).toFixed(4),
  "2. high": (close + 1.5).toFixed(4),
  "3. low": (close - 2).toFixed(4),
  "4. close": close.toFixed(4),
  "5. volume": "1000",
});
write("daily-synth.json", {
  "Meta Data": {
    "1. Information": "Daily Prices (open, high, low, close) and Volumes",
    "2. Symbol": "SYNTH.DEX",
    "3. Last Refreshed": "2027-01-06",
    "4. Output Size": "Compact",
    "5. Time Zone": "US/Eastern",
  },
  "Time Series (Daily)": {
    "2027-01-06": day(102),
    "2027-01-05": day(101.25),
    "2027-01-04": day(100.5),
  },
});
write("daily-bad-close.json", {
  "Meta Data": { "2. Symbol": "SYNTH.DEX" },
  "Time Series (Daily)": { "2027-01-06": { "4. close": 102 } },
});
write("search-synth.json", {
  bestMatches: [
    {
      "1. symbol": "SYNTH.DEX",
      "2. name": "Synthetic ETF",
      "3. type": "ETF",
      "4. region": "XETRA",
      "5. marketOpen": "08:00",
      "6. marketClose": "20:00",
      "7. timezone": "UTC+01",
      "8. currency": "EUR",
      "9. matchScore": "1.0000",
    },
    {
      "1. symbol": "SYNTH.LON",
      "2. name": "Synthetic ETF",
      "3. type": "ETF",
      "4. region": "United Kingdom",
      "5. marketOpen": "08:00",
      "6. marketClose": "16:30",
      "7. timezone": "UTC+00",
      "8. currency": "GBX",
      "9. matchScore": "0.8000",
    },
  ],
});
write("error-apikey.json", {
  "Error Message":
    "the parameter apikey is invalid or missing. Please claim your free API key on the support page.",
});
write("error-call.json", {
  "Error Message": "Invalid API call. Please retry or visit the documentation for TIME_SERIES_DAILY.",
});
write("information-limit.json", {
  Information:
    "Thank you for using Alpha Vantage! Please consider spreading out your free API requests more sparingly (1 request per second). Our standard API rate limit is 25 requests per day.",
});
write("note-limit.json", { Note: "Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute." });
write("unexpected.json", { Hello: "world" });
