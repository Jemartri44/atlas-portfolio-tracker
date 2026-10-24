// A restructuring can sell the same asset in the same account more than once.
// Each of those sales reads the loss still deferred **of its own**, so the rows
// of the form add up to the savings base of the engine.

import { describe, expect, it } from "vitest";
import { taxBoxes } from "../../src/tax/boxes/boxes.js";
import { buy, HAND_SETTINGS, rowsAddUpToTheEngine, taxBuilder } from "./helpers.js";

const forcedSale = (quantity: string, price: string) => ({
  op: "forced_sale" as const,
  per_account: [{ account_id: "acc_a", quantity, fee: "0", withholding: "0" }],
  unit_price: price,
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-03-01",
});

describe("the rows of two sales of one event in one account", () => {
  // The loss of the first sale is deferred whole by the one-year window (units
  // bought before and again after it); the second sale is a gain.
  const ledger = () => {
    const b = taxBuilder(null);
    b.settings({
      ...HAND_SETTINGS,
      wash_sale_window: { ...HAND_SETTINGS.wash_sale_window, stock: "1y" },
    });
    buy(b, "stock_s", "2026-09-01", "10", "100");
    b.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      effects: [forcedSale("3", "90"), forcedSale("2", "120")],
    });
    buy(b, "stock_s", "2027-08-02", "3", "100");
    return b.build();
  };

  it("the loss of the first one is imputable at what is not deferred", () => {
    const boxes = taxBoxes(ledger(), 2027, { today: "2028-03-01" });
    const imputable = boxes.entries.filter(
      (entry) => entry.concept === "gp.listed_shares.loss_imputable",
    );
    expect(imputable.map((entry) => entry.exact_eur?.amount.toString())).toEqual(["0"]);
  });

  it("add up to the base of the engine", () => {
    expect(rowsAddUpToTheEngine(ledger(), 2027, "2028-03-01")).toEqual({
      rows: "40",
      engine: "40",
    });
  });
});

describe("the withholding of two assets sold by one event in one account", () => {
  const ledger = (leadingWithholding: string) => {
    const b = taxBuilder(null);
    b.settings({
      ...HAND_SETTINGS,
      income_category: { ...HAND_SETTINGS.income_category, etc: "movable_capital" },
    });
    buy(b, "stock_s", "2027-01-11", "10", "100");
    buy(b, "etc_e", "2027-01-11", "10", "100");
    b.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      effects: [
        {
          ...forcedSale("1", "100"),
          per_account: [
            { account_id: "acc_a", quantity: "1", fee: "0", withholding: leadingWithholding },
          ],
        },
        {
          ...forcedSale("3", "110"),
          per_account: [{ account_id: "acc_a", quantity: "3", fee: "0", withholding: "5" }],
        },
        {
          ...forcedSale("2", "120"),
          asset_id: "etc_e",
          per_account: [{ account_id: "acc_a", quantity: "2", fee: "0", withholding: "7" }],
        },
      ],
    });
    return b.build();
  };

  it.each(["0", "2"])(
    "goes to the box of the category of its own asset (first sale withholds %s)",
    (leading) => {
      const boxes = taxBoxes(ledger(leading), 2027, { today: "2028-03-01" });
      const withheld = (concept: string) =>
        boxes.entries.find((entry) => entry.concept === concept)?.exact_eur?.amount.toString();
      expect(withheld("withholding.capital_gain")).toBe(String(Number(leading) + 5));
      expect(withheld("withholding.rcm")).toBe("7");
    },
  );
});
