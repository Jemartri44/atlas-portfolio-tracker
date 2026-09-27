// The views that show a price, with prices/ next to the ledger (feature 013,
// block 4): origin, source and age in sight, the approximation marked, the
// quote without an ECB rate said — and the fiscal views not moving a byte.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FileEcbHistoryStore } from "@atlas/adapters";
import { decodeLine, type LedgerEvent } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { CLI_SETTINGS, Events } from "../events.js";
import { folder } from "./folder.js";

const line = (date: string, close: string, currency = "EUR", source = "eodhd") =>
  `${JSON.stringify({ schema_version: 1, date, close, currency, source, fetched_at: "2027-06-09T06:00:00.000Z" })}\n`;

const writePrices = async (dir: string, files: Record<string, string>) => {
  await mkdir(join(dir, "prices"), { recursive: true });
  for (const [assetId, text] of Object.entries(files)) {
    await writeFile(join(dir, "prices", `${assetId}.jsonl`), text);
  }
};

const ledger = () => {
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

describe("the views with automatic prices", () => {
  it("let the more recent close win, with its source and age, and the manual one on the same date", async () => {
    const f = await folder(ledger());
    await writePrices(f.dir, {
      fund_a: line("2027-06-01", "120"),
      etf_b: line("2027-06-08", "999"),
    });
    const weights = await f.atlas("weights", "--date", "2027-06-09");
    expect(weights.code).toBe(0);
    expect(weights.text).toMatch(
      /fund_a\s+equity\s+10\s+120\s+EUR\s+1\s+2027-06-01\s+8 ⚠\s+EODHD\s+1200\.00/,
    );
    expect(weights.text).toMatch(
      /etf_b\s+equity\s+10\s+105\s+EUR\s+1\s+2027-06-08\s+1\s+manual\s+1050\.00/,
    );
    const json = JSON.parse((await f.atlas("weights", "--date", "2027-06-09", "--json")).out);
    const fund = json.data.rows.find((row: { asset_id: string }) => row.asset_id === "fund_a");
    expect(fund.price).toMatchObject({
      origin: "external",
      source: "eodhd",
      price_age_days: 8,
      price_stale: true,
    });
    const networth = await f.atlas("networth", "--date", "2027-06-09");
    expect(networth.text).toContain("2250.00");
    const costs = await f.atlas("costs", "--date", "2027-06-09");
    expect(costs.text).toContain("1200.00");
  });

  it("use the last price with euros, and say the newer quote without them beside it", async () => {
    const f = await folder(ledger());
    await writePrices(f.dir, { fund_a: line("2027-06-08", "130", "USD") });
    const weights = await f.atlas("weights", "--date", "2027-06-09");
    // Review of PR #78: the valuation in euros is used, never covered.
    expect(weights.text).toMatch(/fund_a\s+equity\s+10\s+110\s+EUR\s+1\s+2027-05-31/);
    expect(weights.text).toContain(
      "fund_a: hay una cotización más reciente (130 USD del 2027-06-08) sin valor en euros (no hay histórico del BCE",
    );
    expect(weights.text).not.toContain("(parcial)");
    const json = JSON.parse((await f.atlas("weights", "--date", "2027-06-09", "--json")).out);
    const fund = json.data.rows.find((row: { asset_id: string }) => row.asset_id === "fund_a");
    expect(fund.price.newer_quote).toMatchObject({ currency: "USD", fx_missing: "no_history" });
  });

  it("say a quote without an ECB rate in its currency when it is all there is, and never add it up", async () => {
    const f = await folder(
      ledger().filter((event) => !(event.type === "valuation" && event.asset_id === "fund_a")),
    );
    await writePrices(f.dir, { fund_a: line("2027-06-08", "130", "USD") });
    const weights = await f.atlas("weights", "--date", "2027-06-09");
    expect(weights.text).toMatch(/fund_a\s+equity\s+10\s+130\s+USD\s+sin tipo BCE/);
    expect(weights.text).toContain("fund_a: la cotización está en USD y falta su valor en euros");
    expect(weights.text).toContain("(parcial)");
  });

  it("mark an approximation, and the calculator of the contribution says it", async () => {
    const b = new Events();
    b.settings({
      ...CLI_SETTINGS,
      target_weights: { fund_a: "100" },
      bucket_pct_of_contribution: "10",
    });
    b.account("acc_es");
    b.asset("etf_ref", "etf");
    b.push("asset_created", {
      asset_id: "fund_a",
      asset_type: "fund",
      book: "core",
      name: "fund_a",
      currency: "EUR",
      active: true,
      transferable: true,
      asset_class: "equity",
      reference_etf_id: "etf_ref",
    });
    b.deposit("acc_es", "2027-01-04", "10000");
    b.buy("acc_es", "fund_a", "2027-01-05", "10", "100");
    b.valuation("acc_es", "fund_a", "2027-06-01", "10", "200");
    const f = await folder(b.build());
    await writePrices(f.dir, { etf_ref: line("2027-06-01", "50") + line("2027-06-08", "55") });
    const weights = await f.atlas("weights", "--date", "2027-06-09");
    expect(weights.text).toMatch(
      /fund_a\s+equity\s+10\s+220\s+EUR\s+1\s+2027-06-08\s+1\s+EODHD ≈ aprox\./,
    );
    // The weights mark it on the row; the calculator of the contribution says
    // it, from the domain (ADR-0024, review of PR #78).
    const contribute = await f.atlas("contribute", "--amount", "100", "--date", "2027-06-09");
    expect(contribute.code).toBe(0);
    expect(contribute.text).toContain("el reparto de la aportación depende de una estimación");
  });

  it("degrade with a local configuration that does not read: said with its key, the view goes on", async () => {
    const f = await folder(ledger());
    await writePrices(f.dir, { fund_a: line("2027-06-01", "120") });
    await writeFile(join(f.dir, "atlas.config.json"), '{"ecb_stale_days": 3}');
    const weights = await f.atlas("weights", "--date", "2027-06-09");
    expect(weights.code).toBe(0);
    expect(weights.err).toContain("atlas.config.json");
    expect(weights.err).toContain("ecb_stale_days");
    expect(weights.err).toContain("no se usan precios automáticos");
    expect(weights.text).toMatch(
      /fund_a\s+equity\s+10\s+110\s+EUR\s+1\s+2027-05-31\s+9 ⚠\s+manual/,
    );
  });

  it("say a file of prices that does not read, and leave that asset without an automatic price", async () => {
    const f = await folder(ledger());
    await writePrices(f.dir, { fund_a: '{"schema_version":2}\n' });
    const weights = await f.atlas("weights", "--date", "2027-06-09");
    expect(weights.code).toBe(0);
    expect(weights.err).toContain("una versión más nueva que esta aplicación");
    expect(weights.text).toMatch(
      /fund_a\s+equity\s+10\s+110\s+EUR\s+1\s+2027-05-31\s+9 ⚠\s+manual/,
    );
  });
});

// ---------------------------------------------------------------------------
// The fiscal output does not move (feature 013, §5 and §6.4 (c)).
// ---------------------------------------------------------------------------

const fixtures = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/ledger",
);
const synthetic = async (): Promise<LedgerEvent[]> =>
  (await readFile(join(fixtures, "synthetic-v1.jsonl"), "utf8"))
    .split("\n")
    .filter((text) => text !== "")
    .map((text) => decodeLine(text).event);

const FISCAL = (year: string) => [
  ["tax", year],
  ["tax", year, "--lots"],
  ["tax", year, "--boxes"],
  ["tax", year, "--json"],
  ["gains", year],
  ["income", year],
  ["m720", year],
  ["m720", year, "--json"],
  ["m721", year],
  ["m721", year, "--json"],
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
  it("is identical byte for byte, with closes after the valuations of the 720 that win in a view", async () => {
    // An asset abroad valued by hand on 28 December, and automatic closes on
    // the 29th, 30th and 31st, much higher: they are the ones P2 would show.
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

    // And the closes do win where they may: a view of the same day shows them.
    const view = JSON.parse((await f.atlas("weights", "--date", "2027-12-31", "--json")).out);
    expect(view.data.rows[0].price).toMatchObject({ origin: "external", unit_value: "902" });
    const m720 = JSON.parse((await f.atlas("m720", "2027", "--json")).out);
    expect(JSON.stringify(m720)).toContain('"unit_value":"400"');
    expect(JSON.stringify(m720)).not.toContain("902");
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

// ---------------------------------------------------------------------------
// Cash in a foreign currency with the ECB history next to the ledger (live
// test of 2026-09-27): valued with the most recent rate of the history, the
// ledger's only without it, said once per currency — and nothing fiscal moves.
// ---------------------------------------------------------------------------

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

/** Dollars in two accounts, at the ledger's rate of May. */
const dollars = () => {
  const b = new Events();
  b.settings({ ...CLI_SETTINGS, stale_price_days: 3 });
  b.account("acc_ib", "IE");
  b.account("acc_ib2", "IE");
  for (const [account_id, amount] of [
    ["acc_ib", "1000"],
    ["acc_ib2", "500"],
  ]) {
    b.push("cash_deposit", {
      account_id,
      value_date: "2027-05-04",
      amount,
      currency: "USD",
      fx_rate: "1.0582",
      fx_rate_date: "2027-05-04",
    });
  }
  return b.build();
};

const STALE_USD = /El tipo de cambio aplicado a USD/g;

describe("the cash in a foreign currency in the net worth", () => {
  it("is valued with the most recent rate of the ECB history, over the ledger's", async () => {
    const f = await folder(dollars());
    await ecbHistory(f.dir, [
      ["2027-06-08", "1.25"],
      ["2027-06-07", "1.2"],
    ]);
    const view = await f.atlas("networth", "--date", "2027-06-09");
    expect(view.code).toBe(0);
    expect(view.text).toMatch(/acc_ib\s+USD\s+1000\s+1\.25\s+2027-06-08\s+1\s+800\.00/);
    expect(view.text).toMatch(/acc_ib2\s+USD\s+500\s+1\.25\s+2027-06-08\s+1\s+400\.00/);
    expect(view.text.match(STALE_USD)).toBeNull();
    const json = JSON.parse((await f.atlas("networth", "--date", "2027-06-09", "--json")).out);
    expect(json.data.cash.rows[0]).toMatchObject({ fx_rate: "1.25", fx_rate_source: "ecb" });
  });

  it("uses the ledger's rate when the history is older than it (round 1 of PR #102)", async () => {
    const f = await folder(dollars());
    await ecbHistory(f.dir, [["2027-04-30", "1.25"]]);
    const view = await f.atlas("networth", "--date", "2027-06-09");
    expect(view.text).toMatch(/acc_ib\s+USD\s+1000\s+1\.0582\s+2027-05-04/);
    const json = JSON.parse((await f.atlas("networth", "--date", "2027-06-09", "--json")).out);
    expect(json.data.cash.rows[0]).toMatchObject({ fx_rate: "1.0582", fx_rate_source: "ledger" });
  });

  it("says a stale rate once per currency, with the date of the rate used and its remedy", async () => {
    const f = await folder(dollars());
    await ecbHistory(f.dir, [["2027-06-01", "1.25"]]);
    const fromHistory = (await f.atlas("networth", "--date", "2027-06-09")).text;
    expect(fromHistory.match(STALE_USD)).toHaveLength(1);
    expect(fromHistory).toContain(
      "El tipo de cambio aplicado a USD es el del histórico del BCE del 2027-06-01, de hace 8 días; actualízalo con `atlas fx update`.",
    );
    // Without a history, the ledger's rate, said once as well.
    const bare = await folder(dollars());
    const fromLedger = await bare.atlas("networth", "--date", "2027-06-09");
    expect(fromLedger.text).toMatch(/acc_ib\s+USD\s+1000\s+1\.0582\s+2027-05-04/);
    expect(fromLedger.text.match(STALE_USD)).toHaveLength(1);
    expect(fromLedger.text).toContain(
      "El tipo de cambio aplicado a USD es de 36 días atrás (2027-05-04); registra una operación o una valoración más reciente en esa divisa.",
    );
    const json = JSON.parse((await bare.atlas("networth", "--date", "2027-06-09", "--json")).out);
    expect(json.data.cash.rows[0]).toMatchObject({ fx_rate_source: "ledger" });
  });
});

describe("the fiscal output with the ECB history next to the ledger", () => {
  it("does not move a byte with a rate that moves the net worth", async () => {
    // The prediction, written before running it: nothing fiscal moves. The
    // fiscal commands read the history to contrast the rates of the ledger,
    // so both folders have the same one, except the dollar of the last day,
    // after every event: only the cash of the net worth can use it.
    const events = await synthetic();
    const low = await folder(events);
    const high = await folder(events);
    low.instant = "2029-03-01T10:00:00.000Z";
    high.instant = low.instant;
    await ecbHistory(low.dir, [
      ["2029-02-28", "1.1"],
      ["2026-01-02", "1.1"],
    ]);
    await ecbHistory(high.dir, [
      ["2029-02-28", "2.5"],
      ["2026-01-02", "1.1"],
    ]);
    for (const year of ["2027", "2028"]) {
      for (const argv of FISCAL(year)) {
        const a = await low.atlas(...argv);
        const b = await high.atlas(...argv);
        expect({ argv, code: b.code, text: b.text }).toEqual({ argv, code: a.code, text: a.text });
      }
    }
    const cash = async (f: typeof low) =>
      JSON.parse((await f.atlas("networth", "--date", "2029-02-28", "--json")).out)
        .data.cash.rows.filter((row: { currency: string }) => row.currency === "USD")
        .map((row: { fx_rate: string; fx_rate_source: string }) => [
          row.fx_rate,
          row.fx_rate_source,
        ]);
    expect(await cash(low)).toContainEqual(["1.1", "ecb"]);
    expect(await cash(high)).toContainEqual(["2.5", "ecb"]);
  }, 120_000);
});
