// The keys of the state **as it is built**: the architecture test reads them
// off the source, and a key the reading of the source missed — written with
// quotes, or any other form — is still here. Quotes never enter the state: a
// new key turns this red until somebody adds it here by hand, knowingly.

import { describe, expect, it } from "vitest";
import {
  cashKey,
  createEmptyState,
  positionKey,
  splitCashKey,
  splitPositionKey,
} from "../../src/projections/state.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";

describe("the keys of the state of the ledger", () => {
  it("are exactly these", () => {
    expect(Object.keys(createEmptyState(DEFAULT_SETTINGS)).sort()).toEqual(
      [
        "accounts",
        "assets",
        "settingsHistory",
        "fiscalSettings",
        "positions",
        "cash",
        "fxRates",
        "acquisitions",
        "lots",
        "lotJournal",
        "eventFacts",
        "lotCounts",
        "gains",
        "currencyLots",
        "currencyLotCounts",
        "currencyGains",
        "currencyJournal",
        "income",
        "externalIncome",
        "inKindIncome",
        "valuations",
        "orders",
        "transferRequests",
        "theses",
        "filings",
        "fingerprintWaivers",
        "reversed",
        "warnings",
        "invalid",
        "fingerprints",
        "positionOf",
        "usage",
      ].sort(),
    );
  });
});

describe("the key of a position or a balance", () => {
  it("is the plain `account|other` for ordinary ids", () => {
    expect(positionKey("acc_a", "ast_x")).toBe("acc_a|ast_x");
    expect(cashKey("acc_a", "EUR")).toBe("acc_a|EUR");
  });

  it("does not mix an id that contains the separator with its neighbour", () => {
    const first = positionKey("A|B", "F");
    const second = positionKey("A", "B|F");
    expect(first).not.toBe(second);
    expect(splitPositionKey(first)).toEqual(["A|B", "F"]);
    expect(splitPositionKey(second)).toEqual(["A", "B|F"]);
    expect(splitCashKey(cashKey("100%|x", "USD"))).toEqual(["100%|x", "USD"]);
    expect(splitPositionKey(positionKey("a%7Cb", "c"))).toEqual(["a%7Cb", "c"]);
  });
});
