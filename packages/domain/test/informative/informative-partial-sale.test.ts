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
  options: {
    declared: boolean;
    sold: string;
    rebought?: string;
    trade?: string;
    value?: string;
  },
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
  if (options.sold !== "0") {
    b.sell({
      account_id: "acc_ib",
      asset_id: "asset_a",
      trade_date: options.trade ?? "2028-03-10",
      value_date: options.value ?? "2028-03-10",
      quantity: options.sold,
      unit_price: "100",
    });
  }

  if (options.rebought !== undefined) {
    b.deposit({ account_id: "acc_ib", value_date: "2028-06-09", amount: "50000" });
    b.buy({
      account_id: "acc_ib",
      asset_id: "asset_a",
      value_date: "2028-06-10",
      quantity: options.rebought,
      unit_price: "100",
    });
  }
  b.valuation({
    account_id: "acc_ib",
    asset_id: "asset_a",
    date: "2028-12-31",
    quantity: String(600 - Number(options.sold) + Number(options.rebought ?? 0)),
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

  it.each(CASES)(
    "$model: sold 100 in March, bought 150 back in June: still obliged",
    ({ model, category, type }) => {
      const result = verdictOf(
        model,
        category,
        ledger(category, type, { declared: true, sold: "100", rebought: "150" }),
      );
      expect(result.value_eur.amount.toString()).toBe("65000");
      expect(result.reasons.map((reason) => reason.kind)).toContain("partial_extinction");
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

describe("what counts as a transmission of a declared asset", () => {
  type Other = (b: LedgerBuilder) => void;
  const base = (other: Other): LedgerBuilder => {
    const b = ledger("securities", "etf", { declared: true, sold: "0" });
    b.asset("asset_b", { asset_type: "etf", asset_class: "equity", transferable: false });
    b.account("acc_ib2", { platform: "ibkr", country: "IE" });
    other(b);
    return b;
  };
  const kinds = (b: LedgerBuilder): string[] =>
    verdictOf("720", "securities", b).reasons.map((reason) => reason.kind);

  it("a swap hands over part of it", () => {
    const b = base((x) =>
      x.swap({
        account_id: "acc_ib",
        from_asset_id: "asset_a",
        to_asset_id: "asset_b",
        trade_date: "2028-04-01",
        quantity_out: "100",
        market_value_out: "10000",
        quantity_in: "100",
        market_value_in: "10000",
      }),
    );
    expect(kinds(b)).toContain("partial_extinction");
  });

  it("a transfer out of the account moves part of it away", () => {
    const b = base((x) =>
      x.transfer({
        from_account_id: "acc_ib",
        from_asset_id: "asset_a",
        quantity_out: "100",
        value_date_out: "2028-04-01",
        to_account_id: "acc_ib2",
        to_asset_id: "asset_a",
        quantity_in: "100",
        value_date_in: "2028-04-01",
      } as never),
    );
    expect(kinds(b)).toContain("partial_extinction");
  });

  it.each([{ named: { asset_id: "asset_a" } }, { named: {} }])(
    "a forced sale of a corporate action",
    ({ named }) => {
      const b = base((x) =>
        x.corporateAction({
          kind: "issuer_restructuring",
          asset_id: "asset_a",
          effective_date: "2028-04-01",
          effects: [
            {
              op: "forced_sale",
              ...named,
              per_account: [{ account_id: "acc_ib", quantity: "100" }],
              unit_price: "100",
              currency: "EUR",
              fx_rate: "1",
              fx_rate_date: "2028-03-31",
            },
          ],
        }),
      );
      expect(kinds(b)).toContain("partial_extinction");
    },
  );

  it("a sale that was reversed and a split do not", () => {
    const b = base((x) => {
      const wrong = x.sell({
        account_id: "acc_ib",
        asset_id: "asset_a",
        value_date: "2028-04-01",
        quantity: "100",
        unit_price: "100",
      });
      x.reversal(wrong.id);
      x.corporateAction({
        kind: "split",
        asset_id: "asset_a",
        effective_date: "2028-04-02",
        effects: [{ op: "scale", ratio: "2" }],
      });
    });
    expect(kinds(b)).not.toContain("partial_extinction");
  });

  it("the same operations before the end of the year of the last return do not", () => {
    const b = base((x) => {
      x.swap({
        account_id: "acc_ib",
        from_asset_id: "asset_a",
        to_asset_id: "asset_b",
        trade_date: "2027-06-01",
      });
      x.transfer({
        from_account_id: "acc_ib",
        from_asset_id: "asset_a",
        quantity_out: "1",
        value_date_out: "2027-06-02",
        to_account_id: "acc_ib2",
        to_asset_id: "asset_a",
        quantity_in: "1",
        value_date_in: "2027-06-02",
      } as never);
      x.corporateAction({
        kind: "issuer_restructuring",
        asset_id: "asset_a",
        effective_date: "2027-06-03",
        effects: [
          {
            op: "forced_sale",
            per_account: [{ account_id: "acc_ib", quantity: "1" }],
            unit_price: "100",
            currency: "EUR",
            fx_rate: "1",
            fx_rate_date: "2027-06-02",
          },
        ],
      });
    });
    expect(kinds(b)).not.toContain("partial_extinction");
  });
});

describe("the date of the transmission is the fiscal date of the asset", () => {
  // A fund counts by its value date: the quantity it leaves at 31 December
  // and the year the sale falls in must agree.
  const fundSold = (year: number, trade: string, value: string) =>
    informativeReturn(
      ledger("securities", "fund", { declared: true, sold: "100", trade, value }).build(),
      "720",
      year,
      { today: "2030-02-01" },
    ).categories.find((entry) => entry.category === "securities") as InformativeCategory;

  it("traded on 30/12/2027 and settled in 2028: it is a 2028 transmission", () => {
    expect(fundSold(2028, "2027-12-30", "2028-01-03").reasons.map((r) => r.kind)).toContain(
      "partial_extinction",
    );
  });

  it("traded on 30/12/2028 and settled in 2029: it is not one of 2028, it is one of 2029", () => {
    expect(fundSold(2028, "2028-12-30", "2029-01-03").verdict).toBe("not_obliged");
    expect(fundSold(2029, "2028-12-30", "2029-01-03").reasons.map((r) => r.kind)).toContain(
      "partial_extinction",
    );
  });
});

describe("interaction with the other reasons", () => {
  it.each(CASES)(
    "$model: selling it all is one extinction, not also a partial one",
    ({ model, category, type }) => {
      const result = verdictOf(
        model,
        category,
        ledger(category, type, { declared: true, sold: "600" }),
      );
      expect(result.reasons.map((reason) => reason.kind)).toEqual(["extinction"]);
    },
  );

  it.each(CASES)(
    "$model: a rise over 20.000 and a transmission give both reasons",
    ({ model, category, type }) => {
      const result = verdictOf(
        model,
        category,
        ledger(category, type, { declared: true, sold: "100", rebought: "400" }),
      );
      expect(result.reasons.map((reason) => reason.kind)).toEqual([
        "increase",
        "partial_extinction",
      ]);
    },
  );
});
