// `broker_settled_eur` beside the same movement at the ECB rate (ADR-0030).
// Informative: this is all the domain does with the field.

import { describe, expect, it } from "vitest";
import { brokerSettlementOf } from "../../src/ecb/broker-settlement.js";

const usd = { currency: "USD", fx_rate: "1.25", fx_rate_date: "2027-03-01" };

const figures = (event: Record<string, unknown>) => {
  const settlement = brokerSettlementOf(event);
  return settlement === undefined
    ? undefined
    : [
        settlement.broker_eur.amount.toString(),
        settlement.ecb_eur.amount.toString(),
        settlement.difference_eur.amount.toString(),
      ];
};

describe("brokerSettlementOf", () => {
  it("sets the euros of the statement beside the movement at the ECB rate", () => {
    // A purchase costs the gross plus the fee: (1000 + 5) / 1.25 = 804.
    expect(
      figures({
        type: "buy",
        ...usd,
        quantity: "10",
        unit_price: "100",
        fee: "5",
        broker_settled_eur: "810",
      }),
    ).toEqual(["810", "804", "6"]);
    // `amount`, when there, is the basis.
    expect(
      figures({
        type: "buy",
        ...usd,
        quantity: "10",
        amount: "1000",
        unit_price: "99",
        fee: "0",
        broker_settled_eur: "800",
      }),
    ).toEqual(["800", "800", "0"]);
    // A sale brings the gross minus the fee and the withholding: (1000 − 5 − 20) / 1.25 = 780.
    expect(
      figures({
        type: "sell",
        ...usd,
        quantity: "10",
        unit_price: "100",
        fee: "5",
        withholding: "20",
        broker_settled_eur: "775",
      }),
    ).toEqual(["775", "780", "-5"]);
    expect(
      figures({
        type: "sell",
        ...usd,
        quantity: "10",
        unit_price: "100",
        fee: "0",
        broker_settled_eur: "800",
      }),
    ).toEqual(["800", "800", "0"]);
    // A dividend or an interest, the net that entered.
    expect(
      figures({
        type: "dividend",
        ...usd,
        gross: "100",
        withholding_origin: "15",
        withholding_spain: "10",
        broker_settled_eur: "60",
      }),
    ).toEqual(["60", "60", "0"]);
    expect(
      figures({
        type: "interest",
        ...usd,
        gross: "50",
        withholding_spain: "9.5",
        broker_settled_eur: "32.4",
      }),
    ).toEqual(["32.4", "32.4", "0"]);
    // A fee, what it charged.
    expect(
      figures({ type: "standalone_fee", ...usd, amount: "12.5", broker_settled_eur: "10.1" }),
    ).toEqual(["10.1", "10", "0.1"]);
  });

  it("says nothing when there is nothing to compare, and never makes a figure up", () => {
    expect(
      figures({ type: "buy", ...usd, quantity: "10", unit_price: "100", fee: "5" }),
    ).toBeUndefined();
    expect(
      figures({ type: "buy", ...usd, quantity: "10", fee: "5", broker_settled_eur: "1" }),
    ).toBeUndefined();
    expect(
      figures({ type: "buy", ...usd, unit_price: "1", fee: "5", broker_settled_eur: "1" }),
    ).toBeUndefined();
    expect(figures({ type: "buy", ...usd, amount: "1", broker_settled_eur: "1" })).toBeUndefined();
    expect(
      figures({
        type: "buy",
        currency: "USD",
        fx_rate: "0",
        amount: "1",
        fee: "0",
        broker_settled_eur: "1",
      }),
    ).toBeUndefined();
    expect(
      figures({ type: "buy", currency: "USD", amount: "1", fee: "0", broker_settled_eur: "1" }),
    ).toBeUndefined();
    expect(
      figures({ type: "cash_deposit", ...usd, amount: "1", broker_settled_eur: "1" }),
    ).toBeUndefined();
  });
});
