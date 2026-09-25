// The adapters of the sources of prices (feature 013, block 3): each answer
// and each status of its source translated to one of the six failures, one to
// one, with synthetic answers in the **real format** (`tests/fixtures/eodhd/`
// and `tests/fixtures/alpha-vantage/`). No test touches the network: `fetch`
// is a double. And the sentinel key never comes out of anything.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AlphaVantagePriceSource } from "../src/prices/alpha-vantage.js";
import { EodhdPriceSource } from "../src/prices/eodhd.js";
import { ExactJsonUnsupported, JsonNumber, parseExactJson } from "../src/prices/exact-json.js";

const KEY = "TEST-KEY-013";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures");
const fixture = (source: string, name: string): string =>
  readFileSync(join(root, source, name), "utf8");

/** A `fetch` that answers one status and body, and records the addresses asked. */
const answering = (status: number, body: string) => {
  const urls: string[] = [];
  const fetchUrl = async (url: string) => {
    urls.push(url);
    return new Response(body, { status });
  };
  return { urls, fetchUrl };
};

/** A `fetch` that fails the way Node's does, quoting the address with the key in it. */
const failing = async (url: string): Promise<Response> => {
  throw new TypeError(`fetch failed: ${url}`);
};

/** Nothing that comes out of an adapter may contain the key. */
const keyless = (value: unknown) => expect(JSON.stringify(value)).not.toContain(KEY);

describe("exact JSON numbers (D-Q1)", () => {
  it("keeps the text of every number, beyond what a double holds", () => {
    const parsed = parseExactJson('{"a":123.4567890123456789,"b":"x","c":[1e3]}') as Record<
      string,
      unknown
    >;
    expect(parsed.a).toEqual(new JsonNumber("123.4567890123456789"));
    expect(parsed.b).toBe("x");
    expect(parsed.c).toEqual([new JsonNumber("1e3")]);
  });

  it("stops with an error of its own where the runtime cannot give the text, never a float", () => {
    // A JSON.parse of a runtime without `context.source`.
    const old = (text: string, reviver: (key: string, value: unknown) => unknown) =>
      JSON.parse(text, (key, value) => reviver(key, value));
    expect(() => parseExactJson('{"close":1.5}', old as never)).toThrow(ExactJsonUnsupported);
    expect(parseExactJson('{"close":"1.5"}', old as never)).toEqual({ close: "1.5" });
  });
});

describe("EODHD where a number cannot be read by its text (D-Q1)", () => {
  const old = ((text: string, reviver: (key: string, value: unknown) => unknown) =>
    JSON.parse(text, (key, value) => reviver(key, value))) as never;

  it("says it before anything, and never reads a close as a float", async () => {
    const { urls, fetchUrl } = answering(200, fixture("eodhd", "eod-synth.json"));
    const source = new EodhdPriceSource(KEY, fetchUrl, old);
    expect(() => source.ready()).toThrow(ExactJsonUnsupported);
    await expect(source.dailyCloses("X", "2027-01-04", "2027-01-06")).rejects.toThrow(
      ExactJsonUnsupported,
    );
    expect(urls).toHaveLength(1);
    expect(() => new EodhdPriceSource(KEY, fetchUrl).ready()).not.toThrow();
  });
});

describe("EODHD", () => {
  it("reads the closes as traded, as the exact text of their number", async () => {
    const { urls, fetchUrl } = answering(200, fixture("eodhd", "eod-synth.json"));
    const result = await new EodhdPriceSource(KEY, fetchUrl).dailyCloses(
      "SYNTH.XETRA",
      "2027-01-04",
      "2027-01-06",
    );
    expect(result).toEqual({
      ok: true,
      value: [
        { date: "2027-01-04", close: "100.5" },
        { date: "2027-01-05", close: "101.25" },
        { date: "2027-01-06", close: "102" },
      ],
    });
    expect(urls).toEqual([
      `https://eodhd.com/api/eod/SYNTH.XETRA?api_token=${KEY}&fmt=json&from=2027-01-04&to=2027-01-06`,
    ]);
    const long = await new EodhdPriceSource(
      KEY,
      answering(200, fixture("eodhd", "eod-long.json")).fetchUrl,
    ).dailyCloses("X", "2027-01-06", "2027-01-06");
    expect(long).toEqual({
      ok: true,
      value: [{ date: "2027-01-06", close: "123.4567890123456789" }],
    });
  });

  it("an empty answer is not a failure: nothing new", async () => {
    const source = new EodhdPriceSource(
      KEY,
      answering(200, fixture("eodhd", "eod-empty.json")).fetchUrl,
    );
    expect(await source.dailyCloses("X", "2027-01-06", "2027-01-06")).toEqual({
      ok: true,
      value: [],
    });
  });

  it("translates each status to its kind, one to one, without the key", async () => {
    const cases: [number, string, string][] = [
      [401, "error-401.txt", "blocked"],
      [402, "error-402.txt", "rate_limited"],
      [403, "error-403.txt", "not_found"],
      [404, "error-404.txt", "not_found"],
      [429, "error-402.txt", "rate_limited"],
      [500, "error-404.txt", "unavailable"],
      [503, "error-404.txt", "unavailable"],
      [418, "error-404.txt", "invalid_response"],
    ];
    for (const [status, body, kind] of cases) {
      const result = await new EodhdPriceSource(
        KEY,
        answering(status, fixture("eodhd", body)).fetchUrl,
      ).dailyCloses("X", "2027-01-06", "2027-01-06");
      expect(result, String(status)).toEqual({ ok: false, kind });
      keyless(result);
    }
  });

  it("never takes what it does not understand for a price", async () => {
    for (const name of [
      "eod-not-an-array.json",
      "eod-bad-close.json",
      "eod-bad-date.json",
      "eod-zero-close.json",
    ]) {
      const result = await new EodhdPriceSource(
        KEY,
        answering(200, fixture("eodhd", name)).fetchUrl,
      ).dailyCloses("X", "2027-01-06", "2027-01-06");
      expect(result, name).toEqual({ ok: false, kind: "invalid_response" });
    }
    const html = await new EodhdPriceSource(KEY, answering(200, "<html>").fetchUrl).dailyCloses(
      "X",
      "2027-01-06",
      "2027-01-06",
    );
    expect(html).toEqual({ ok: false, kind: "invalid_response" });
    const nulls = await new EodhdPriceSource(KEY, answering(200, "[null]").fetchUrl).dailyCloses(
      "X",
      "2027-01-06",
      "2027-01-06",
    );
    expect(nulls).toEqual({ ok: false, kind: "invalid_response" });
  });

  it("drops the error of fetch unread: it quotes the address, and the key in it", async () => {
    const result = await new EodhdPriceSource(KEY, failing).dailyCloses(
      "X",
      "2027-01-06",
      "2027-01-06",
    );
    expect(result).toEqual({ ok: false, kind: "unavailable" });
    keyless(result);
  });

  it("reads the currency of a listing from the list of its exchange", async () => {
    const { urls, fetchUrl } = answering(200, fixture("eodhd", "symbols-synth.json"));
    const source = new EodhdPriceSource(KEY, fetchUrl);
    expect(await source.currencyOf("SYNTH.XETRA")).toEqual({ ok: true, value: "EUR" });
    expect(urls[0]).toBe(
      `https://eodhd.com/api/exchange-symbol-list/XETRA?api_token=${KEY}&fmt=json&symbols=SYNTH`,
    );
    // Without a suffix, the exchange is US.
    await source.currencyOf("SYNTH");
    expect(urls[1]).toContain("/exchange-symbol-list/US?");
    const unknown = new EodhdPriceSource(
      KEY,
      answering(200, fixture("eodhd", "symbols-unknown-currency.json")).fetchUrl,
    );
    expect(await unknown.currencyOf("SYNTH.XETRA")).toEqual({ ok: true, value: undefined });
    expect(await source.currencyOf("OTHER.XETRA")).toEqual({ ok: true, value: undefined });
    const refused = new EodhdPriceSource(KEY, answering(401, "Unauthenticated").fetchUrl);
    expect(await refused.currencyOf("SYNTH.XETRA")).toEqual({ ok: false, kind: "blocked" });
    const odd = new EodhdPriceSource(KEY, answering(200, "{}").fetchUrl);
    expect(await odd.currencyOf("SYNTH.XETRA")).toEqual({ ok: false, kind: "invalid_response" });
  });
});

describe("Alpha Vantage", () => {
  it("reads the closes of the window, oldest first, as their text", async () => {
    const { urls, fetchUrl } = answering(200, fixture("alpha-vantage", "daily-synth.json"));
    const result = await new AlphaVantagePriceSource(KEY, fetchUrl).dailyCloses(
      "SYNTH.DEX",
      "2027-01-05",
      "2027-01-06",
    );
    expect(result).toEqual({
      ok: true,
      value: [
        { date: "2027-01-05", close: "101.2500" },
        { date: "2027-01-06", close: "102.0000" },
      ],
    });
    expect(urls).toEqual([
      `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=SYNTH.DEX&outputsize=compact&apikey=${KEY}`,
    ]);
  });

  it("tells failure from success by the key of the body, all of them with HTTP 200 (D-Q4)", async () => {
    const cases: [string, string][] = [
      ["error-apikey.json", "blocked"],
      ["error-call.json", "not_found"],
      ["information-limit.json", "rate_limited"],
      ["note-limit.json", "rate_limited"],
      ["unexpected.json", "invalid_response"],
      ["daily-bad-close.json", "invalid_response"],
    ];
    for (const [name, kind] of cases) {
      const result = await new AlphaVantagePriceSource(
        KEY,
        answering(200, fixture("alpha-vantage", name)).fetchUrl,
      ).dailyCloses("X", "2027-01-01", "2027-01-06");
      expect(result, name).toEqual({ ok: false, kind });
      keyless(result);
    }
    for (const [status, body, kind] of [
      [200, "not json", "invalid_response"],
      [200, "[]", "invalid_response"],
      [429, "{}", "rate_limited"],
      [502, "{}", "unavailable"],
      [404, "{}", "invalid_response"],
    ] as const) {
      const result = await new AlphaVantagePriceSource(
        KEY,
        answering(status, body).fetchUrl,
      ).dailyCloses("X", "2027-01-01", "2027-01-06");
      expect(result, `${status} ${body}`).toEqual({ ok: false, kind });
    }
    expect(
      await new AlphaVantagePriceSource(KEY, failing).dailyCloses("X", "2027-01-01", "2027-01-06"),
    ).toEqual({
      ok: false,
      kind: "unavailable",
    });
  });

  it("reads the currency of the exact symbol from the search", async () => {
    const { urls, fetchUrl } = answering(200, fixture("alpha-vantage", "search-synth.json"));
    const source = new AlphaVantagePriceSource(KEY, fetchUrl);
    expect(await source.currencyOf("SYNTH.LON")).toEqual({ ok: true, value: "GBX" });
    expect(urls[0]).toBe(
      `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=SYNTH.LON&apikey=${KEY}`,
    );
    expect(await source.currencyOf("NOPE")).toEqual({ ok: true, value: undefined });
    const empty = new AlphaVantagePriceSource(KEY, answering(200, '{"bestMatches":{}}').fetchUrl);
    expect(await empty.currencyOf("X")).toEqual({ ok: true, value: undefined });
    const limited = new AlphaVantagePriceSource(
      KEY,
      answering(200, fixture("alpha-vantage", "information-limit.json")).fetchUrl,
    );
    expect(await limited.currencyOf("X")).toEqual({ ok: false, kind: "rate_limited" });
  });
});
