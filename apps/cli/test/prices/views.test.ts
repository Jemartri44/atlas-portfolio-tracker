// The fiscal views next to prices/ and the ECB history: not moving a byte.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FileEcbHistoryStore } from "@atlas/adapters";
import { decodeLine, type LedgerEvent } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { CLI_SETTINGS, Events } from "../events.js";
import { LEDGER_FIXTURES } from "../support/fixtures.js";
import { folder } from "./folder.js";

const line = (date: string, close: string, currency = "EUR", source = "eodhd") =>
  `${JSON.stringify({ schema_version: 1, date, close, currency, source, fetched_at: "2027-06-09T06:00:00.000Z" })}\n`;

const writePrices = async (dir: string, files: Record<string, string>) => {
  await mkdir(join(dir, "prices"), { recursive: true });
  for (const [assetId, text] of Object.entries(files)) {
    await writeFile(join(dir, "prices", `${assetId}.jsonl`), text);
  }
};

const _ledger = () => {
  const b = new Events();
  b.settings({
    ...CLI_SETTINGS,
    target_weights: { fund_a: "50", etf_b: "50" },
    bucket_pct_of_contribution: "10",
    stale_price_days: 3,
  });
  b.account("acc_es");
  b.asset("fund_a", "fund");
  b.asset("etf_b", "etf");
  b.deposit("acc_es", "2027-01-04", "10000");
  b.buy("acc_es", "fund_a", "2027-01-05", "10", "100");
  b.buy("acc_es", "etf_b", "2027-01-05", "10", "100");
  b.valuation("acc_es", "fund_a", "2027-05-31", "10", "110");
  b.valuation("acc_es", "etf_b", "2027-06-08", "10", "105");
  return b.build();
};

// ---------------------------------------------------------------------------
// The fiscal output does not move.
// ---------------------------------------------------------------------------

const fixtures = LEDGER_FIXTURES;
const synthetic = async (): Promise<LedgerEvent[]> =>
  (await readFile(join(fixtures, "synthetic-v1.jsonl"), "utf8"))
    .split("\n")
    .filter((text) => text !== "")
    .map((text) => decodeLine(text).event);

const FISCAL = (year: string) => [
  ["tax", year],
  ["tax", year, "--boxes"],
  ["m720", year],
  ["m721", year],
];

/**
 * The prediction, written before running it: **nothing moves**. Every fiscal
 * command gives the same bytes with and without `prices/`.
 */
const sameFiscalOutput = async (
  events: LedgerEvent[],
  years: string[],
  prices: Record<string, string>,
  instant: string,
) => {
  const without = await folder(events);
  const withPrices = await folder(events);
  without.instant = instant;
  withPrices.instant = instant;
  await writePrices(withPrices.dir, prices);
  for (const year of years) {
    for (const argv of FISCAL(year)) {
      const a = await without.atlas(...argv);
      const b = await withPrices.atlas(...argv);
      expect({ argv, code: b.code, text: b.text }).toEqual({ argv, code: a.code, text: a.text });
    }
  }
  return withPrices;
};

describe("the fiscal output with prices/ next to the ledger", () => {
  it("is identical byte for byte, with closes after the valuations of the 720", async () => {
    // An asset abroad valued by hand on 28 December, and automatic closes on the 29th, 30th and
    // 31st, much higher: they are the ones a view of the latest price would show.
    const b = new Events();
    b.settings(CLI_SETTINGS);
    b.account("acc_ib", "IE");
    b.asset("etf_a", "etf");
    b.deposit("acc_ib", "2027-01-04", "70000");
    b.buy("acc_ib", "etf_a", "2027-01-05", "100", "500");
    b.sell("acc_ib", "etf_a", "2027-03-05", "10", "520");
    b.valuation("acc_ib", "etf_a", "2027-12-28", "90", "400");
    const events = b.build();
    const prices = {
      etf_a: line("2027-12-29", "900") + line("2027-12-30", "901") + line("2027-12-31", "902"),
    };
    const f = await sameFiscalOutput(events, ["2027"], prices, "2028-03-01T10:00:00.000Z");

    // The closes do not win over the valuation of the 720, however high they are.
    const m720 = JSON.stringify(JSON.parse((await f.atlas("m720", "2027")).out));
    expect(m720).toContain('"unit_value":"400"');
    expect(m720).not.toContain("902");
  });

  it("is identical for the synthetic ledger of the golden files, every year", async () => {
    const events = await synthetic();
    // For every asset valued by hand, closes after each of its valuations —
    // the day after, into the next year — and one on the same day, which loses.
    const files: Record<string, string> = {};
    for (const event of events) {
      if (event.type === "valuation") {
        const next = new Date(`${event.date}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        files[event.asset_id] =
          (files[event.asset_id] ?? "") +
          line(event.date, "12345.67", event.currency) +
          line(next.toISOString().slice(0, 10), "76543.21", event.currency);
      }
    }
    expect(Object.keys(files).length).toBeGreaterThan(2);
    await sameFiscalOutput(events, ["2026", "2027", "2028"], files, "2029-03-01T10:00:00.000Z");
    // Sixty commands over two folders: slow, and it has to be complete.
  }, 120_000);
});

const ecbHistory = async (dir: string, rows: [string, string][]) => {
  await new FileEcbHistoryStore(dir).activate({
    source: "zip",
    bytes: new TextEncoder().encode(
      ["Date,USD,", ...rows.map(([date, rate]) => `${date},${rate},`)].join("\n"),
    ),
    url: "https://example.invalid/hist.zip",
    fetched_at: "2027-06-09T06:00:00.000Z",
  });
};

describe("the fiscal output with the ECB history next to the ledger", () => {
  it("does not move a byte with a rate that moves the net worth", async () => {
    // Nothing fiscal moves. The fiscal commands read the
    // history to contrast the rates of the ledger, so both folders publish on the same days and
    // differ only in the dollar of days that no event of the fixture uses: one after every event,
    // and one inside each year, before its 31 December. A fiscal output that valued the cash with
    // the history's rate "as of" the year-end — the m720 with `latestRate` — would move with them.
    // The 31 December itself cannot be the day: the fixture has valuations with rates of 2027-12-31
    // and 2028-12-29, which the history contrasts.
    const events = await synthetic();
    const inYear = ["2027-12-28", "2028-12-27"];
    const used = JSON.stringify(events);
    for (const day of inYear) {
      expect(used).not.toContain(`"${day}"`);
    }
    const low = await folder(events);
    const high = await folder(events);
    low.instant = "2029-03-01T10:00:00.000Z";
    high.instant = low.instant;
    const history = (dollar: string): [string, string][] => [
      ["2029-02-28", dollar],
      ["2028-12-27", dollar],
      ["2027-12-28", dollar],
      ["2026-01-02", "1.1"],
    ];
    await ecbHistory(low.dir, history("1.1"));
    await ecbHistory(high.dir, history("2.5"));
    for (const year of ["2027", "2028"]) {
      for (const argv of FISCAL(year)) {
        const a = await low.atlas(...argv);
        const b = await high.atlas(...argv);
        expect({ argv, code: b.code, text: b.text }).toEqual({ argv, code: a.code, text: a.text });
      }
    }
  }, 120_000);
});
