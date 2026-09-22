// When the fiscal card of the summary goes to the top (feature 010, blocks 3
// and 4; prompt P1, question Q11).
//
// Two independent triggers and not one: the income tax season **or** something
// of the 720 or the 721 to do. The deadline of the 720 is January to March,
// outside the income tax season altogether, so a strict "and" would never raise
// the card for it — and January is exactly when the valuations at 31 December
// are missing, which is when "cannot be determined" has to count as something
// to do.

import { describe, expect, it } from "vitest";
import { fiscalAttention } from "../../src/informative/attention.js";
import type { Settings } from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { HAND_SETTINGS } from "../tax/helpers.js";

const SETTINGS: Settings = {
  ...HAND_SETTINGS,
  model_720_threshold_eur: "50000",
  model_720_increase_eur: "20000",
  model_720_alert_threshold_eur: "45000",
  model_721_threshold_eur: "50000",
  model_721_increase_eur: "20000",
  model_721_alert_threshold_eur: "45000",
  renta_season_start: "04-01",
  renta_season_end: "06-30",
};

/** A ledger with nothing abroad: the machinery of the models never runs. */
const domestic = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  b.settings(SETTINGS);
  b.account("acc_es");
  b.asset("fund_f");
  b.deposit({ account_id: "acc_es", value_date: "2027-01-04", amount: "100000" });
  b.buy({
    account_id: "acc_es",
    asset_id: "fund_f",
    value_date: "2027-01-05",
    quantity: "100",
    unit_price: "100",
  });
  return b;
};

/** Securities abroad and no valuation at 31 December: the January case. */
const abroad = (valued: boolean): LedgerBuilder => {
  const b = new LedgerBuilder();
  b.settings(SETTINGS);
  b.account("acc_ib", { platform: "ibkr", country: "IE" });
  b.asset("etf_a", { asset_type: "etf", transferable: false });
  // Just enough cash to buy: the accounts of this ledger never oblige, so what
  // the card says is about the securities alone.
  b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "10100" });
  b.buy({
    account_id: "acc_ib",
    asset_id: "etf_a",
    value_date: "2027-01-05",
    quantity: "100",
    unit_price: "100",
  });
  if (valued) {
    b.valuation({
      account_id: "acc_ib",
      asset_id: "etf_a",
      date: "2027-12-31",
      quantity: "100",
      unit_value: "100",
    });
  }
  return b;
};

describe("the income tax season", () => {
  it("is the four edges of the dates the user configured, both included", () => {
    const events = domestic().build();
    const seasonOn = (today: string) => fiscalAttention(events, today).season;
    expect(seasonOn("2028-03-31")).toBe(false);
    expect(seasonOn("2028-04-01")).toBe(true);
    expect(seasonOn("2028-06-30")).toBe(true);
    expect(seasonOn("2028-07-01")).toBe(false);
  });

  it("raises the card in season and lets it go quiet out of it", () => {
    const events = domestic().build();
    expect(fiscalAttention(events, "2028-05-01").prominent).toBe(true);
    expect(fiscalAttention(events, "2028-09-01").prominent).toBe(false);
  });

  it("says which past years have no income tax return recorded", () => {
    const b = domestic();
    b.sell({
      account_id: "acc_es",
      asset_id: "fund_f",
      value_date: "2027-06-01",
      quantity: "100",
      unit_price: "120",
    });
    expect(fiscalAttention(b.build(), "2028-09-01").unfiled_years).toEqual([2027]);
  });
});

describe("something of the informative returns to do", () => {
  it("raises the card in January when there is nothing to value it with", () => {
    // Out of season, and with securities abroad that cannot be valued: the
    // verdict is "cannot be determined" and that **is** something to do.
    const attention = fiscalAttention(abroad(false).build(), "2028-01-20");
    expect(attention.season).toBe(false);
    expect(attention.todo).toEqual([
      { model: "720", year: 2027, category: "securities", reason: "undetermined" },
    ]);
    expect(attention.prominent).toBe(true);
  });

  it("stays quiet when everything abroad is valued and below the threshold", () => {
    const attention = fiscalAttention(abroad(true).build(), "2028-01-20");
    expect(attention.todo).toEqual([]);
    expect(attention.prominent).toBe(false);
  });

  it("never runs the machinery of the models without an account abroad", () => {
    // A ledger with everything in Spain has nothing either model could ask
    // for, and the card has no business projecting it four more times.
    const attention = fiscalAttention(domestic().build(), "2028-01-20");
    expect(attention.todo).toEqual([]);
    expect(attention.prominent).toBe(false);
  });

  it("asks for the return when the threshold is passed and nothing is filed", () => {
    const b = abroad(false);
    b.valuation({
      account_id: "acc_ib",
      asset_id: "etf_a",
      date: "2027-12-31",
      quantity: "100",
      unit_value: "600",
    });
    const attention = fiscalAttention(b.build(), "2028-01-20");
    expect(attention.todo).toEqual([
      { model: "720", year: 2027, category: "securities", reason: "file" },
    ]);
    expect(attention.prominent).toBe(true);
  });

  it("stops asking once the return of that year is recorded", () => {
    const b = abroad(false);
    b.valuation({
      account_id: "acc_ib",
      asset_id: "etf_a",
      date: "2027-12-31",
      quantity: "100",
      unit_value: "600",
    });
    b.filed({
      model: "720",
      tax_year: 2027,
      filed_at: "2028-01-15",
      declared: {
        securities: { value_eur: "60000.00" },
        items: [
          {
            category: "securities",
            account_id: "acc_ib",
            asset_id: "etf_a",
            value_eur: "60000.00",
          },
        ],
      },
    });
    expect(fiscalAttention(b.build(), "2028-01-20").todo).toEqual([]);
  });

  it("warns before the threshold, at the amount the user set", () => {
    const b = abroad(false);
    b.valuation({
      account_id: "acc_ib",
      asset_id: "etf_a",
      date: "2027-12-31",
      quantity: "100",
      unit_value: "460",
    });
    expect(fiscalAttention(b.build(), "2028-01-20").todo).toEqual([
      { model: "720", year: 2027, category: "securities", reason: "alert" },
    ]);
  });
});
