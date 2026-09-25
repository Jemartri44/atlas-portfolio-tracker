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
import { checkSymbols, purgeMismatched, recordSymbols } from "../../src/quotes/declare.js";
import { approximationAt, externalPricesOf } from "../../src/quotes/external.js";
import { effectiveCloses, readCloseFile, readCloses } from "../../src/quotes/line.js";
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

// ---------------------------------------------------------------------------
// Review of PR #80.
// ---------------------------------------------------------------------------

const legacyConfirmed = (currency: string, over: Record<string, string>) =>
  JSON.stringify({
    symbols_format: 1,
    assets: {
      ast_spec: {
        currency,
        eodhd: "TSCO.LSE",
        alpha_vantage: "TSCO.LON",
        confirmed_at: AT,
        currency_check: Object.fromEntries(
          Object.entries({ eodhd: "GBP", alpha_vantage: "GBX" }).map(([s, found]) => [
            s,
            { found, at: AT },
          ]),
        ),
        currency_confirmed_over: over,
      },
    },
  });

describe("a file of 013 that confirmed a currency over another (review of PR #80, blocking)", () => {
  it("does not inherit the confirmation: that source is left uncontrasted, in both directions", () => {
    // Declared GBP and confirmed over the GBX of Alpha Vantage.
    const pounds = parseSymbols(legacyConfirmed("GBP", { alpha_vantage: "GBX" })).assets.ast_spec;
    expect(pounds?.currency_confirmed_over?.alpha_vantage).toBeUndefined();
    expect(pounds?.currency_check?.alpha_vantage).toBeUndefined();
    expect(pounds?.currency_check?.eodhd).toEqual({ found: "GBP", at: AT });
    // Declared GBX and confirmed over the GBP of EODHD.
    const pence = parseSymbols(legacyConfirmed("GBX", { eodhd: "GBP" })).assets.ast_spec;
    expect(pence?.currency_confirmed_over?.eodhd).toBeUndefined();
    expect(pence?.currency_check?.eodhd).toBeUndefined();
    expect(pence?.currency_check?.alpha_vantage).toEqual({ found: "GBX", at: AT });
  });

  it("leaves no check at all when the only one checked was the one confirmed over", () => {
    const raw = JSON.parse(legacyConfirmed("GBP", { alpha_vantage: "GBX" }));
    delete raw.assets.ast_spec.currency_check.eodhd;
    const entry = parseSymbols(JSON.stringify(raw)).assets.ast_spec;
    expect(entry?.currency_check).toBeUndefined();
    expect(entry?.currency_confirmed_over).toBeUndefined();
  });

  it("contrasts it again before the next download, and never stores pence as pounds", async () => {
    const store = new MemoryPriceStore();
    store.files.set("symbols.json", legacyConfirmed("GBP", { alpha_vantage: "GBX" }));
    const eodhd = new FakeSource("eodhd", () => ({ ok: false, kind: "unavailable" }), store);
    const alpha = new FakeSource(
      "alpha_vantage",
      () => closes(["2027-01-05", "1000"]),
      store,
      () => ({
        ok: true,
        value: "GBX",
      }),
    );
    const b = new LedgerBuilder();
    catalogue(b);
    b.thesisOpened({ thesis_id: "th1" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      trade_date: "2027-01-04",
      thesis_id: "th1",
    });
    const report = await updatePrices({
      state: projectLedger(b.build(), { asOf: TODAY }),
      settings: DEFAULT_SETTINGS,
      today: TODAY,
      now: () => new Date("2027-01-06T08:00:00.000Z"),
      store,
      sources: { eodhd, alpha_vantage: alpha },
    });
    expect(alpha.currencyCalls).toEqual(["TSCO.LON"]);
    expect(alpha.calls).toEqual([]);
    expect(store.files.get("ast_spec.jsonl") ?? "").toBe("");
    expect(report.assets[0]?.failures).toEqual([
      { source: "eodhd", kind: "unavailable" },
      { source: "alpha_vantage", kind: "currency_mismatch" },
    ]);
  });
});

describe("closes that 013 stored in the wrong currency (review of PR #80)", () => {
  const line = (date: string, close: string, currency: string, source: "eodhd" | "alpha_vantage") =>
    `${JSON.stringify({ schema_version: 1, date, close, currency, source, fetched_at: "2027-01-06T06:00:00.000Z" })}\n`;
  const symbols = parseSymbols(newFile(LONDON));

  it("are left out of everything in euros, and said: a hole, never a figure a hundred times wrong", () => {
    const { closes: read, mismatched } = readCloses(
      new Map([
        [
          "ast_spec",
          line("2027-01-04", "9", "GBP", "eodhd") +
            line("2027-01-05", "1000", "GBP", "alpha_vantage"),
        ],
      ]),
      symbols,
    );
    expect(read.get("ast_spec")?.map((c) => c.date)).toEqual(["2027-01-04"]);
    expect(mismatched).toEqual([
      {
        asset_id: "ast_spec",
        source: "alpha_vantage",
        declared: "GBX",
        count: 1,
        dates: ["2027-01-05"],
      },
    ]);
    // Without a declaration there is nothing to compare with: read as they are.
    expect(
      readCloses(new Map([["ast_x", line("2027-01-05", "1", "GBP", "alpha_vantage")]]), symbols)
        .closes.size,
    ).toBe(1);
  });

  it("are purged by an explicit command, of one asset and one source, and nothing else", async () => {
    const store = new MemoryPriceStore();
    store.files.set("symbols.json", newFile(LONDON));
    const text =
      line("2027-01-04", "9", "GBP", "eodhd") +
      line("2027-01-04", "1000", "GBP", "alpha_vantage") +
      line("2027-01-05", "1010", "GBX", "alpha_vantage");
    store.files.set("ast_spec.jsonl", text);
    expect(await purgeMismatched(store, "ast_spec", "eodhd")).toBe(0);
    expect(store.files.get("ast_spec.jsonl")).toBe(text);
    expect(await purgeMismatched(store, "ast_spec", "alpha_vantage")).toBe(1);
    expect(
      readCloseFile("ast_spec", store.files.get("ast_spec.jsonl") ?? "").map((l) => [
        l.source,
        l.close,
      ]),
    ).toEqual([
      ["eodhd", "9"],
      ["alpha_vantage", "1010"],
    ]);
    // An asset declared but with nothing downloaded yet: nothing to purge.
    store.files.delete("ast_spec.jsonl");
    expect(await purgeMismatched(store, "ast_spec", "alpha_vantage")).toBe(0);
    await expect(purgeMismatched(store, "ast_other", "eodhd")).rejects.toMatchObject({
      code: "symbols_not_declared",
    });
  });
});

describe("the approximation with a reference ETF of London", () => {
  const line = (date: string, close: string, currency: string, source: "eodhd" | "alpha_vantage") =>
    `${JSON.stringify({ schema_version: 1, date, close, currency, source, fetched_at: "2027-01-06T06:00:00.000Z" })}\n`;

  it("normalises pounds and pence instead of refusing a change of currency", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("etf_london", { asset_type: "etf" });
    b.assetUpdated({
      asset_id: "ast_world",
      asset_type: "fund",
      book: "core",
      asset_class: "equity",
      name: "ast_world",
      currency: "EUR",
      transferable: true,
      active: true,
      reference_etf_id: "etf_london",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-01-04",
      unit_value: "200",
    });
    const state = projectLedger(b.build());
    const etf = effectiveCloses(
      readCloseFile(
        "etf_london",
        line("2027-01-04", "10", "GBP", "eodhd") +
          line("2027-01-05", "1100", "GBX", "alpha_vantage"),
      ),
    );
    const result = approximationAt(
      state,
      new Map([["etf_london", etf]]),
      "ast_world",
      "2027-01-05",
    );
    expect(typeof result !== "string" && result.value.toString()).toBe("220");
  });
});

describe("the two guards the review found without a test (review of PR #80)", () => {
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
  const run = (store: MemoryPriceStore, sources: UpdatePricesInput["sources"]) =>
    updatePrices({
      state: ledger(),
      settings: DEFAULT_SETTINGS,
      today: TODAY,
      now: () => new Date("2027-01-06T08:00:00.000Z"),
      store,
      sources,
    });

  it("M4: a currency the user changes while its source is being contrasted is left as the user wrote it", async () => {
    const store = new MemoryPriceStore();
    store.files.set(
      "symbols.json",
      newFile({ alpha_vantage: "TSCO.LON", currencies: { alpha_vantage: "GBP" } }),
    );
    const alpha = new FakeSource(
      "alpha_vantage",
      () => closes(["2027-01-05", "1000"]),
      store,
      () => {
        // The user corrects the currency to pence meanwhile; same symbol.
        store.files.set(
          "symbols.json",
          newFile({ alpha_vantage: "TSCO.LON", currencies: { alpha_vantage: "GBX" } }),
        );
        return { ok: true, value: "GBX" };
      },
    );
    await run(store, { alpha_vantage: alpha });
    const entry = parseSymbols(store.files.get("symbols.json")).assets.ast_spec;
    expect(entry?.currencies).toEqual({ alpha_vantage: "GBX" });
    expect(entry?.currency_check).toBeUndefined();
  });

  it("M2: a close whose own currency is not the one declared for its source is never stored", async () => {
    // A source of tomorrow that says the currency of each close.
    const store = new MemoryPriceStore();
    store.files.set(
      "symbols.json",
      newFile({ ...LONDON, currency_check: { eodhd: { at: AT }, alpha_vantage: { at: AT } } }),
    );
    const eodhd = new FakeSource("eodhd", () => ({ ok: false, kind: "unavailable" }), store);
    const alpha = new FakeSource(
      "alpha_vantage",
      () => ({
        ok: true,
        value: [{ date: "2027-01-05", close: "1000", currency: "GBP" }],
      }),
      store,
    );
    const report = await run(store, { eodhd, alpha_vantage: alpha });
    expect(store.files.get("ast_spec.jsonl") ?? "").toBe("");
    expect(report.assets[0]?.failures).toContainEqual({
      source: "alpha_vantage",
      kind: "currency_mismatch",
    });
    // Its own currency right: stored.
    const right = new FakeSource(
      "alpha_vantage",
      () => ({
        ok: true,
        value: [{ date: "2027-01-05", close: "1000", currency: "GBX" }],
      }),
      store,
    );
    await run(store, { eodhd, alpha_vantage: right });
    expect(readCloseFile("ast_spec", store.files.get("ast_spec.jsonl") ?? "")[0]).toMatchObject({
      currency: "GBX",
    });
  });
});
