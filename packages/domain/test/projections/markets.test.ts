// The law looks at where the security is admitted, not where it was bought
// (art. 25.1.e LIRPF; help of the Modelo 100 of 2025, key 2).

import { describe, expect, it } from "vitest";
import { euRegulatedAdmission } from "../../src/projections/markets.js";

describe("euRegulatedAdmission", () => {
  it.each([
    ["a Spanish share on Madrid", { market: "XMAD", currency: "EUR" }, true],
    ["Siemens on Xetra", { market: "XETR", currency: "EUR", isin: "DE0007236101" }, true],
    [
      "a US share on Xetra, in euros",
      { market: "XETR", currency: "EUR", isin: "US0378331005" },
      undefined,
    ],
    ["a share on Xetra with no ISIN", { market: "xetra", currency: "EUR" }, undefined],
    [
      "a German share on Frankfurt in dollars",
      { market: "XFRA", currency: "USD", isin: "DE0007236101" },
      undefined,
    ],
    [
      "an international ISIN on Euronext",
      { market: "EURONEXT", currency: "EUR", isin: "XS0000000001" },
      undefined,
    ],
    // XDUB and XMIL are the whole exchange in ISO 10383, Euronext Growth included.
    ["Enel on Milan", { market: "XMIL", currency: "EUR", isin: "IT0003128367" }, true],
    [
      "a US share on Milan, in euros",
      { market: "XMIL", currency: "EUR", isin: "US0378331005" },
      undefined,
    ],
    ["a share on Dublin with no ISIN", { market: "XDUB", currency: "EUR" }, undefined],
    // The regulated segment, written, decides whatever the ISIN.
    [
      "a US share on Euronext Milan",
      { market: "MTAA", currency: "EUR", isin: "US0378331005" },
      true,
    ],
    ["a share on Euronext Dublin", { market: "XMSM", currency: "EUR" }, true],
    ["a share on the Mercado Continuo", { market: "XMCE", currency: "EUR" }, true],
    ["ASML on Nasdaq", { market: "XNAS", currency: "USD", isin: "NL0010273215" }, false],
    ["a share on a Nasdaq tier", { market: "Nasdaq GS", currency: "USD" }, false],
    ["a share on a market Atlas does not know", { market: "XXXX", currency: "EUR" }, undefined],
    ["a share with no market", { currency: "EUR", isin: "DE0007236101" }, undefined],
  ])("%s", (_name, asset, expected) => {
    expect(euRegulatedAdmission(asset)).toBe(expected);
  });
});
