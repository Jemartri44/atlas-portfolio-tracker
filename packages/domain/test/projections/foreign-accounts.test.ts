// Whether the ledger has, on a date, an account abroad (feature 020, E2; §0
// point 1 and §8.1 B3 of prompt 020, Q3 answered 2026-09-27). The summary
// reserves a row of *Atención* for the 720 and the 721 out of season only
// when there can be something of them to say, and it has to know it on its
// first paint, so this lives in the barrel and not behind the lazy door of
// the informative returns.
//
// Abroad means a country other than `tax_residence` of the settings. Without
// it, the rule the engine applies today: a country other than ES — inside this
// function, never in the web. The catalogue counts from the day each line was
// recorded, as `accountsAt` does (ADR-0016).

import { describe, expect, it } from "vitest";
import { hasForeignAccountsAt } from "../../src/projections/foreign-accounts.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { LedgerBuilder } from "../ledger-builder.js";

const withAccounts = (...countries: string[]): LedgerEvent[] => {
  const b = new LedgerBuilder();
  countries.forEach((country, index) => {
    b.account(`acc_${index}`, { country });
  });
  return b.build();
};

describe("an account abroad on a date", () => {
  it("compares with the tax residence of the settings", () => {
    const events = withAccounts("ES", "IE");
    expect(hasForeignAccountsAt(events, "2029-01-20", { tax_residence: "ES" })).toBe(true);
    // A resident of Ireland: the Irish account is at home, the Spanish one abroad.
    expect(hasForeignAccountsAt(events, "2029-01-20", { tax_residence: "IE" })).toBe(true);
    expect(hasForeignAccountsAt(withAccounts("IE"), "2029-01-20", { tax_residence: "IE" })).toBe(
      false,
    );
  });

  it("with no tax residence, applies the rule of the engine: a country other than ES", () => {
    expect(hasForeignAccountsAt(withAccounts("ES", "ES"), "2029-01-20", {})).toBe(false);
    expect(hasForeignAccountsAt(withAccounts("ES", "IE"), "2029-01-20", {})).toBe(true);
  });

  it("says no without accounts", () => {
    expect(hasForeignAccountsAt([], "2029-01-20", { tax_residence: "ES" })).toBe(false);
  });

  it("reads the catalogue as it stood on the date: from the day each line was recorded", () => {
    const b = new LedgerBuilder();
    b.account("acc_es", { country: "ES" });
    const events = b.build();
    const recorded = events[0] as LedgerEvent & { recorded_at: string };
    // The account moved abroad later: an `account_updated` recorded in 2029.
    const moved = {
      ...recorded,
      id: `${recorded.id}x`,
      type: "account_updated",
      country: "IE",
      recorded_at: "2029-03-01T10:00:00Z",
    } as unknown as LedgerEvent;
    expect(hasForeignAccountsAt([...events, moved], "2029-02-28", { tax_residence: "ES" })).toBe(
      false,
    );
    expect(hasForeignAccountsAt([...events, moved], "2029-03-01", { tax_residence: "ES" })).toBe(
      true,
    );
  });

  it("counts an account from the Madrid day it was recorded, not the UTC one", () => {
    const b = new LedgerBuilder();
    b.account("acc_ib", { country: "IE" });
    const [created] = b.build() as (LedgerEvent & { recorded_at: string })[];
    // 23:30 UTC on 28 February is already 1 March in Madrid.
    const late = { ...created, recorded_at: "2029-02-28T23:30:00Z" } as unknown as LedgerEvent;
    expect(hasForeignAccountsAt([late], "2029-02-28", { tax_residence: "ES" })).toBe(false);
    expect(hasForeignAccountsAt([late], "2029-03-01", { tax_residence: "ES" })).toBe(true);
  });

  it("ignores every other kind of event", () => {
    const b = new LedgerBuilder();
    b.account("acc_es", { country: "ES" });
    b.asset("fund_f");
    b.deposit({ account_id: "acc_es", value_date: "2027-01-04", amount: "100" });
    expect(hasForeignAccountsAt(b.build(), "2029-01-20", { tax_residence: "ES" })).toBe(false);
  });
});
