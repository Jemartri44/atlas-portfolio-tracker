// The findings of the fiscal review of feature 009, each with the reviewer's
// reproduction ledger rebuilt here.

import { describe, expect, it } from "vitest";
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
