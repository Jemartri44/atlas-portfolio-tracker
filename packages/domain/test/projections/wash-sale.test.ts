import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerState } from "../../src/projections/state.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const EUR = { currency: "EUR", fx_rate: "1" } as const;

const codes = (state: LedgerState, code: string) =>
  state.warnings.filter((warning) => warning.code === code);

/** A stock bought, sold at a loss, and bought again on `repurchase`. */
const stockCycle = (repurchase?: string): LedgerState => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.thesisOpened({ thesis_id: "t1", planned_size_eur: "100000" });
  b.buy({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    quantity: "10",
    unit_price: "10",
    fee: "0",
    ...EUR,
    trade_date: "2027-01-10",
    value_date: "2027-01-12",
    thesis_id: "t1",
  });
  b.sell({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    quantity: "10",
    unit_price: "8",
    fee: "0",
    ...EUR,
    trade_date: "2027-02-10",
    thesis_id: "t1",
  });
  b.thesisClosed("t1");
  if (repurchase !== undefined) {
    b.thesisOpened({ thesis_id: "t2", planned_size_eur: "100000" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: "8",
      fee: "0",
      ...EUR,
      trade_date: repurchase,
      value_date: repurchase,
      thesis_id: "t2",
    });
  }
  return projectLedger(b.build());
};

describe("wash_sale_window_repurchase: buying back after a loss", () => {
  it("warns on the last day of the window and not on the next one (two months, a stock)", () => {
    const inside = codes(stockCycle("2027-04-10"), "wash_sale_window_repurchase");
    expect(inside).toHaveLength(1);
    expect(inside[0]?.details).toMatchObject({
      asset_id: "ast_spec",
      sale_date: "2027-02-10",
      window_end: "2027-04-10",
      loss_eur: "-20",
      window: "2m",
    });
    expect(codes(stockCycle("2027-04-11"), "wash_sale_window_repurchase")).toEqual([]);
  });

  it("warns at eleven months and not at thirteen for a fund (one year)", () => {
    const fundCycle = (repurchase: string): LedgerState => {
      const b = new LedgerBuilder();
      catalogue(b);
      b.buy({
        account_id: "acc_fund",
        asset_id: "ast_world",
        quantity: "10",
        unit_price: "10",
        ...EUR,
        trade_date: "2027-01-10",
        value_date: "2027-01-12",
      });
      b.sell({
        account_id: "acc_fund",
        asset_id: "ast_world",
        quantity: "10",
        unit_price: "8",
        ...EUR,
        trade_date: "2027-02-10",
        value_date: "2027-02-10",
      });
      b.buy({
        account_id: "acc_fund",
        asset_id: "ast_world",
        quantity: "5",
        unit_price: "8",
        ...EUR,
        trade_date: repurchase,
        value_date: repurchase,
      });
      return projectLedger(b.build());
    };
    // A fund is taxed by value date and its window is a year (ADR-0013/0014).
    expect(codes(fundCycle("2028-01-10"), "wash_sale_window_repurchase")).toHaveLength(1);
    expect(codes(fundCycle("2028-02-10"), "wash_sale_window_repurchase")).toHaveLength(1);
    expect(codes(fundCycle("2028-03-10"), "wash_sale_window_repurchase")).toEqual([]);
  });

  it("does not warn when the sale made money", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: "2027-01-10",
      value_date: "2027-01-12",
    });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "13",
      ...EUR,
      trade_date: "2027-02-10",
      value_date: "2027-02-10",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "5",
      unit_price: "13",
      ...EUR,
      trade_date: "2027-03-10",
      value_date: "2027-03-10",
    });
    const state = projectLedger(b.build());
    expect(codes(state, "wash_sale_window_repurchase")).toEqual([]);
    expect(codes(state, "wash_sale_window_prior_buy")).toEqual([]);
  });

  it("does not warn about another asset, however close the dates are", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: "2027-01-10",
      value_date: "2027-01-12",
    });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "8",
      ...EUR,
      trade_date: "2027-02-10",
      value_date: "2027-02-10",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: "2027-02-11",
      value_date: "2027-02-11",
    });
    expect(codes(projectLedger(b.build()), "wash_sale_window_repurchase")).toEqual([]);
  });
});

describe("wash_sale_window_prior_buy: selling at a loss after buying", () => {
  it("warns about a purchase inside the previous window and not about an older one", () => {
    const cycle = (buyDate: string): LedgerState => {
      const b = new LedgerBuilder();
      catalogue(b);
      b.thesisOpened({ thesis_id: "t1", planned_size_eur: "100000" });
      b.buy({
        account_id: "acc_bucket",
        asset_id: "ast_spec",
        quantity: "10",
        unit_price: "10",
        fee: "0",
        ...EUR,
        trade_date: buyDate,
        value_date: buyDate,
        thesis_id: "t1",
      });
      b.sell({
        account_id: "acc_bucket",
        asset_id: "ast_spec",
        quantity: "10",
        unit_price: "8",
        fee: "0",
        ...EUR,
        trade_date: "2027-03-10",
        thesis_id: "t1",
      });
      return projectLedger(b.build());
    };
    // Exactly two months before the sale: inside. One day earlier: outside.
    const inside = codes(cycle("2027-01-10"), "wash_sale_window_prior_buy");
    expect(inside).toHaveLength(1);
    expect(inside[0]?.details).toMatchObject({
      asset_id: "ast_spec",
      buy_date: "2027-01-10",
      window_start: "2027-01-10",
      quantity: "10",
      window: "2m",
    });
    expect(codes(cycle("2027-01-09"), "wash_sale_window_prior_buy")).toEqual([]);
  });

  it("counts day zero on both sides, and warns about it exactly once", () => {
    // A purchase with the same fiscal date as the loss-making sale is inside
    // the window. Which of the two warnings it gets is decided by the position
    // in the file, so the same fact is never reported twice.
    const sameDay = (buyFirst: boolean): LedgerState => {
      const b = new LedgerBuilder();
      catalogue(b);
      b.thesisOpened({ thesis_id: "t1", planned_size_eur: "100000" });
      b.buy({
        account_id: "acc_bucket",
        asset_id: "ast_spec",
        quantity: "10",
        unit_price: "10",
        fee: "0",
        ...EUR,
        trade_date: "2027-01-10",
        value_date: "2027-01-10",
        thesis_id: "t1",
      });
      const again = () =>
        b.buy({
          account_id: "acc_bucket",
          asset_id: "ast_spec",
          quantity: "10",
          unit_price: "8",
          fee: "0",
          ...EUR,
          trade_date: "2027-02-10",
          value_date: "2027-02-10",
          thesis_id: "t1",
        });
      const sell = () =>
        b.sell({
          account_id: "acc_bucket",
          asset_id: "ast_spec",
          quantity: "10",
          unit_price: "8",
          fee: "0",
          ...EUR,
          trade_date: "2027-02-10",
          thesis_id: "t1",
        });
      if (buyFirst) {
        again();
        sell();
      } else {
        sell();
        again();
      }
      return projectLedger(b.build());
    };

    // The purchase comes first in the file: it is a prior buy of the sale.
    const prior = sameDay(true);
    expect(codes(prior, "wash_sale_window_prior_buy").map((w) => w.details.buy_date)).toEqual([
      "2027-01-10",
      "2027-02-10",
    ]);
    expect(codes(prior, "wash_sale_window_repurchase")).toEqual([]);

    // The purchase comes after: it is a repurchase of the very same day.
    const after = sameDay(false);
    expect(codes(after, "wash_sale_window_repurchase").map((w) => w.details.sale_date)).toEqual([
      "2027-02-10",
    ]);
    expect(codes(after, "wash_sale_window_prior_buy").map((w) => w.details.buy_date)).toEqual([
      "2027-01-10",
    ]);
  });

  it("warns once per purchase inside the window", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    for (const date of ["2027-02-01", "2027-02-15", "2027-03-01"]) {
      b.buy({
        account_id: "acc_fund",
        asset_id: "ast_world",
        quantity: "5",
        unit_price: "10",
        ...EUR,
        trade_date: date,
        value_date: date,
      });
    }
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "15",
      unit_price: "6",
      ...EUR,
      trade_date: "2027-06-01",
      value_date: "2027-06-01",
    });
    expect(codes(projectLedger(b.build()), "wash_sale_window_prior_buy")).toHaveLength(3);
  });

  it("applies to both books: the rule is fiscal, not of the bucket", () => {
    const bucket = stockCycle("2027-04-10");
    expect(codes(bucket, "wash_sale_window_repurchase")).toHaveLength(1);
    // And the sale of the bucket itself warned about its own purchase.
    expect(codes(bucket, "wash_sale_window_prior_buy")).toHaveLength(1);
  });
});

const NAV = { nav_out: "10", nav_in: "10" } as const;

/**
 * The criterion of `docs/fiscal-questions.md` #2b: a transfer **in** acquires
 * homogeneous securities even though nothing is taxed at the origin, so it
 * counts for the rule unless `wash_sale_transfer_counts` says otherwise.
 * `undefined` leaves the ledger without a `settings_changed`, which is the case
 * that must behave like `true` (the documented default).
 */
const withTransferCounts = (b: LedgerBuilder, counts?: boolean): void => {
  if (counts !== undefined) {
    b.settings(mergeSettings(DEFAULT_SETTINGS, { wash_sale_transfer_counts: counts }));
  }
};

describe("wash_sale_transfer_counts: a transfer in as an acquisition", () => {
  /** Buy of the origin fund, transfer into another one, and a loss-making sale of the destination. */
  const transferThenLoss = (counts?: boolean): LedgerState => {
    const b = new LedgerBuilder();
    catalogue(b);
    withTransferCounts(b, counts);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: "2026-01-10",
      value_date: "2026-01-12",
    });
    b.transfer({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      quantity_out: "10",
      value_date_out: "2027-05-01",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_in: "10",
      value_date_in: "2027-05-03",
      ...NAV,
    });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      quantity: "10",
      unit_price: "6",
      ...EUR,
      trade_date: "2027-06-01",
      value_date: "2027-06-01",
    });
    return projectLedger(b.build());
  };

  it("counts it, so a later loss on the destination fund warns about it", () => {
    // The units are subscribed on value_date_in; the lots keep the original
    // acquisition date (2026-01-12), which is not what the rule looks at.
    for (const state of [transferThenLoss(), transferThenLoss(true)]) {
      const warnings = codes(state, "wash_sale_window_prior_buy");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.details).toMatchObject({
        asset_id: "ast_bonds",
        buy_date: "2027-05-03",
        quantity: "10",
        loss_eur: "-40",
        window_start: "2026-06-01",
        window: "1y",
      });
    }
  });

  it("does not count it when the criterion is switched off", () => {
    expect(codes(transferThenLoss(false), "wash_sale_window_prior_buy")).toEqual([]);
  });

  /** The central case of the core: a fund redeemed at a loss and a transfer back into it. */
  const lossThenTransferIn = (valueDateIn: string, counts?: boolean): LedgerState => {
    const b = new LedgerBuilder();
    catalogue(b);
    withTransferCounts(b, counts);
    for (const asset_id of ["ast_world", "ast_bonds"]) {
      b.buy({
        account_id: "acc_fund",
        asset_id,
        quantity: "10",
        unit_price: "10",
        ...EUR,
        trade_date: "2026-01-10",
        value_date: "2026-01-12",
      });
    }
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "8",
      ...EUR,
      trade_date: "2027-02-10",
      value_date: "2027-02-10",
    });
    b.transfer({
      from_account_id: "acc_fund",
      from_asset_id: "ast_bonds",
      quantity_out: "10",
      value_date_out: valueDateIn,
      to_account_id: "acc_fund",
      to_asset_id: "ast_world",
      quantity_in: "10",
      value_date_in: valueDateIn,
      ...NAV,
    });
    return projectLedger(b.build());
  };

  it("warns when the transfer in falls inside the window of a fund redeemed at a loss", () => {
    const warnings = codes(lossThenTransferIn("2027-05-03"), "wash_sale_window_repurchase");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.details).toMatchObject({
      asset_id: "ast_world",
      sale_date: "2027-02-10",
      loss_eur: "-20",
      window_end: "2028-02-10",
      window: "1y",
    });
    // Outside the year, and with the criterion off, nothing is said.
    expect(codes(lossThenTransferIn("2028-03-10"), "wash_sale_window_repurchase")).toEqual([]);
    expect(codes(lossThenTransferIn("2027-05-03", false), "wash_sale_window_repurchase")).toEqual(
      [],
    );
  });

  it("never counts a custody transfer: it moves the asset, it acquires nothing", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.account("acc_ibkr2", { platform: "ibkr", country: "IE" });
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: "2027-01-10",
      value_date: "2027-01-10",
    });
    b.sell({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      quantity: "4",
      unit_price: "6",
      ...EUR,
      trade_date: "2027-02-10",
      value_date: "2027-02-10",
    });
    b.transfer({
      from_account_id: "acc_etf",
      from_asset_id: "ast_gold",
      quantity_out: "6",
      value_date_out: "2027-03-01",
      to_account_id: "acc_ibkr2",
      to_asset_id: "ast_gold",
      quantity_in: "6",
      value_date_in: "2027-03-01",
    });
    expect(codes(projectLedger(b.build()), "wash_sale_window_repurchase")).toEqual([]);
  });

  it("still ignores a scale and a zero-cost grant, whatever the criterion says", () => {
    const freeShares = (counts?: boolean): LedgerState => {
      const b = new LedgerBuilder();
      catalogue(b);
      withTransferCounts(b, counts);
      b.asset("ast_stock", { asset_type: "stock", transferable: false });
      b.buy({
        account_id: "acc_fund",
        asset_id: "ast_stock",
        quantity: "10",
        unit_price: "10",
        ...EUR,
        trade_date: "2026-01-12",
        value_date: "2026-01-12",
      });
      b.corporateAction({
        kind: "split",
        asset_id: "ast_stock",
        effective_date: "2027-02-01",
        effects: [{ op: "scale", ratio: "2" }],
      });
      b.corporateAction({
        kind: "stock_dividend",
        asset_id: "ast_stock",
        effective_date: "2027-02-05",
        effects: [
          {
            op: "grant",
            per_account: [{ account_id: "acc_fund", quantity: "1" }],
            unit_cost: "0",
            acquisition_date: "2027-02-05",
            currency: "EUR",
            fx_rate: "1",
            fx_rate_date: "2027-02-05",
          },
        ],
      });
      b.sell({
        account_id: "acc_fund",
        asset_id: "ast_stock",
        quantity: "21",
        unit_price: "1",
        ...EUR,
        trade_date: "2027-03-01",
        value_date: "2027-03-01",
      });
      return projectLedger(b.build());
    };
    // A stock: the window opens on 2027-01-01, so the purchase of 2026 is out
    // and only the split and the free share are inside it. Neither is paid for.
    for (const counts of [undefined, true, false]) {
      expect(codes(freeShares(counts), "wash_sale_window_prior_buy")).toEqual([]);
    }
  });
});
