// The adapters of the sources of prices: each answer and each status of its source translated
// to one of the six failures, one to one, with synthetic answers in the **real format**
// (`tests/fixtures/eodhd/`). No test touches the network:
// `fetch` is a double. And the sentinel key never comes out of anything.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EodhdPriceSource } from "../src/prices/eodhd.js";
import { ExactJsonUnsupported, JsonNumber, parseExactJson } from "../src/prices/exact-json.js";
import { ask, MAX_ANSWER_BYTES } from "../src/prices/fetch.js";

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

describe("what a source may answer, in bytes (audit of 03/11, finding 11)", () => {
  const streamOf = (chunks: number, size: number, headers: Record<string, string> = {}) =>
    new Response(
      new ReadableStream({
        pull(controller) {
          if (chunks === 0) {
            controller.close();
            return;
          }
          chunks -= 1;
          controller.enqueue(new Uint8Array(size).fill(97));
        },
      }),
      { status: 200, headers },
    );

  it("reads an answer up to the bound and gives up on one that goes past it, even with no length", async () => {
    const small = await ask(async () => new Response("[]"), "u");
    expect(small).toEqual({ status: 200, text: "[]" });
    const atBound = await ask(async () => streamOf(4, MAX_ANSWER_BYTES / 4), "u");
    expect(atBound?.text.length).toBe(MAX_ANSWER_BYTES);
    const over = await ask(async () => streamOf(5, MAX_ANSWER_BYTES / 4), "u");
    expect(over).toBeUndefined();
    const declared = await ask(
      async () => streamOf(1, 10, { "content-length": String(MAX_ANSWER_BYTES + 1) }),
      "u",
    );
    expect(declared).toBeUndefined();
  });

  it("keeps a source that answers too much as unavailable, never as a price", async () => {
    const result = await new EodhdPriceSource(KEY, async () =>
      streamOf(5, MAX_ANSWER_BYTES / 4),
    ).dailyCloses("X", "2027-01-06", "2027-01-06");
    expect(result).toEqual({ ok: false, kind: "unavailable" });
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

describe("a currency of the source that is not a code (D-Q2)", () => {
  it("is a disagreement to confirm, never the silence of a source that says nothing", async () => {
    const eodhd = new EodhdPriceSource(
      KEY,
      answering(200, '[{"Code":"SYNTH","Currency":"GBp"}]').fetchUrl,
    );
    expect(await eodhd.currencyOf("SYNTH.LSE")).toEqual({ ok: true, value: "GBp" });
    const unknown = new EodhdPriceSource(
      KEY,
      answering(200, '[{"Code":"SYNTH","Currency":"Unknown"}]').fetchUrl,
    );
    expect(await unknown.currencyOf("SYNTH.LSE")).toEqual({ ok: true, value: undefined });
  });
});
