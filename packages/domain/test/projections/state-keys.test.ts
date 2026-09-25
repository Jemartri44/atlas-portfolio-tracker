// The keys of the state **as it is built** (feature 013, review of PR #78):
// the architecture test reads them off the source, and a key the reading of
// the source missed — written with quotes, or any other form — is still here.
// Quotes never enter the state (§6.4 (a) of prompt 013): a new key turns this
// red until somebody adds it here by hand, knowingly.

import { describe, expect, it } from "vitest";
import { createEmptyState } from "../../src/projections/state.js";
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
        "lotCounts",
        "gains",
        "income",
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
