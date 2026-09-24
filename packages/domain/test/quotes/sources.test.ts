import { describe, expect, it } from "vitest";
import { SOURCE_FAILURE_KINDS } from "../../src/ports/price-source.js";
import { isQuoteSource, QUOTE_SOURCES } from "../../src/quotes/sources.js";

describe("the sources of daily closes", () => {
  it("are EODHD then Alpha Vantage, and nothing else", () => {
    expect(QUOTE_SOURCES).toEqual(["eodhd", "alpha_vantage"]);
    expect(isQuoteSource("eodhd")).toBe(true);
    expect(isQuoteSource("coingecko")).toBe(false);
    expect(isQuoteSource(7)).toBe(false);
  });

  it("fail in six ways, each with its own literal", () => {
    expect(new Set(SOURCE_FAILURE_KINDS).size).toBe(6);
  });
});
