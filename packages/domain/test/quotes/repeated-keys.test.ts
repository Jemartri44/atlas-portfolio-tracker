// Round 2 of the review of PR #106, R2-B1: `JSON.parse` keeps the last of two
// equal keys without a word, so a file can say one thing to the reader of the
// cloud and another to a person, and `atlas admin prices push` would upload
// bytes the difference never shows. Every JSON of `prices/` read strictly in
// the cloud or by `push` refuses a key twice, at any level, naming the key
// and never its value.

import { describe, expect, it } from "vitest";
import { DomainError } from "../../src/errors.js";
import { parsePriceConfig } from "../../src/quotes/config.js";
import { encodeCloseLine, readCloseFile } from "../../src/quotes/line.js";
import { EMPTY_STATUS, parseStatus, serializeStatus } from "../../src/quotes/status.js";
import { parseSymbols, serializeSymbols, unservableSymbols } from "../../src/quotes/symbols.js";
import { symbolsPushPlan } from "../../src/quotes/symbols-push.js";
import { repeatedKey } from "../../src/schema/json-keys.js";

const SENTINEL = "sentinel-secret-of-the-repeated-key";
const AT = "2026-09-01T00:00:00.000Z";

const entry = `{"eodhd":"AAA.XETRA","currencies":{"eodhd":"EUR"},"confirmed_at":"${AT}"}`;
const assets = `{"ast_a":${entry}}`;

/** What a refusal says, and that it never carries the sentinel. */
const refusal = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) {
      expect(JSON.stringify(error.details)).not.toContain(SENTINEL);
      expect(error.message).not.toContain(SENTINEL);
      return { code: error.code, details: error.details };
    }
    throw error;
  }
  throw new Error("no refusal");
};

describe("a key twice in a JSON of prices/ (review of PR #106, R2-B1)", () => {
  it("names the repeated key, at any level, and nothing when there is none", () => {
    expect(repeatedKey('{"a":1,"b":{"c":1,"c":2}}')).toBe("c");
    expect(repeatedKey('{"a":1,"\\u0061":2}')).toBe("a");
    expect(repeatedKey('[{"a":1},{"a":2}]')).toBeUndefined();
    expect(repeatedKey(`{"${"k".repeat(100)}":1,"${"k".repeat(100)}":2}`)).toBe("k".repeat(64));
    expect(repeatedKey('{"a":"\\"a\\"","b":1}')).toBeUndefined();
  });

  it.each([
    [
      "assets twice",
      `{"symbols_format":2,"assets":{"LEAK":{"note":"${SENTINEL}"}},"assets":${assets}}`,
      "assets",
    ],
    [
      "symbols_format twice",
      `{"symbols_format":"${SENTINEL}","symbols_format":2,"assets":${assets}}`,
      "symbols_format",
    ],
    [
      "assets escaped",
      `{"symbols_format":2,"assets":{"LEAK":"${SENTINEL}"},"\\u0061ssets":${assets}}`,
      "assets",
    ],
    [
      "a field twice inside an entry",
      `{"symbols_format":2,"assets":{"ast_a":{"eodhd":"${SENTINEL}","currencies":{"eodhd":"EUR"},"confirmed_at":"${AT}","eodhd":"AAA.XETRA"}}}`,
      "eodhd",
    ],
  ])("refuses symbols.json with %s, in the reader and in push", (_case, text, key) => {
    const expected = {
      code: "json_key_repeated",
      details: { file: "prices/symbols.json", key },
    };
    expect(refusal(() => parseSymbols(text))).toEqual(expected);
    const remote = serializeSymbols(parseSymbols(`{"symbols_format":2,"assets":${assets}}`));
    expect(refusal(() => symbolsPushPlan(text, remote))).toEqual(expected);
    expect(unservableSymbols(text)).toBe("repeated_key");
    // A remote like that is one it cannot read, and it is replaced, saying so.
    expect(symbolsPushPlan(remote, text)).toMatchObject({ remote: "unreadable" });
  });

  it("says why a symbols.json is never served, and serves the rest", () => {
    expect(unservableSymbols(`{"symbols_format":2,"assets":${assets}}`)).toBeUndefined();
    expect(unservableSymbols("{")).toBeUndefined();
    expect(unservableSymbols(`{"symbols_format":2,"assets":{},"k":"${SENTINEL}"}`)).toBe(
      "unknown_key",
    );
  });

  it("refuses config.json, _status.json and a line of closes with a key twice", () => {
    expect(
      refusal(() => parsePriceConfig(`{"failure_threshold":3,"failure_threshold":4}`)),
    ).toEqual({
      code: "json_key_repeated",
      details: { file: "prices/config.json", key: "failure_threshold" },
    });
    const status = serializeStatus(EMPTY_STATUS).replace(
      '"sources"',
      `"assets":{"x":"${SENTINEL}"},"sources"`,
    );
    expect(refusal(() => parseStatus(status))).toEqual({
      code: "json_key_repeated",
      details: { file: "prices/_status.json", key: "assets" },
    });
    const good = encodeCloseLine({
      schema_version: 1,
      date: "2027-01-04",
      close: "101.5",
      currency: "EUR",
      source: "eodhd",
      fetched_at: "2027-01-05T06:00:00.000Z",
    });
    const twice = good.replace('"close":"101.5"', `"close":"${SENTINEL}","close":"101.5"`);
    expect(twice).not.toBe(good);
    expect(refusal(() => readCloseFile("ast_x", `${good}\n${twice}\n`))).toEqual({
      code: "json_key_repeated",
      details: { file: "prices/ast_x.jsonl", line: 2, key: "close" },
    });
  });
});
