// Writes the synthetic EODHD responses of the tests (feature 013): the **real
// format** of each endpoint, verified on 2026-09-24
// (`specs/013-daily-close-prices/questions.md` §1.1), with **invented symbols
// and round values**. No real response enters the repository, not even one of
// the public demo key (CLAUDE.md, rule 7).
//
//   node tests/fixtures/eodhd/make-synthetic.mjs
//
// Deterministic: running it again writes the same bytes.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const write = (name, text) => writeFileSync(join(here, name), text);

// End of day, `fmt=json`: an array, one object per day, the fields in the
// order the endpoint gives them, and **numbers as JSON numbers** — which is
// why the adapter reads their text and never a float (decision D-Q1).
const day = (date, close) =>
  `{"date":"${date}","open":${close - 1},"high":${close + 1.5},"low":${close - 2},"close":${close},"adjusted_close":${close - 0.25},"volume":1000}`;
write(
  "eod-synth.json",
  `[${[day("2027-01-04", 100.5), day("2027-01-05", 101.25), day("2027-01-06", 102)].join(",")}]`,
);
// A close with more digits than a double keeps: its text must survive whole.
write("eod-long.json", '[{"date":"2027-01-06","open":1,"high":1,"low":1,"close":123.4567890123456789,"adjusted_close":1,"volume":0}]');
write("eod-empty.json", "[]");
write("eod-not-an-array.json", '{"date":"2027-01-06","close":1}');
write("eod-bad-close.json", '[{"date":"2027-01-06","close":"101"}]');
write("eod-bad-date.json", '[{"date":"06/01/2027","close":101}]');
write("eod-zero-close.json", '[{"date":"2027-01-06","close":0}]');

// The list of symbols of one exchange, filtered with `symbols=`: `Currency` is
// the trading currency of the listing.
write(
  "symbols-synth.json",
  '[{"Code":"SYNTH","Name":"Synthetic ETF","Country":"Germany","Exchange":"XETRA","Currency":"EUR","Type":"ETF","Isin":"XS0000000013"}]',
);
write(
  "symbols-unknown-currency.json",
  '[{"Code":"SYNTH","Name":"Synthetic ETF","Country":"Unknown","Exchange":"XETRA","Currency":"Unknown","Type":"ETF","Isin":null}]',
);

// The error bodies are plain text.
write("error-401.txt", "Unauthenticated");
write("error-402.txt", "API Rate Limit Exceeded. Please, contact our support team");
write("error-403.txt", "Forbidden");
write("error-404.txt", "Ticker Not Found.");
