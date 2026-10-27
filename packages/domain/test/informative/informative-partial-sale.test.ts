// A partial sale of something already declared obliges to file again; a
// partial sale of something never declared does not. Both models, same rule.

import { describe, expect, it } from "vitest";
import { informativeReturn } from "../../src/informative/m720.js";
import type { InformativeCategory } from "../../src/informative/report.js";
import type { InformativeModel, Settings } from "../../src/settings/settings.js";
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
};

const CASES: { model: InformativeModel; category: "securities" | "crypto"; type: string }[] = [
  { model: "720", category: "securities", type: "etf" },
  { model: "721", category: "crypto", type: "crypto" },
];

/** Filed for 2027 with 600 units at 100 (60.000); 2028 sells `sold` and values the rest at 100. */
const ledger = (
  category: "securities" | "crypto",
  type: string,
  options: { declared: boolean; sold: string },
): LedgerBuilder => {
  const b = new LedgerBuilder();
  b.settings(SETTINGS);
  b.account("acc_ib", { platform: "ibkr", country: "IE" });
  b.asset("asset_a", {
    asset_type: type,
    asset_class: category === "crypto" ? "crypto" : "equity",
    transferable: false,
  });
  b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "60000" });
  b.buy({
    account_id: "acc_ib",
    asset_id: "asset_a",
    value_date: "2027-01-05",
    quantity: "600",
    unit_price: "100",
  });
  b.valuation({
    account_id: "acc_ib",
    asset_id: "asset_a",
    date: "2027-12-31",
    quantity: "600",
    unit_value: "100",
  });
  b.filed({
    model: category === "crypto" ? "721" : "720",
    tax_year: 2027,
    filed_at: "2028-03-15",
    declared: {
      [category]: { value_eur: "60000.00" },
      items: options.declared
        ? [{ category, account_id: "acc_ib", asset_id: "asset_a", value_eur: "60000.00" }]
        : [],
    },
  });
  b.sell({
    account_id: "acc_ib",
    asset_id: "asset_a",
    value_date: "2028-05-10",
    quantity: options.sold,
    unit_price: "100",
  });
  b.valuation({
    account_id: "acc_ib",
    asset_id: "asset_a",
    date: "2028-12-31",
    quantity: String(600 - Number(options.sold)),
    unit_value: "100",
  });
  return b;
};

const verdictOf = (
  model: InformativeModel,
  category: string,
  b: LedgerBuilder,
): InformativeCategory =>
  informativeReturn(b.build(), model, 2028, { today: "2029-02-01" }).categories.find(
    (entry) => entry.category === category,
  ) as InformativeCategory;

describe("a partial sale of an asset of the last return filed", () => {
  it.each(CASES)(
    "$model: 600 declared, 100 sold, no rise: obliged",
    ({ model, category, type }) => {
      const result = verdictOf(
        model,
        category,
        ledger(category, type, { declared: true, sold: "100" }),
      );
      expect(result.value_eur.amount.toString()).toBe("50000");
      expect(result.verdict).toBe("obliged");
      expect(result.reasons).toEqual([
        {
          kind: "partial_extinction",
          account_id: "acc_ib",
          asset_id: "asset_a",
          against_year: 2027,
        },
      ]);
    },
  );

  it.each(CASES)("$model: nothing sold, nothing new: not obliged", ({ model, category, type }) => {
    const result = verdictOf(
      model,
      category,
      ledger(category, type, { declared: true, sold: "0" }),
    );
    expect(result.verdict).toBe("not_obliged");
  });

  it.each(CASES)(
    "$model: the same sale of something never declared does not oblige",
    ({ model, category, type }) => {
      const result = verdictOf(
        model,
        category,
        ledger(category, type, { declared: false, sold: "100" }),
      );
      expect(result.verdict).toBe("not_obliged");
      expect(result.reasons.map((reason) => reason.kind)).not.toContain("partial_extinction");
    },
  );
});
