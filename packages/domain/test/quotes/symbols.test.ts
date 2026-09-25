import { describe, expect, it } from "vitest";
import {
  currencyAgrees,
  declareSymbols,
  EMPTY_SYMBOLS,
  parseSymbols,
  serializeSymbols,
} from "../../src/quotes/symbols.js";

import { declared } from "./fakes.js";

const AT = "2027-01-01T00:00:00.000Z";

describe("prices/symbols.json", () => {
  it("without a file, is empty; it reads back what it writes", () => {
    expect(parseSymbols(undefined)).toEqual(EMPTY_SYMBOLS);
    const file = {
      symbols_format: 2,
      assets: {
        ast_x: {
          currencies: { eodhd: "GBX", alpha_vantage: "GBX" },
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
        // Format 1, of feature 013: still read, and refused the same way.
      });
    const cases: [string, string][] = [
      ["no", "json"],
      ['{"symbols_format":3,"assets":{}}', "symbols_format"],
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
      [entry({ currency_confirmed_over: { eodhd: "" } }), "a.currency_confirmed_over.eodhd"],
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
      declared("GBX", { eodhd: "CSPX.LSE", alpha_vantage: "CSPX.LON" }),
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
      declared("GBX", { eodhd: "CSPX.LSE" }),
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
      declared("EUR", { eodhd: "X.EUFUND", alpha_vantage: "X" }),
      { eodhd: undefined },
      AT,
      [],
    );
    expect(entry).toEqual({
      currencies: { eodhd: "EUR", alpha_vantage: "EUR" },
      eodhd: "X.EUFUND",
      alpha_vantage: "X",
      confirmed_at: AT,
      currency_check: { eodhd: { at: AT } },
    });
    expect(currencyAgrees(entry, "eodhd")).toBe(true);
    expect(declareSymbols(declared("EUR", {}), {}, AT, []).entry).toEqual({
      currencies: {},
      confirmed_at: AT,
    });
  });

  it("keeps a currency of the source that is not a code, as a disagreement confirmed explicitly", () => {
    const { entry, pending } = declareSymbols(
      declared("GBX", { eodhd: "X.LSE" }),
      { eodhd: "GBp" },
      AT,
      [],
    );
    expect(pending).toEqual([{ source: "eodhd", declared: "GBX", found: "GBp" }]);
    const confirmed = declareSymbols(declared("GBX", { eodhd: "X.LSE" }), { eodhd: "GBp" }, AT, [
      "eodhd",
    ]).entry;
    expect(
      parseSymbols(serializeSymbols({ symbols_format: 2, assets: { a: confirmed } })).assets.a,
    ).toEqual(confirmed);
    expect(currencyAgrees(confirmed, "eodhd")).toBe(true);
    expect(currencyAgrees(entry, "eodhd")).toBe(false);
  });

  it("refuses a declared currency that is not a code", () => {
    expect(() => declareSymbols(declared("euro", { eodhd: "X" }), {}, AT, [])).toThrow(
      expect.objectContaining({ code: "invalid_symbols_file" }),
    );
  });
});
