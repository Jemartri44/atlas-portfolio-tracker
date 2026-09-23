// The Modelo 721 (feature 010, block 3; decision (j) and prompt P6).
//
// The same machinery as the 720 with a single category, because with this
// portfolio —crypto through an ETP— it will be zero almost always and does not
// deserve more code than that. What it has of its own is what it counts: crypto
// held **directly** and kept abroad, and an ETP is a security of the 720 and
// never of this one.
//
// The ledger cannot tell a foreign custodian from self-custody, so everything
// in an account whose country is not Spain counts and the output says so:
// over-declaring an informative return is the prudent direction.

import { describe, expect, it } from "vitest";
import { model720, model721 } from "../../src/informative/m721.js";
import type { InformativeCategory, InformativeReturn } from "../../src/informative/report.js";
import type { Settings } from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { HAND_SETTINGS } from "../tax/helpers.js";

const SETTINGS: Settings = {
  ...HAND_SETTINGS,
  model_721_threshold_eur: "50000",
  model_721_increase_eur: "20000",
  model_721_alert_threshold_eur: "45000",
};

const TODAY = "2028-06-01";

const only = (report: InformativeReturn): InformativeCategory =>
  report.categories[0] as InformativeCategory;

const ledger = (unit: string): LedgerBuilder => {
  const b = new LedgerBuilder();
  b.settings(SETTINGS);
  b.account("acc_ib", { platform: "ibkr", country: "IE" });
  b.account("acc_es");
  b.asset("coin_c", { asset_type: "crypto", asset_class: "crypto", transferable: false });
  b.asset("coin_d", { asset_type: "crypto", asset_class: "crypto", transferable: false });
  b.asset("etp_bt", { asset_type: "etp", asset_class: "crypto", transferable: false });
  b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "200000" });
  b.deposit({ account_id: "acc_es", value_date: "2027-01-04", amount: "200000" });
  b.buy({
    account_id: "acc_ib",
    asset_id: "coin_c",
    value_date: "2027-01-05",
    quantity: "10",
    unit_price: "1000",
  });
  b.buy({
    account_id: "acc_ib",
    asset_id: "etp_bt",
    value_date: "2027-01-05",
    quantity: "10",
    unit_price: "1000",
  });
  // Held in Spain: outside both models, whatever it is worth.
  b.buy({
    account_id: "acc_es",
    asset_id: "coin_d",
    value_date: "2027-01-05",
    quantity: "10",
    unit_price: "1000",
  });
  for (const asset of ["coin_c", "etp_bt"]) {
    b.valuation({
      account_id: "acc_ib",
      asset_id: asset,
      date: "2027-12-31",
      quantity: "10",
      unit_value: unit,
    });
  }
  b.valuation({
    account_id: "acc_es",
    asset_id: "coin_d",
    date: "2027-12-31",
    quantity: "10",
    unit_value: "9000",
  });
  return b;
};

describe("the Modelo 721", () => {
  it("counts the crypto of a foreign account and says it cannot see self-custody", () => {
    const report = model721(ledger("6000").build(), 2027, { today: TODAY });
    const crypto = only(report);
    expect(crypto.category).toBe("crypto");
    expect(crypto.items.map((item) => item.asset_id)).toEqual(["coin_c"]);
    expect(crypto.value_eur.amount.toString()).toBe("60000");
    expect(crypto.verdict).toBe("obliged");
    expect(report.notes.map((note) => note.code)).toContain("informative_crypto_custody_unknown");
  });

  it("never takes an ETP: it is a security of the 720", () => {
    const events = ledger("6000").build();
    const crypto = only(model721(events, 2027, { today: TODAY }));
    expect(crypto.items.map((item) => item.asset_id)).not.toContain("etp_bt");
    const securities = model720(events, 2027, { today: TODAY }).categories.find(
      (entry) => entry.category === "securities",
    ) as InformativeCategory;
    expect(securities.items.map((item) => item.asset_id)).toEqual(["etp_bt"]);
    // And the 720 never takes the crypto either: the two models do not overlap.
    expect(securities.items.map((item) => item.asset_id)).not.toContain("coin_c");
  });

  it("leaves what is held in Spain out of both", () => {
    const events = ledger("1000").build();
    const crypto = only(model721(events, 2027, { today: TODAY }));
    expect(crypto.items.every((item) => item.account_id === "acc_ib")).toBe(true);
    expect(crypto.value_eur.amount.toString()).toBe("10000");
    expect(crypto.verdict).toBe("not_obliged");
  });

  it("has no 2022: the model exists since 2023", () => {
    const report = model721(ledger("6000").build(), 2022, { today: TODAY });
    expect(report.period).toBe("before_model");
    expect(only(report).verdict).toBe("not_applicable");
    expect(report.notes.map((note) => note.code)).toContain("informative_model_did_not_exist");
  });
});
