// The findings of the fiscal review of feature 009, each with the reviewer's
// reproduction ledger rebuilt here.

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { windowCriterion } from "../../src/tax/lines.js";
import { lineOf, reportOf, taxBuilder, text } from "./helpers.js";

describe("pending at 31/12 includes what waits for a repurchase of the next year (finding 2)", () => {
  /** The reviewer's `dec.jsonl`: sold at a loss in December, bought back in January. */
  const december = () => {
    const b = taxBuilder();
    b.buy({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2021-03-01",
      quantity: "10",
      unit_price: "100",
    });
    const loss = b.sell({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2021-12-20",
      quantity: "10",
      unit_price: "80",
    });
    const january = b.buy({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2022-01-10",
      quantity: "10",
      unit_price: "79",
    });
    const june = b.sell({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2022-06-01",
      quantity: "10",
      unit_price: "90",
    });
    return { events: b.build(), loss, january, june };
  };

  it("says at 31/12/2021 that −200 is deferred and waits for the purchase of January", () => {
    const { events, loss, january } = december();
    const report = reportOf(events, 2021);
    expect(text(lineOf(report, loss.id).deferred_eur)).toBe("-200");
    expect(report.wash_sale.pending).toEqual([
      {
        origin_event_id: loss.id,
        awaiting_event_id: january.id,
        asset_id: "stock_s",
        amount_eur: expect.anything(),
        travelled: false,
      },
    ]);
    expect(text(report.wash_sale.pending[0]?.amount_eur)).toBe("-200");
  });

  it("has nothing pending once the repurchased lot is sold, and releases it there", () => {
    const { events, june } = december();
    const report = reportOf(events, 2022);
    expect(report.wash_sale.pending).toEqual([]);
    expect(text(lineOf(report, june.id).released_eur)).toBe("-200");
  });
});

describe("#13 marks the cash of an exchange in either order (finding 3)", () => {
  it("tags the fractions sold after the conversion, as it tagged a cash leg before it", () => {
    const b = taxBuilder();
    b.buy({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2021-01-04",
      quantity: "10",
      unit_price: "100",
    });
    const merger = b.corporateAction({
      kind: "merger",
      asset_id: "stock_s",
      effective_date: "2021-06-01",
      effects: [
        { op: "convert", to_asset_id: "stock_t", ratio: "3/4" },
        {
          op: "forced_sale",
          asset_id: "stock_t",
          per_account: [{ account_id: "acc_a", quantity: "0.5" }],
          unit_price: "150",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2021-06-01",
        },
      ],
    });
    expect(lineOf(reportOf(b.build(), 2021), merger.id).criteria).toContain("13");
  });
});

describe("#2 is labelled by the window applied, not by the type of asset (finding 5)", () => {
  /** The reviewer's `stk1y.jsonl`: a stock set to the prudent one-year window. */
  const oneYearStock = () => {
    const b = taxBuilder({
      ...DEFAULT_SETTINGS,
      wash_sale_window: { ...DEFAULT_SETTINGS.wash_sale_window, stock: "1y" },
    });
    b.buy({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2021-01-04",
      quantity: "10",
      unit_price: "100",
    });
    b.buy({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2021-02-01",
      quantity: "10",
      unit_price: "90",
    });
    const loss = b.sell({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2021-06-01",
      quantity: "10",
      unit_price: "80",
    });
    return { events: b.build(), loss };
  };

  it("says one year, conservative, when one year is what was applied", () => {
    const { events, loss } = oneYearStock();
    const report = reportOf(events, 2021);
    const line = lineOf(report, loss.id);
    expect(text(line.deferred_eur)).toBe("-200");
    expect(line.criteria).toContain("2:listed_1y");
    expect(line.criteria).not.toContain("2:listed");
    expect(report.doubtful.map((d) => d.criterion)).not.toContain("2:listed");
    // With two months the purchase of February falls outside: −200 more to carry.
    const item = report.doubtful.find((d) => d.criterion === "2:listed_1y");
    expect(item?.documented_risk).toBe("conservative");
    expect(text(item?.base_difference_eur)).toBe("0");
    expect(text(item?.pending_difference_eur)).toBe("-200");
    expect(item?.direction).toBe("conservative");
  });

  it("labels two months for crypto and any other window as what they are", () => {
    const crypto = taxBuilder({
      ...DEFAULT_SETTINGS,
      wash_sale_window: { ...DEFAULT_SETTINGS.wash_sale_window, crypto: "2m", fund: "45d" },
    });
    crypto.buy({
      account_id: "acc_a",
      asset_id: "coin_c",
      value_date: "2021-01-04",
      quantity: "1",
      unit_price: "100",
    });
    const coin = crypto.sell({
      account_id: "acc_a",
      asset_id: "coin_c",
      value_date: "2021-03-01",
      quantity: "1",
      unit_price: "80",
    });
    crypto.buy({
      account_id: "acc_a",
      asset_id: "coin_c",
      value_date: "2021-03-15",
      quantity: "1",
      unit_price: "80",
    });
    crypto.buy({
      account_id: "acc_a",
      asset_id: "fund_f",
      value_date: "2021-01-04",
      quantity: "1",
      unit_price: "100",
    });
    const fund = crypto.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      value_date: "2021-03-01",
      quantity: "1",
      unit_price: "80",
    });
    crypto.buy({
      account_id: "acc_a",
      asset_id: "fund_f",
      value_date: "2021-03-15",
      quantity: "1",
      unit_price: "80",
    });
    const report = reportOf(crypto.build(), 2021);
    expect(lineOf(report, coin.id).criteria).toContain("2:crypto_2m");
    expect(lineOf(report, fund.id).criteria).toContain("2:other");
    const crypto2m = report.doubtful.find((d) => d.criterion === "2:crypto_2m");
    expect(crypto2m?.measure).toBe("difference");
    const other = report.doubtful.find((d) => d.criterion === "2:other");
    expect(other?.measure).toBe("exposure");
    expect(text(other?.exposure_eur)).toBe("20");
  });
});

describe("windowCriterion", () => {
  it("names the variant by type and window, and any unsupported window as 2:other", () => {
    expect(
      ["stock", "etf", "etc", "etp"].map((type) => windowCriterion(type as "stock", "2m")),
    ).toEqual(["2:listed", "2:listed", "2:listed", "2:listed"]);
    expect(windowCriterion("etf", "1y")).toBe("2:listed_1y");
    expect(windowCriterion("stock", "45d")).toBe("2:other");
    expect(windowCriterion("crypto", "1y")).toBe("2:crypto");
    expect(windowCriterion("crypto", "2m")).toBe("2:crypto_2m");
    expect(windowCriterion("crypto", "45d")).toBe("2:other");
    expect(windowCriterion("fund", "2m")).toBe("2:fund_2m");
    expect(windowCriterion("fund", "1y")).toBe("2:fund_1y");
    expect(windowCriterion("money_market", "1y")).toBe("2:fund_1y");
    expect(windowCriterion("fund", "45d")).toBe("2:other");
  });
});
