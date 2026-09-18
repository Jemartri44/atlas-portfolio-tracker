import { describe, expect, it } from "vitest";
import { movedFiscalYears } from "../../src/projections/settings-impact.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

/**
 * The 30th of December sold, settled on the 2nd of January: by trade date the
 * gain is of 2027, by value date it is of 2028. Changing the rule moves it, and
 * a return already filed stops matching (prompt 005 §3.5 bis).
 */
const straddling = () => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "10",
    unit_price: "10",
    trade_date: "2027-01-10",
    value_date: "2027-01-12",
  });
  b.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "10",
    unit_price: "13",
    trade_date: "2027-12-30",
    value_date: "2028-01-02",
  });
  return b.build();
};

const byValueDate = DEFAULT_SETTINGS;
const byTradeDate = mergeSettings(DEFAULT_SETTINGS, {
  fiscal_date_rule: { fund: "trade_date" },
});

describe("movedFiscalYears", () => {
  it("lists the years whose realized gains change, with both figures", () => {
    const moved = movedFiscalYears(straddling(), byValueDate, byTradeDate, 2029);
    expect(moved).toHaveLength(2);
    expect(moved[0]).toMatchObject({ year: 2027 });
    expect(moved[0]?.before.amount.toString()).toBe("0");
    expect(moved[0]?.after.amount.toString()).toBe("30");
    expect(moved[1]).toMatchObject({ year: 2028 });
    expect(moved[1]?.before.amount.toString()).toBe("30");
    expect(moved[1]?.after.amount.toString()).toBe("0");
  });

  it("says nothing about the year in course: nothing has been filed yet", () => {
    // Standing in 2028, the gain that moves from 2028 to 2027 still warns about
    // 2027, which is over; asked from 2027, neither year is past.
    expect(movedFiscalYears(straddling(), byValueDate, byTradeDate, 2028)).toHaveLength(1);
    expect(movedFiscalYears(straddling(), byValueDate, byTradeDate, 2027)).toEqual([]);
  });

  it("says nothing when the change touches no fiscal rule", () => {
    const louder = mergeSettings(DEFAULT_SETTINGS, { deviation_threshold_pp: "3" });
    expect(movedFiscalYears(straddling(), byValueDate, louder, 2029)).toEqual([]);
  });

  it("says nothing on a ledger with no sales", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
    expect(movedFiscalYears(b.build(), byValueDate, byTradeDate, 2029)).toEqual([]);
  });
});
