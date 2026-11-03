// What the console says when the automatic prices of the folder do not load, seen through the one
// view that still reads them (`thesis show`): it goes on with the manual prices, and says why. The
// choice of price, the newer quote, the approximation and the cash rate are the domain's, and have
// their tests there.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_SETTINGS, Events } from "../events.js";
import { folder } from "./folder.js";

const ledger = () => {
  const b = new Events();
  b.settings(CLI_SETTINGS);
  b.account("acc_bucket", "ES", "bucket");
  b.push("asset_created", {
    asset_id: "etf_b",
    asset_type: "etf",
    book: "bucket",
    name: "etf_b",
    currency: "EUR",
    active: true,
    transferable: false,
  });
  b.deposit("acc_bucket", "2027-01-04", "10000");
  b.push("thesis_opened", {
    thesis_id: "th_1",
    account_id: "acc_bucket",
    asset_id: "etf_b",
    hypothesis: "h",
    expected_horizon_days: 90,
    invalidation: "i",
    planned_size_eur: "1000",
  });
  b.push("buy", {
    account_id: "acc_bucket",
    asset_id: "etf_b",
    trade_date: "2027-01-05",
    value_date: "2027-01-05",
    quantity: "10",
    unit_price: "100",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2027-01-05",
    fee: "0",
    source: "manual",
    thesis_id: "th_1",
  });
  b.valuation("acc_bucket", "etf_b", "2027-06-08", "10", "105");
  return b.build();
};

const line = (close: string, currency: string, source: string) =>
  `${JSON.stringify({ schema_version: 1, date: "2027-06-09", close, currency, source, fetched_at: "2027-06-09T06:00:00.000Z" })}\n`;

const show = async (f: Awaited<ReturnType<typeof folder>>) => {
  const result = await f.atlas("thesis", "show", "th_1", "--date", "2027-06-09", "--json");
  return { ...result, unrealized: JSON.parse(result.out).data?.unrealized_eur };
};

const withPrices = async (f: Awaited<ReturnType<typeof folder>>, files: Record<string, string>) => {
  await mkdir(join(f.dir, "prices"), { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(f.dir, "prices", name), text);
  }
};

describe("a view that reads prices when they do not load", () => {
  it("uses the closes of prices/ when they are fine", async () => {
    const f = await folder(ledger());
    await withPrices(f, { "etf_b.jsonl": line("120", "EUR", "eodhd") });
    expect((await show(f)).unrealized).toBe("200");
  });

  it("goes on with the manual price when atlas.config.json does not read, and says its key", async () => {
    const f = await folder(ledger());
    await withPrices(f, { "etf_b.jsonl": line("120", "EUR", "eodhd") });
    await writeFile(join(f.dir, "atlas.config.json"), '{"ecb_stale_days": 3}');
    const result = await show(f);
    expect(result.code).toBe(0);
    expect(result.err).toContain("ecb_stale_days");
    expect(result.err).toContain("no se usan precios automáticos");
    expect(result.unrealized).toBe("50");
  });

  it("leaves an asset without automatic price when its file is of a newer version, and says so", async () => {
    const f = await folder(ledger());
    await withPrices(f, { "etf_b.jsonl": '{"schema_version":2}\n' });
    const result = await show(f);
    expect(result.code).toBe(0);
    expect(result.err).toContain("una versión más nueva de la aplicación");
    expect(result.unrealized).toBe("50");
  });

  for (const [what, text, reason] of [
    ["does not read", "{", "no se entiende"],
    ["is of a newer format", '{"symbols_format":3,"assets":{}}', "versión más nueva"],
  ] as const) {
    it(`degrades to the manual prices when symbols.json ${what}, and says why`, async () => {
      const f = await folder(ledger());
      await withPrices(f, { "etf_b.jsonl": line("120", "GBP", "eodhd"), "symbols.json": text });
      const result = await show(f);
      expect(result.code).toBe(0);
      expect(result.err).toContain(reason);
      expect(result.err).toContain("no se usan precios automáticos");
      expect(result.unrealized).toBe("50");
    });
  }

  it("leaves out closes stored in a currency other than the declared one, and says it", async () => {
    const f = await folder(ledger());
    const symbols = JSON.stringify({
      symbols_format: 2,
      assets: {
        etf_b: {
          eodhd: "TSCO.LSE",
          alpha_vantage: "TSCO.LON",
          currencies: { eodhd: "GBP", alpha_vantage: "GBX" },
          confirmed_at: "x",
          currency_check: { eodhd: { at: "x" }, alpha_vantage: { at: "x" } },
        },
      },
    });
    await withPrices(f, {
      "symbols.json": symbols,
      "etf_b.jsonl": line("1000", "GBP", "alpha_vantage"),
    });
    const result = await show(f);
    expect(result.err).toContain(
      "etf_b: 1 cierre de Alpha Vantage está guardado en una divisa que no es la declarada para esa fuente (GBX)",
    );
    expect(result.unrealized).toBe("50");
  });
});
