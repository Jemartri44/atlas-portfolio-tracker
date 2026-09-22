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
      buy_date: "2027-04-10",
      // What was bought back: it used to be the quantity sold, under a name
      // that did not say which (feature 009, quality review).
      buy_quantity: "10",
      sale_date: "2027-02-10",
      window_end: "2027-04-10",
      loss_eur: "-20",
      window: "2m",
    });
    expect(codes(stockCycle("2027-04-11"), "wash_sale_window_repurchase")).toEqual([]);
  });

  it("warns at eleven months and not at thirteen for a fund (one year)", () => {
    const fundCycle = (repurchase: string, window?: "1y"): LedgerState => {
      const b = new LedgerBuilder();
      catalogue(b);
      if (window !== undefined) {
        b.settings({
          ...DEFAULT_SETTINGS,
          wash_sale_window: { ...DEFAULT_SETTINGS.wash_sale_window, fund: window },
        });
      }
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
    // A fund is taxed by value date, and since the correction of criterion #2
    // (2026-09-22) its window is **two months**: the sale of 10 February warns
    // until 10 April and not on the 11th.
    expect(codes(fundCycle("2027-04-10"), "wash_sale_window_repurchase")).toHaveLength(1);
    expect(codes(fundCycle("2027-04-11"), "wash_sale_window_repurchase")).toEqual([]);
    // With a year written into the ledger, eleven months still warn and
    // thirteen do not: the arithmetic of the year is the same as it was.
    expect(codes(fundCycle("2028-01-10", "1y"), "wash_sale_window_repurchase")).toHaveLength(1);
    expect(codes(fundCycle("2028-03-10", "1y"), "wash_sale_window_repurchase")).toEqual([]);
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
      // Half of it: the other half stays, and only what stays can defer (#18).
      b.sell({
        account_id: "acc_bucket",
        asset_id: "ast_spec",
        quantity: "5",
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
      sale_date: "2027-03-10",
      buy_date: "2027-01-10",
      window_start: "2027-01-10",
      // Of the 10 bought, the sale took 5: what is still held is what it says.
      held_quantity: "5",
      loss_eur: "-10",
      tax_year: 2027,
      window: "2m",
    });
    // Held, not bought: the key says which, unlike the repurchase's buy_quantity.
    expect(inside[0]?.details).not.toHaveProperty("buy_quantity");
    expect(codes(cycle("2027-01-09"), "wash_sale_window_prior_buy")).toEqual([]);
  });

  it("says how much of the purchase is still held, in today's units (fiscal review 7a)", () => {
    // 10 bought in January and 2 in February; a 1:4 reverse split leaves 2.5
    // and 0.5; the loss-making sale takes 1 from the oldest.
    const b = new LedgerBuilder();
    catalogue(b);
    const first = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: "2027-01-11",
      value_date: "2027-01-11",
    });
    const second = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "2",
      unit_price: "10",
      ...EUR,
      trade_date: "2027-02-01",
      value_date: "2027-02-01",
    });
    b.corporateAction({
      kind: "reverse_split",
      asset_id: "ast_world",
      effective_date: "2027-02-15",
      effects: [{ op: "scale", ratio: "1/4" }],
    });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "1",
      unit_price: "30",
      ...EUR,
      trade_date: "2027-03-10",
      value_date: "2027-03-10",
    });
    const warnings = codes(projectLedger(b.build()), "wash_sale_window_prior_buy");
    // Not the 10 and 2 bought: the 1.5 and 0.5 that are left.
    expect(warnings.map((w) => [w.details.buy_event_id, w.details.held_quantity])).toEqual([
      [first.id, "1.5"],
      [second.id, "0.5"],
    ]);
    expect(warnings[1]?.message).toContain("while 0.5 of a purchase of 2027-02-01 are still held");
  });

  it("names a purchase noted once per account only once, with all it left", () => {
    // Shares granted with a cost in two accounts: one purchase, two entries.
    const b = new LedgerBuilder();
    catalogue(b);
    const grant = b.corporateAction({
      kind: "stock_dividend",
      asset_id: "ast_world",
      effective_date: "2027-01-11",
      effects: [
        {
          op: "grant",
          asset_id: "ast_world",
          per_account: [
            { account_id: "acc_fund", quantity: "4" },
            { account_id: "acc_etf", quantity: "6" },
          ],
          unit_cost: "10",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-01-11",
          acquisition_date: "2027-01-11",
        },
      ],
    });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "1",
      unit_price: "8",
      ...EUR,
      trade_date: "2027-03-10",
      value_date: "2027-03-10",
    });
    const warnings = codes(projectLedger(b.build()), "wash_sale_window_prior_buy");
    expect(warnings.map((w) => [w.details.buy_event_id, w.details.held_quantity])).toEqual([
      [grant.id, "9"],
    ]);
  });

  it("does not name a purchase the loss-making sale itself consumed (#18)", () => {
    // Bought and sold whole: nothing of that purchase stays in the patrimony,
    // so it defers nothing, and the warning must not say it does.
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: "2027-01-10",
      value_date: "2027-01-10",
    });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "8",
      ...EUR,
      trade_date: "2027-03-10",
      value_date: "2027-03-10",
    });
    expect(codes(projectLedger(b.build()), "wash_sale_window_prior_buy")).toEqual([]);
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

    // The purchase comes first in the file: it is a prior buy of the sale. The
    // sale consumes the older lot by FIFO, so only the purchase of the same day
    // is still held and named (#18).
    const prior = sameDay(true);
    expect(codes(prior, "wash_sale_window_prior_buy").map((w) => w.details.buy_date)).toEqual([
      "2027-02-10",
    ]);
    expect(codes(prior, "wash_sale_window_repurchase")).toEqual([]);

    // The purchase comes after: it is a repurchase of the very same day, and
    // the older lot, sold whole, is named by nobody.
    const after = sameDay(false);
    expect(codes(after, "wash_sale_window_repurchase").map((w) => w.details.sale_date)).toEqual([
      "2027-02-10",
    ]);
    expect(codes(after, "wash_sale_window_prior_buy")).toEqual([]);
  });

  it("warns once per purchase inside the window", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    // An older lot the sale consumes by FIFO, so the three purchases stay held.
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "15",
      unit_price: "10",
      ...EUR,
      trade_date: "2026-01-12",
      value_date: "2026-01-12",
    });
    // Inside the two months of a fund, which is its window since the correction
    // of criterion #2: what this pins is one warning per purchase.
    for (const date of ["2027-04-10", "2027-04-20", "2027-05-01"]) {
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
    // The sale sold its own purchase whole, so it names none (#18).
    expect(codes(bucket, "wash_sale_window_prior_buy")).toHaveLength(0);
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
    // Part of it: what the transfer brought in and is still held defers (#18).
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      quantity: "6",
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
        // 10 came in, the sale took 6: 4 are still held.
        held_quantity: "4",
        loss_eur: "-24",
        // Two months for a fund since the correction of criterion #2: the
        // transfer of 3 May is still well inside the window of a sale of 1 June.
        window_start: "2027-04-01",
        window: "2m",
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
    const warnings = codes(lossThenTransferIn("2027-04-03"), "wash_sale_window_repurchase");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.details).toMatchObject({
      asset_id: "ast_world",
      sale_date: "2027-02-10",
      loss_eur: "-20",
      window_end: "2027-04-10",
      window: "2m",
    });
    // Outside the two months, and with the criterion off, nothing is said.
    expect(codes(lossThenTransferIn("2027-04-11"), "wash_sale_window_repurchase")).toEqual([]);
    expect(codes(lossThenTransferIn("2027-04-03", false), "wash_sale_window_repurchase")).toEqual(
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

describe("wash_sale_window_prior_buy: a forced sale warns like a sell", () => {
  /**
   * A fund bought at 10 and partly sold by force at 6: a 24 EUR loss nobody
   * chose. Partly, because a liquidation sells everything, and then no purchase
   * stays in the patrimony to defer anything (#18).
   */
  const liquidation = (buyDate: string): LedgerState => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: buyDate,
      value_date: buyDate,
    });
    b.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "ast_world",
      effective_date: "2027-06-01",
      effects: [
        {
          op: "forced_sale",
          per_account: [{ account_id: "acc_fund", quantity: "6" }],
          unit_price: "6",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-06-01",
        },
      ],
    });
    return projectLedger(b.build());
  };

  it("warns about a purchase inside the window of the forced sale", () => {
    const warnings = codes(liquidation("2027-05-01"), "wash_sale_window_prior_buy");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.details).toMatchObject({
      asset_id: "ast_world",
      buy_date: "2027-05-01",
      // 10 bought, 6 taken by the forced sale: 4 are still held.
      held_quantity: "4",
      loss_eur: "-24",
      window_start: "2027-04-01",
      window: "2m",
    });
  });

  it("says nothing about a purchase older than the window", () => {
    expect(codes(liquidation("2027-03-31"), "wash_sale_window_prior_buy")).toEqual([]);
  });

  it("says nothing when the forced sale makes money", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      ...EUR,
      trade_date: "2027-01-11",
      value_date: "2027-01-11",
    });
    b.corporateAction({
      kind: "fund_liquidation",
      asset_id: "ast_world",
      effective_date: "2027-06-01",
      effects: [
        {
          op: "forced_sale",
          per_account: [{ account_id: "acc_fund", quantity: "all" }],
          unit_price: "12",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-06-01",
        },
      ],
    });
    expect(codes(projectLedger(b.build()), "wash_sale_window_prior_buy")).toEqual([]);
  });
});

/**
 * A swap is a disposal and an acquisition at once, so the rule has to see it
 * from **four** sides. That is the gap PR #40 had to close for transfers — the
 * warning was wired in one direction only and the central case of the core went
 * three weeks without saying anything — and it is written out here one
 * direction at a time so the next person can see all four are covered.
 */
describe("a swap counts on both sides of the wash-sale window", () => {
  /** Crypto in the core: a one-year window, which is what makes these dates work. */
  const crypto = (setup: (b: LedgerBuilder) => void): LedgerState => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_btc", { asset_type: "crypto", asset_class: "crypto", transferable: false });
    b.asset("ast_eth", { asset_type: "crypto", asset_class: "crypto", transferable: false });
    b.deposit({ account_id: "acc_fund", amount: "100000" });
    setup(b);
    return projectLedger(b.build());
  };

  const buyBtc = (b: LedgerBuilder, date: string, unit_price = "100"): void => {
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_btc",
      quantity: "10",
      unit_price,
      ...EUR,
      trade_date: date,
      value_date: date,
    });
  };

  /** Hands over BTC at a loss: 10 units that cost 100 each, valued at 500 in all. */
  const swapAwayAtALoss = (b: LedgerBuilder, date: string): void => {
    b.swap({
      account_id: "acc_fund",
      from_asset_id: "ast_btc",
      to_asset_id: "ast_eth",
      trade_date: date,
      value_date: date,
      quantity_out: "10",
      market_value_out: "500",
      quantity_in: "20",
      market_value_in: "500",
    });
  };

  it("1. hands over at a loss after buying inside the window: warns on the prior buy", () => {
    const state = crypto((b) => {
      // An older lot for the swap to hand over by FIFO: the recent purchase stays.
      buyBtc(b, "2025-01-10");
      buyBtc(b, "2027-01-11");
      swapAwayAtALoss(b, "2027-03-11");
    });
    const [warning] = codes(state, "wash_sale_window_prior_buy");
    expect(warning?.details).toMatchObject({ asset_id: "ast_btc", buy_date: "2027-01-11" });
  });

  it("2. buys back what a swap handed over at a loss: warns on the repurchase", () => {
    const state = crypto((b) => {
      buyBtc(b, "2027-01-11");
      swapAwayAtALoss(b, "2027-03-11");
      // The edge case the prompt asks to document: a swap at a loss followed by
      // buying the same asset back inside the window.
      buyBtc(b, "2027-04-11", "60");
    });
    const [warning] = codes(state, "wash_sale_window_repurchase");
    expect(warning?.details).toMatchObject({ asset_id: "ast_btc", sale_date: "2027-03-11" });
  });

  it("3. receives an asset sold at a loss inside the window: warns on the swap itself", () => {
    const state = crypto((b) => {
      b.buy({
        account_id: "acc_fund",
        asset_id: "ast_eth",
        quantity: "10",
        unit_price: "100",
        ...EUR,
        trade_date: "2027-01-11",
        value_date: "2027-01-11",
      });
      b.sell({
        account_id: "acc_fund",
        asset_id: "ast_eth",
        quantity: "10",
        unit_price: "50",
        ...EUR,
        trade_date: "2027-02-11",
        value_date: "2027-02-11",
      });
      buyBtc(b, "2027-01-11");
      // The leg in acquires ETH again, inside the window of that loss.
      swapAwayAtALoss(b, "2027-03-11");
    });
    const repurchases = codes(state, "wash_sale_window_repurchase");
    expect(repurchases.map((warning) => warning.details.asset_id)).toContain("ast_eth");
  });

  it("4. sells at a loss what a swap brought in inside the window: warns on the prior buy", () => {
    const state = crypto((b) => {
      buyBtc(b, "2027-01-11");
      swapAwayAtALoss(b, "2027-03-11");
      b.sell({
        account_id: "acc_fund",
        asset_id: "ast_eth",
        quantity: "10",
        unit_price: "10",
        ...EUR,
        trade_date: "2027-05-11",
        value_date: "2027-05-11",
      });
    });
    const priors = codes(state, "wash_sale_window_prior_buy");
    // The acquisition the rule sees is the leg in of the swap, on its own date.
    expect(
      priors.filter((warning) => warning.details.asset_id === "ast_eth")[0]?.details,
    ).toMatchObject({ buy_date: "2027-03-11" });
  });
});
