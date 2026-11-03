// The currency of a quote is declared **per source** (a pair asset-source, never
// the asset): a London share quotes in pounds at one source and in pence at
// another, and the closes stored in a currency their source does not declare
// are left out, said and purged, never converted by a guess.

import { describe, expect, it } from "vitest";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import { priceAt } from "../../src/projections/prices.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { type UpdatePricesInput, updatePrices } from "../../src/quotes/cascade.js";
import {
  assertNothingMisstored,
  checkSymbols,
  purgeMismatched,
  recordSymbols,
  removeSymbols,
} from "../../src/quotes/declare.js";
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

/** A London share in the bucket: pounds at EODHD. */
const LONDON = {
  eodhd: "TSCO.LSE",
  currencies: { eodhd: "GBP" },
} as const;

const newFile = (entry: object) =>
  JSON.stringify({ symbols_format: 2, assets: { ast_spec: { confirmed_at: AT, ...entry } } });

const line = (date: string, close: string, currency: string) =>
  `${JSON.stringify({ schema_version: 1, date, close, currency, source: "eodhd", fetched_at: "2027-01-06T06:00:00.000Z" })}\n`;

const spotLedger = () => {
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
    state: spotLedger(),
    settings: DEFAULT_SETTINGS,
    today: TODAY,
    now: () => new Date("2027-01-06T08:00:00.000Z"),
    store,
    sources,
  });

/**
 * A file whose closes of EODHD were stored with `currency` although the source
 * says another: the declared currency is `currency` too, and it is `misstored`.
 */
const misstoredFile = (currency: string) =>
  newFile({
    eodhd: "TSCO.LSE",
    currencies: { eodhd: currency },
    currency_check: { eodhd: { found: currency, at: AT } },
    misstored: { eodhd: currency },
  });

describe("the currency declared per source", () => {
  it("is read and written per source, and each source is contrasted with its own", () => {
    const file = parseSymbols(
      newFile({ ...LONDON, currency_check: { eodhd: { found: "GBP", at: AT } } }),
    );
    const entry = file.assets.ast_spec;
    expect(entry?.currencies).toEqual({ eodhd: "GBP" });
    expect(currencyAgrees(entry as never, "eodhd")).toBe(true);
    expect(parseSymbols(serializeSymbols(file))).toEqual(file);
    expect(JSON.parse(serializeSymbols(file)).symbols_format).toBe(2);
  });

  it("refuses a source without its currency, or a currency that is not a code, or a source that is gone", () => {
    for (const [text, field] of [
      [newFile({ eodhd: "X", currencies: {} }), "ast_spec.currencies.eodhd"],
      [newFile({ eodhd: "X", currencies: { eodhd: "gbp" } }), "ast_spec.currencies.eodhd"],
      [
        newFile({ eodhd: "X", currencies: { yahoo: "GBP", eodhd: "GBP" } }),
        "ast_spec.currencies.yahoo",
      ],
      [
        newFile({ eodhd: "X", currencies: { alpha_vantage: "GBX", eodhd: "GBP" } }),
        "ast_spec.currencies.alpha_vantage",
      ],
      [newFile({ eodhd: "X", currencies: [] }), "ast_spec.currencies"],
      [newFile({ eodhd: "X", currency: "GBP", currencies: { eodhd: "GBP" } }), "ast_spec.currency"],
      [
        newFile({ eodhd: "X", currencies: { eodhd: "GBP" }, misstored: { eodhd: "p" } }),
        "ast_spec.misstored.eodhd",
      ],
      [
        newFile({ eodhd: "X", currencies: { eodhd: "GBP" }, misstored: { alpha_vantage: "GBP" } }),
        "ast_spec.misstored.alpha_vantage",
      ],
      [
        newFile({
          eodhd: "X",
          currencies: { eodhd: "GBP" },
          refetch_days: { eodhd: ["2027-02-30"] },
        }),
        "ast_spec.refetch_days.eodhd",
      ],
      [
        newFile({
          eodhd: "X",
          currencies: { eodhd: "GBP" },
          refetch_days: { alpha_vantage: ["2027-01-04"] },
        }),
        "ast_spec.refetch_days.alpha_vantage",
      ],
      [
        newFile({
          eodhd: "X",
          currencies: { eodhd: "GBP" },
          unserved_days: { alpha_vantage: ["2027-01-04"] },
        }),
        "ast_spec.unserved_days.alpha_vantage",
      ],
    ] as const) {
      expect(() => parseSymbols(text), text).toThrow(
        expect.objectContaining({ code: "invalid_symbols_file", details: { field } }),
      );
    }
  });

  it("says a file of a newer format as such, never as one that does not read", () => {
    expect(() => parseSymbols('{"symbols_format":3,"assets":{}}')).toThrow(
      expect.objectContaining({ code: "symbols_file_newer_version", details: { format: 3 } }),
    );
  });

  it("asks for nothing when the source says the currency declared for it: the confirmation does not loop", () => {
    const { entry, pending } = declareSymbols(LONDON, { eodhd: "GBP" }, AT, []);
    expect(pending).toEqual([]);
    expect(entry.currencies).toEqual({ eodhd: "GBP" });
    // Declared in pence, EODHD says pounds.
    const pence = declareSymbols(
      { ...LONDON, currencies: { eodhd: "GBX" } },
      { eodhd: "GBP" },
      AT,
      [],
    );
    expect(pence.pending).toEqual([{ source: "eodhd", declared: "GBX", found: "GBP" }]);
    expect(() => declareSymbols({ eodhd: "X", currencies: {} }, {}, AT, [])).toThrow(
      expect.objectContaining({ code: "invalid_symbols_file" }),
    );
  });
});

describe("London, end to end", () => {
  it("declares, contrasts and downloads without asking twice, and stores each close in the declared currency", async () => {
    const store = new MemoryPriceStore();
    const eodhd = new FakeSource(
      "eodhd",
      () => closes(["2027-01-05", "10"]),
      store,
      () => ({
        ok: true,
        value: "GBP",
      }),
    );
    const now = () => new Date("2027-01-06T07:00:00.000Z");
    const check = await checkSymbols({ declaration: LONDON, store, sources: { eodhd }, now });
    expect(check).toEqual({ ok: true, checks: { eodhd: "GBP" }, unchecked: [] });
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
    await run(store, { eodhd });
    // Contrasted once, when declared; not again before downloading.
    expect(eodhd.currencyCalls).toEqual(["TSCO.LSE"]);
    expect(readCloseFile("ast_spec", store.files.get("ast_spec.jsonl") ?? "")[0]).toMatchObject({
      close: "10",
      currency: "GBP",
      source: "eodhd",
    });
  });

  it("gives the same value in euros for 10 GBP and 1000 GBX", () => {
    const history = readEcbZipCsv(["Date,USD,GBP,", "2027-01-05,1.2,0.8,"].join("\n"));
    const state = spotLedger();
    const inEur = (close: string, currency: string) =>
      priceAt(
        state,
        "ast_spec",
        TODAY,
        DEFAULT_SETTINGS,
        externalPricesOf(state, {
          closes: new Map([
            [
              "ast_spec",
              effectiveCloses(readCloseFile("ast_spec", line("2027-01-05", close, currency))),
            ],
          ]),
          history,
          staleDays: 30,
        }),
      )?.unit_value_eur?.amount.toString();
    expect(inEur("10", "GBP")).toBe("12.5");
    expect(inEur("1000", "GBX")).toBe("12.5");
  });
});

describe("closes stored in a currency their source does not declare", () => {
  const symbols = parseSymbols(newFile(LONDON));

  it("are left out of everything in euros, and said: a hole, never a figure a hundred times wrong", () => {
    const { closes: read, mismatched } = readCloses(
      new Map([["ast_spec", line("2027-01-04", "9", "GBP") + line("2027-01-05", "1000", "GBX")]]),
      symbols,
    );
    expect(read.get("ast_spec")?.map((c) => c.date)).toEqual(["2027-01-04"]);
    expect(mismatched).toEqual([
      { asset_id: "ast_spec", source: "eodhd", declared: "GBP", count: 1, dates: ["2027-01-05"] },
    ]);
    // Without a declaration there is nothing to compare with: read as they are.
    expect(
      readCloses(new Map([["ast_x", line("2027-01-05", "1", "GBX")]]), symbols).closes.size,
    ).toBe(1);
  });

  it("are purged by an explicit command, of one asset, and nothing else", async () => {
    const store = new MemoryPriceStore();
    store.files.set("symbols.json", newFile(LONDON));
    const good = line("2027-01-04", "9", "GBP");
    store.files.set("ast_spec.jsonl", good);
    expect(await purgeMismatched(store, "ast_spec", "eodhd")).toBe(0);
    expect(store.files.get("ast_spec.jsonl")).toBe(good);
    store.files.set("ast_spec.jsonl", good + line("2027-01-05", "1000", "GBX"));
    expect(await purgeMismatched(store, "ast_spec", "eodhd")).toBe(1);
    expect(
      readCloseFile("ast_spec", store.files.get("ast_spec.jsonl") ?? "").map((l) => l.close),
    ).toEqual(["9"]);
    // An asset declared but with nothing downloaded yet: nothing to purge.
    store.files.delete("ast_spec.jsonl");
    expect(await purgeMismatched(store, "ast_spec", "eodhd")).toBe(0);
    await expect(purgeMismatched(store, "ast_other", "eodhd")).rejects.toMatchObject({
      code: "symbols_not_declared",
    });
  });
});

describe("the approximation with a reference ETF of London", () => {
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
        line("2027-01-04", "10", "GBP") + line("2027-01-05", "1100", "GBX"),
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

describe("the declared currency while the source is contrasted and downloaded", () => {
  it("a currency the user changes while its source is being contrasted is left as the user wrote it", async () => {
    const store = new MemoryPriceStore();
    store.files.set("symbols.json", newFile({ eodhd: "TSCO.LSE", currencies: { eodhd: "GBP" } }));
    const eodhd = new FakeSource(
      "eodhd",
      () => closes(["2027-01-05", "1000"]),
      store,
      () => {
        // The user corrects the currency to pence meanwhile; same symbol.
        store.files.set(
          "symbols.json",
          newFile({ eodhd: "TSCO.LSE", currencies: { eodhd: "GBX" } }),
        );
        return { ok: true, value: "GBX" };
      },
    );
    await run(store, { eodhd });
    const entry = parseSymbols(store.files.get("symbols.json")).assets.ast_spec;
    expect(entry?.currencies).toEqual({ eodhd: "GBX" });
    expect(entry?.currency_check).toBeUndefined();
  });

  it("a close whose own currency is not the one declared for its source is never stored", async () => {
    const store = new MemoryPriceStore();
    store.files.set("symbols.json", newFile({ ...LONDON, currency_check: { eodhd: { at: AT } } }));
    const says = (currency: string) =>
      new FakeSource(
        "eodhd",
        () => ({ ok: true, value: [{ date: "2027-01-05", close: "1000", currency }] }),
        store,
      );
    const report = await run(store, { eodhd: says("GBX") });
    expect(store.files.get("ast_spec.jsonl") ?? "").toBe("");
    expect(report.assets[0]?.failures).toContainEqual({
      source: "eodhd",
      kind: "currency_mismatch",
    });
    // Its own currency right: stored.
    await run(store, { eodhd: says("GBP") });
    expect(readCloseFile("ast_spec", store.files.get("ast_spec.jsonl") ?? "")[0]).toMatchObject({
      currency: "GBP",
    });
  });
});

describe("closes stored wrong (misstored) are left out and purged like any other", () => {
  it.each([
    ["GBP", "1000", "its pence stored as pounds, a hundred times too high"],
    ["GBX", "9", "its pounds stored as pence, a hundred times too low"],
  ])("EODHD closes stored as %s (%s): %s, left out", (currency, close) => {
    const { closes: read, mismatched } = readCloses(
      new Map([["ast_spec", line("2027-01-05", close, currency)]]),
      parseSymbols(misstoredFile(currency)),
    );
    expect(read.get("ast_spec")).toEqual([]);
    expect(mismatched).toEqual([
      {
        asset_id: "ast_spec",
        source: "eodhd",
        declared: currency,
        misstored: currency,
        count: 1,
        dates: ["2027-01-05"],
      },
    ]);
  });

  it("stays known when the file is written again, and when the source is declared again", async () => {
    const lines = new Map([["ast_spec", line("2027-01-05", "1000", "GBP")]]);
    const again = parseSymbols(serializeSymbols(parseSymbols(misstoredFile("GBP"))));
    expect(readCloses(lines, again).closes.get("ast_spec")).toEqual([]);
    const store = new MemoryPriceStore();
    store.files.set("symbols.json", serializeSymbols(again));
    await recordSymbols({
      assetId: "ast_spec",
      declaration: { eodhd: "TSCO.LSE", currencies: { eodhd: "GBP" } },
      checks: { eodhd: "GBX" },
      accepted: ["eodhd"],
      store,
      now: () => new Date(AT),
    });
    expect(
      readCloses(lines, parseSymbols(store.files.get("symbols.json"))).closes.get("ast_spec"),
    ).toEqual([]);
  });

  it("is purged like any other, and then nothing of that source is left out any more", async () => {
    const store = new MemoryPriceStore();
    store.files.set("symbols.json", misstoredFile("GBP"));
    store.files.set("ast_spec.jsonl", line("2027-01-05", "1000", "GBP"));
    expect(await purgeMismatched(store, "ast_spec", "eodhd")).toBe(1);
    const entry = parseSymbols(store.files.get("symbols.json")).assets.ast_spec;
    expect(entry?.misstored).toBeUndefined();
    expect(entry?.refetch_days).toEqual({ eodhd: ["2027-01-05"] });
  });
});

describe("a purge asks for its days again", () => {
  it("the bad line of one day and the good one of a later day: the next download starts at the purged day", async () => {
    const store = new MemoryPriceStore();
    store.files.set("symbols.json", newFile({ ...LONDON, currency_check: { eodhd: { at: AT } } }));
    store.files.set(
      "ast_spec.jsonl",
      line("2027-01-04", "1000", "GBX") + line("2027-01-05", "10", "GBP"),
    );
    expect(await purgeMismatched(store, "ast_spec", "eodhd")).toBe(1);
    const eodhd = new FakeSource(
      "eodhd",
      () => closes(["2027-01-04", "9.9"], ["2027-01-05", "10"]),
      store,
    );
    const report = await run(store, { eodhd });
    expect(eodhd.calls.map((c) => c.from)).toEqual(["2027-01-04"]);
    expect(report.assets[0]?.outcome).toBe("updated");
    expect(
      effectiveCloses(readCloseFile("ast_spec", store.files.get("ast_spec.jsonl") ?? "")).map(
        (c) => [c.date, c.close],
      ),
    ).toEqual([
      ["2027-01-04", "9.9"],
      ["2027-01-05", "10"],
    ]);
    // Asked once: the promise is kept, and the next run is up to date again.
    expect(
      parseSymbols(store.files.get("symbols.json")).assets.ast_spec?.refetch_days,
    ).toBeUndefined();
  });
});

describe("what a declaration, a purge and a removal carry, keep and clear of the days owed", () => {
  it("a new declaration keeps every day owed, and the marks of the source it declares", async () => {
    const store = new MemoryPriceStore();
    store.files.set(
      "symbols.json",
      newFile({
        ...LONDON,
        misstored: { eodhd: "GBX" },
        refetch_days: { eodhd: ["2027-01-04"] },
        unserved_days: { eodhd: ["2027-01-03"] },
      }),
    );
    await recordSymbols({
      assetId: "ast_spec",
      declaration: LONDON,
      checks: {},
      accepted: [],
      store,
      now: () => new Date(AT),
    });
    const entry = parseSymbols(store.files.get("symbols.json")).assets.ast_spec;
    expect(entry?.misstored).toEqual({ eodhd: "GBX" });
    expect(entry?.refetch_days).toEqual({ eodhd: ["2027-01-04"] });
    expect(entry?.unserved_days).toEqual({ eodhd: ["2027-01-03"] });
  });

  it("a purge adds its days to those already owed; with nothing left in the file, it only clears the mark", async () => {
    const store = new MemoryPriceStore();
    const declared = (misstored: object) =>
      newFile({ ...LONDON, misstored, refetch_days: { eodhd: ["2027-01-01"] } });
    store.files.set("symbols.json", declared({ eodhd: "GBX" }));
    store.files.set("ast_spec.jsonl", line("2027-01-05", "1000", "GBX"));
    expect(await purgeMismatched(store, "ast_spec", "eodhd")).toBe(1);
    let entry = parseSymbols(store.files.get("symbols.json")).assets.ast_spec;
    expect(entry?.misstored).toBeUndefined();
    expect(entry?.refetch_days).toEqual({ eodhd: ["2027-01-01", "2027-01-05"] });
    // Its mark, with nothing of it left in the file: cleared, nothing owed.
    store.files.set("symbols.json", declared({ eodhd: "GBX" }));
    expect(await purgeMismatched(store, "ast_spec", "eodhd")).toBe(0);
    entry = parseSymbols(store.files.get("symbols.json")).assets.ast_spec;
    expect(entry?.misstored).toBeUndefined();
    expect(entry?.refetch_days).toEqual({ eodhd: ["2027-01-01"] });
  });

  it("clears only what it asked: a purge made meanwhile stays owed, and a removal is left as it is", async () => {
    const meanwhileRun = async (meanwhile: (store: MemoryPriceStore) => void) => {
      const store = new MemoryPriceStore();
      store.files.set(
        "symbols.json",
        newFile({
          ...LONDON,
          currency_check: { eodhd: { at: AT } },
          refetch_days: { eodhd: ["2027-01-04"] },
        }),
      );
      store.files.set("ast_spec.jsonl", line("2027-01-05", "10", "GBP"));
      const eodhd = new FakeSource(
        "eodhd",
        () => {
          meanwhile(store);
          return closes(["2027-01-04", "9.9"]);
        },
        store,
      );
      await run(store, { eodhd });
      return parseSymbols(store.files.get("symbols.json")).assets.ast_spec;
    };
    const setOwed = (days: string[]) => (store: MemoryPriceStore) => {
      const file = JSON.parse(store.files.get("symbols.json") as string);
      file.assets.ast_spec.refetch_days = { eodhd: days };
      store.files.set("symbols.json", JSON.stringify(file));
    };
    // Another day purged meanwhile: the one asked is cleared, the new one stays owed.
    expect((await meanwhileRun(setOwed(["2027-01-04", "2027-01-02"])))?.refetch_days).toEqual({
      eodhd: ["2027-01-02"],
    });
    // The same day purged again meanwhile, from an earlier one: still owed.
    expect((await meanwhileRun(setOwed(["2027-01-01"])))?.refetch_days).toEqual({
      eodhd: ["2027-01-01"],
    });
    const removed = await meanwhileRun((store) => {
      store.files.set("symbols.json", JSON.stringify({ symbols_format: 2, assets: {} }));
    });
    expect(removed).toBeUndefined();
  });
});

describe("a mark of closes stored wrong leaves only through a purge", () => {
  const pending = () =>
    newFile({ ...LONDON, currency_check: { eodhd: { at: AT } }, misstored: { eodhd: "GBX" } });
  const without = { currencies: {} };

  it("refuses to declare the asset again without the source with closes stored wrong", async () => {
    const store = new MemoryPriceStore();
    store.files.set("symbols.json", pending());
    await expect(
      recordSymbols({
        assetId: "ast_spec",
        declaration: without,
        checks: {},
        accepted: [],
        store,
        now: () => new Date(AT),
      }),
    ).rejects.toMatchObject({
      code: "symbols_misstored_pending",
      details: { asset_id: "ast_spec", source: "eodhd" },
    });
    expect(store.files.get("symbols.json")).toBe(pending());
    // Said before any call is spent, too.
    await expect(assertNothingMisstored(store, "ast_spec", without)).rejects.toMatchObject({
      code: "symbols_misstored_pending",
    });
    await assertNothingMisstored(store, "ast_spec", LONDON);
    await assertNothingMisstored(store, "ast_other", without);
  });

  it("refuses to remove the asset while it has them", async () => {
    const store = new MemoryPriceStore();
    store.files.set("symbols.json", pending());
    await expect(removeSymbols(store, "ast_spec")).rejects.toMatchObject({
      code: "symbols_misstored_pending",
      details: { asset_id: "ast_spec", source: "eodhd" },
    });
    await expect(assertNothingMisstored(store, "ast_spec")).rejects.toMatchObject({
      code: "symbols_misstored_pending",
    });
    expect(store.files.get("symbols.json")).toBe(pending());
    // Once purged, both are allowed.
    await purgeMismatched(store, "ast_spec", "eodhd");
    expect(await removeSymbols(store, "ast_spec")).toBe(true);
  });
});

describe("days asked once that the source does not serve stay a hole that is said", () => {
  it("are asked once, then left as a hole that is said, until a close fills them", async () => {
    const store = new MemoryPriceStore();
    store.files.set("symbols.json", newFile({ ...LONDON, currency_check: { eodhd: { at: AT } } }));
    store.files.set(
      "ast_spec.jsonl",
      line("2027-01-04", "1000", "GBX") + line("2027-01-05", "10", "GBP"),
    );
    await purgeMismatched(store, "ast_spec", "eodhd");
    // The source has no close of that day.
    const eodhd = new FakeSource("eodhd", () => closes(["2027-01-05", "10"]), store);
    await run(store, { eodhd });
    const entry = parseSymbols(store.files.get("symbols.json")).assets.ast_spec;
    expect(entry?.refetch_days).toBeUndefined();
    expect(entry?.unserved_days).toEqual({ eodhd: ["2027-01-04"] });
    const read = () =>
      readCloses(
        new Map([["ast_spec", store.files.get("ast_spec.jsonl") ?? ""]]),
        parseSymbols(store.files.get("symbols.json")),
      ).unserved;
    expect(read()).toEqual([{ asset_id: "ast_spec", source: "eodhd", dates: ["2027-01-04"] }]);
    // Asked once: not chased on the next run.
    await run(store, { eodhd });
    expect(eodhd.calls).toHaveLength(1);
    // A close of that day that arrives some other way fills the hole.
    store.files.set(
      "ast_spec.jsonl",
      `${store.files.get("ast_spec.jsonl")}${line("2027-01-04", "9.9", "GBP")}`,
    );
    expect(read()).toEqual([]);
  });
});
