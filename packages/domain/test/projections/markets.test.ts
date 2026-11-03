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
    ["ASML on Nasdaq", { market: "XNAS", currency: "USD", isin: "NL0010273215" }, false],
    ["a share on a Nasdaq tier", { market: "Nasdaq GS", currency: "USD" }, false],
    ["a share on a market Atlas does not know", { market: "XXXX", currency: "EUR" }, undefined],
    ["a share with no market", { currency: "EUR", isin: "DE0007236101" }, undefined],
  ])("%s", (_name, asset, expected) => {
    expect(euRegulatedAdmission(asset)).toBe(expected);
  });
});
