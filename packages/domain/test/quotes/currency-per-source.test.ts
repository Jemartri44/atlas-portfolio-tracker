// The currency of a quote is declared **per source**, not per asset (fix of
// feature 013): a London share quotes in pounds at EODHD and in pence at Alpha
// Vantage, and one currency for the asset made one of the two sources ask for
// a confirmation forever, or stored the closes of the fallback a hundred times
// too high.

import { describe, expect, it } from "vitest";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import { priceAt } from "../../src/projections/prices.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { type UpdatePricesInput, updatePrices } from "../../src/quotes/cascade.js";
import { checkSymbols, recordSymbols } from "../../src/quotes/declare.js";
import { externalPricesOf } from "../../src/quotes/external.js";
import { effectiveCloses, readCloseFile } from "../../src/quotes/line.js";
import {
  currencyAgrees,
  declareSymbols,
  parseSymbols,
  serializeSymbols,
} from "../../src/quotes/symbols.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { closes, FakeSource, MemoryPriceStore } from "./fakes.js";

const AT = "2027-01-01T00:00:00.000Z";
const TODAY = "2027-01-06";

/** A London share in the bucket: pounds at EODHD, pence at Alpha Vantage. */
const LONDON = {
  eodhd: "TSCO.LSE",
  alpha_vantage: "TSCO.LON",
  currencies: { eodhd: "GBP", alpha_vantage: "GBX" },
} as const;

const newFile = (entry: object) =>
  JSON.stringify({ symbols_format: 2, assets: { ast_spec: { confirmed_at: AT, ...entry } } });

describe("the currency declared per source", () => {
  it("is read and written per source, and each source is contrasted with its own", () => {
    const file = parseSymbols(
      newFile({
        ...LONDON,
        currency_check: {
          eodhd: { found: "GBP", at: AT },
          alpha_vantage: { found: "GBX", at: AT },
        },
      }),
    );
    const entry = file.assets.ast_spec;
    expect(entry?.currencies).toEqual({ eodhd: "GBP", alpha_vantage: "GBX" });
    expect(currencyAgrees(entry as never, "eodhd")).toBe(true);
    expect(currencyAgrees(entry as never, "alpha_vantage")).toBe(true);
    expect(parseSymbols(serializeSymbols(file))).toEqual(file);
    expect(JSON.parse(serializeSymbols(file)).symbols_format).toBe(2);
  });

  it("reads a file of feature 013, one currency per asset, as the currency of all its sources", () => {
    const old = JSON.stringify({
      symbols_format: 1,
      assets: {
        ast_spec: {
          currency: "GBX",
          eodhd: "TSCO.LSE",
          alpha_vantage: "TSCO.LON",
          confirmed_at: AT,
          currency_check: { eodhd: { found: "GBP", at: AT } },
        },
      },
    });
    const entry = parseSymbols(old).assets.ast_spec;
    expect(entry?.currencies).toEqual({ eodhd: "GBX", alpha_vantage: "GBX" });
    // A source already contrasted that contradicts it still asks, as always.
    expect(currencyAgrees(entry as never, "eodhd")).toBe(false);
    // Written again, it is the new format, with the same meaning.
    expect(parseSymbols(serializeSymbols(parseSymbols(old)))).toEqual(parseSymbols(old));
  });

  it("refuses a source without its currency, or a currency that is not a code", () => {
    for (const [text, field] of [
      [newFile({ eodhd: "X", currencies: {} }), "ast_spec.currencies.eodhd"],
      [newFile({ eodhd: "X", currencies: { eodhd: "gbp" } }), "ast_spec.currencies.eodhd"],
      [
        newFile({ eodhd: "X", currencies: { yahoo: "GBP", eodhd: "GBP" } }),
        "ast_spec.currencies.yahoo",
      ],
      [newFile({ eodhd: "X", currencies: [] }), "ast_spec.currencies"],
      [newFile({ eodhd: "X", currency: "GBP", currencies: { eodhd: "GBP" } }), "ast_spec.currency"],
      ['{"symbols_format":3,"assets":{}}', "symbols_format"],
    ] as const) {
      expect(() => parseSymbols(text), text).toThrow(
        expect.objectContaining({ code: "invalid_symbols_file", details: { field } }),
      );
    }
  });

  it("asks for nothing when each source says the currency declared for it: the confirmation does not loop", () => {
    const { entry, pending } = declareSymbols(
      LONDON,
      { eodhd: "GBP", alpha_vantage: "GBX" },
      AT,
      [],
    );
    expect(pending).toEqual([]);
    expect(entry.currencies).toEqual({ eodhd: "GBP", alpha_vantage: "GBX" });
    // Declared in pence for both, EODHD disagrees — only EODHD.
    const both = declareSymbols(
      { ...LONDON, currencies: { eodhd: "GBX", alpha_vantage: "GBX" } },
      { eodhd: "GBP", alpha_vantage: "GBX" },
      AT,
      [],
    );
    expect(both.pending).toEqual([{ source: "eodhd", declared: "GBX", found: "GBP" }]);
    expect(() => declareSymbols({ eodhd: "X", currencies: {} }, {}, AT, [])).toThrow(
      expect.objectContaining({ code: "invalid_symbols_file" }),
    );
  });
});

describe("London with its two sources, end to end", () => {
  const ledger = () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.thesisOpened({ thesis_id: "th1" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      trade_date: "2027-01-04",
      thesis_id: "th1",
    });
    return projectLedger(b.build(), { asOf: TODAY });
  };

  const run = (store: MemoryPriceStore, sources: UpdatePricesInput["sources"]) => {
    let tick = Date.parse("2027-01-06T08:00:00.000Z");
    return updatePrices({
      state: ledger(),
      settings: DEFAULT_SETTINGS,
      today: TODAY,
      now: () => {
        tick += 1000;
        return new Date(tick);
      },
      store,
      sources,
    });
  };

  it("declares, contrasts and downloads without asking once, and stores each close in the currency of its source", async () => {
    const store = new MemoryPriceStore();
    const eodhd = new FakeSource(
      "eodhd",
      () => ({ ok: false, kind: "unavailable" }),
      store,
      () => ({
        ok: true,
        value: "GBP",
      }),
    );
    const alpha = new FakeSource(
      "alpha_vantage",
      () => closes(["2027-01-05", "1000"]),
      store,
      () => ({
        ok: true,
        value: "GBX",
      }),
    );
    const now = () => new Date("2027-01-06T07:00:00.000Z");
    const check = await checkSymbols({
      declaration: LONDON,
      store,
      sources: { eodhd, alpha_vantage: alpha },
      now,
    });
    expect(check).toEqual({
      ok: true,
      checks: { eodhd: "GBP", alpha_vantage: "GBX" },
      unchecked: [],
    });
    expect(
      await recordSymbols({
        assetId: "ast_spec",
        declaration: LONDON,
        checks: (check as { checks: object }).checks,
        accepted: [],
        store,
        now,
      }),
    ).toEqual([]);
    // The fallback answers: its close is kept in pence, never in pounds.
    await run(store, { eodhd, alpha_vantage: alpha });
    expect(eodhd.currencyCalls).toEqual(["TSCO.LSE"]);
    expect(readCloseFile("ast_spec", store.files.get("ast_spec.jsonl") ?? "")[0]).toMatchObject({
      close: "1000",
      currency: "GBX",
      source: "alpha_vantage",
    });
    // The primary answers the day after with its close in pounds, which replaces it.
    const primary = new FakeSource("eodhd", () => closes(["2027-01-05", "10"]), store);
    store.files.set("ast_spec.jsonl", "");
    await run(store, { eodhd: primary, alpha_vantage: alpha });
    expect(readCloseFile("ast_spec", store.files.get("ast_spec.jsonl") ?? "")[0]).toMatchObject({
      close: "10",
      currency: "GBP",
      source: "eodhd",
    });
    expect(alpha.currencyCalls).toEqual(["TSCO.LON"]);
  });

  it("gives the same value in euros for 10 GBP from EODHD and 1000 GBX from Alpha Vantage", () => {
    const history = readEcbZipCsv(["Date,USD,GBP,", "2027-01-05,1.2,0.8,"].join("\n"));
    const line = (close: string, currency: string, source: "eodhd" | "alpha_vantage") => ({
      schema_version: 1,
      date: "2027-01-05",
      close,
      currency,
      source,
      fetched_at: "2027-01-06T06:00:00.000Z",
    });
    const state = ledger();
    const inEur = (close: string, currency: string, source: "eodhd" | "alpha_vantage") =>
      priceAt(
        state,
        "ast_spec",
        TODAY,
        DEFAULT_SETTINGS,
        externalPricesOf(state, {
          closes: new Map([["ast_spec", effectiveCloses([line(close, currency, source)])]]),
          history,
          staleDays: 30,
        }),
      )?.unit_value_eur?.amount.toString();
    expect(inEur("10", "GBP", "eodhd")).toBe("12.5");
    expect(inEur("1000", "GBX", "alpha_vantage")).toBe("12.5");
  });
});
