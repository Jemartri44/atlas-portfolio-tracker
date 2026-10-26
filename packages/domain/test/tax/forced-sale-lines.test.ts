// A restructuring may sell the same asset in the same account twice, at two
// prices: each sale has to read its own price, fee and withholding.

import { describe, expect, it } from "vitest";
import { buy, reportOf, taxBuilder, text } from "./helpers.js";

const forcedSale = (quantity: string, price: string, fee: string, withholding: string) => ({
  op: "forced_sale" as const,
  per_account: [{ account_id: "acc_a", quantity, fee, withholding }],
  unit_price: price,
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-03-01",
});

describe("two forced sales of the same asset in the same account", () => {
  const lines = () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      effects: [forcedSale("3", "110", "1", "5"), forcedSale("2", "120", "2", "7")],
    });
    return reportOf(b.build(), 2027);
  };

  it("each line shows its own amount, fee and withholding", () => {
    const report = lines();
    const [first, second] = report.capital_gains.lines;
    expect([first, second].map((line) => text(line?.proceeds.amount))).toEqual(["329", "238"]);
    expect([first, second].map((line) => text(line?.fee))).toEqual(["1", "2"]);
    expect([first, second].map((line) => text(line?.withholding?.amount))).toEqual(["5", "7"]);
    expect(report.withholdings.lines.map((line) => text(line.amount_eur_rounded)).sort()).toEqual([
      "5",
      "7",
    ]);
  });

  it("the figure that counts comes from the gains and is the same either way", () => {
    const report = lines();
    const [first, second] = report.capital_gains.lines;
    expect([first, second].map((line) => text(line?.proceeds.eur))).toEqual(["329", "238"]);
    expect([first, second].map((line) => text(line?.computable_eur))).toEqual(["29", "38"]);
  });
});

describe("the criteria of an event that made several lines", () => {
  it("name the event once, in the order of its lines", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const usd = (quantity: string, price: string) => ({
      ...forcedSale(quantity, price, "1", "0"),
      currency: "USD",
      fx_rate: "1.1",
      fx_rate_date: "2027-02-28",
    });
    const action = b.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      effects: [usd("3", "110"), usd("2", "120")],
    });
    const report = reportOf(b.build(), 2027);
    const named = [...report.doubtful, ...report.settled].filter((stake) =>
      stake.event_ids.includes(action.id),
    );
    // The event does show up in a criterion, and each one lists it a single time.
    expect(named.length).toBeGreaterThan(0);
    for (const stake of named) {
      expect(stake.event_ids, `criterion ${stake.criterion}`).toEqual([
        ...new Set(stake.event_ids),
      ]);
    }
  });
});
