import { describe, expect, it } from "vitest";
import {
  currencyAgrees,
  declareSymbols,
  EMPTY_SYMBOLS,
  parseSymbols,
  serializeSymbols,
} from "../../src/quotes/symbols.js";

const AT = "2027-01-01T00:00:00.000Z";

describe("prices/symbols.json", () => {
  it("without a file, is empty; it reads back what it writes", () => {
    expect(parseSymbols(undefined)).toEqual(EMPTY_SYMBOLS);
    const file = {
      symbols_format: 1,
      assets: {
        ast_x: {
          currency: "GBX",
          eodhd: "CSPX.LSE",
          alpha_vantage: "CSPX.LON",
          confirmed_at: AT,
          currency_check: { eodhd: { found: "GBP", at: AT }, alpha_vantage: { at: AT } },
          currency_confirmed_over: { eodhd: "GBP" },
        },
      },
    };
    expect(parseSymbols(serializeSymbols(file))).toEqual(file);
  });

  it("refuses what it does not understand, naming it", () => {
    const entry = (extra: object) =>
      JSON.stringify({
        symbols_format: 1,
        assets: { a: { currency: "EUR", confirmed_at: AT, ...extra } },
      });
    const cases: [string, string][] = [
      ["no", "json"],
      ['{"symbols_format":2,"assets":{}}', "symbols_format"],
      ['{"symbols_format":1,"assets":[]}', "symbols_format"],
      ['{"symbols_format":1,"assets":{"a":1}}', "a"],
      [entry({ coingecko: "bitcoin" }), "a.coingecko"],
      [entry({ currency: "eur" }), "a.currency"],
      [entry({ confirmed_at: 1 }), "a.confirmed_at"],
      [entry({ eodhd: " " }), "a.eodhd"],
      [entry({ alpha_vantage: 3 }), "a.alpha_vantage"],
      [entry({ currency_check: [] }), "a.currency_check"],
      [entry({ currency_check: { yahoo: { at: AT } } }), "a.currency_check.yahoo"],
      [entry({ currency_check: { eodhd: { at: 1 } } }), "a.currency_check.eodhd"],
      [entry({ currency_check: { eodhd: { at: AT, found: 1 } } }), "a.currency_check.eodhd"],
      [entry({ currency_check: { eodhd: { at: AT, url: "x" } } }), "a.currency_check.eodhd"],
      [entry({ currency_confirmed_over: { eodhd: "gbp" } }), "a.currency_confirmed_over.eodhd"],
    ];
    for (const [text, field] of cases) {
      expect(() => parseSymbols(text), text).toThrow(
        expect.objectContaining({ code: "invalid_symbols_file", details: { field } }),
      );
    }
  });
});

describe("the declared currency (D-Q2)", () => {
  it("is never assumed: a disagreement of the metadata is pending until confirmed", () => {
    const { entry, pending } = declareSymbols(
      { currency: "GBX", eodhd: "CSPX.LSE", alpha_vantage: "CSPX.LON" },
      { eodhd: "GBP", alpha_vantage: "GBX" },
      AT,
      [],
    );
    expect(pending).toEqual([{ source: "eodhd", declared: "GBX", found: "GBP" }]);
    expect(currencyAgrees(entry, "eodhd")).toBe(false);
    expect(currencyAgrees(entry, "alpha_vantage")).toBe(true);
  });

  it("keeps an explicit confirmation over exactly what the source said", () => {
    const { entry, pending } = declareSymbols(
      { currency: "GBX", eodhd: "CSPX.LSE" },
      { eodhd: "GBP" },
      AT,
      ["eodhd"],
    );
    expect(pending).toEqual([]);
    expect(entry.currency_confirmed_over).toEqual({ eodhd: "GBP" });
    expect(currencyAgrees(entry, "eodhd")).toBe(true);
    // If the source later says something else, the old confirmation does not cover it.
    expect(
      currencyAgrees({ ...entry, currency_check: { eodhd: { found: "USD", at: AT } } }, "eodhd"),
    ).toBe(false);
  });

  it("records metadata that say nothing, and leaves unchecked what was not asked", () => {
    const { entry } = declareSymbols(
      { currency: "EUR", eodhd: "X.EUFUND", alpha_vantage: "X" },
      { eodhd: undefined },
      AT,
      [],
    );
    expect(entry).toEqual({
      currency: "EUR",
      eodhd: "X.EUFUND",
      alpha_vantage: "X",
      confirmed_at: AT,
      currency_check: { eodhd: { at: AT } },
    });
    expect(currencyAgrees(entry, "eodhd")).toBe(true);
    expect(declareSymbols({ currency: "EUR" }, {}, AT, []).entry).toEqual({
      currency: "EUR",
      confirmed_at: AT,
    });
  });

  it("refuses a declared currency that is not a code", () => {
    expect(() => declareSymbols({ currency: "euro" }, {}, AT, [])).toThrow(
      expect.objectContaining({ code: "invalid_symbols_file" }),
    );
  });
});
