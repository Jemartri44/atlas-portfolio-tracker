// How a number typed on a Spanish keyboard is read (`format/input.ts`).
//
// The defect: "1.200,50" — the way anybody in Spain writes twelve hundred euros
// and fifty cents — was turned into "1.200.50" and refused by the domain as
// "el campo amount de buy no es válido". The rule, all of it, is here.

import { describe, expect, it } from "vitest";
import { decimalForInput, parseDecimalInput, parseIntegerInput } from "../src/format/input.js";
import { FORM_SPECS, inputErrors, valuesOfEvent } from "../src/view-models/forms/index.js";

const value = (raw: string): string | undefined => {
  const parsed = parseDecimalInput(raw);
  return parsed.ok ? parsed.value : undefined;
};

const refusal = (raw: string): string | undefined => {
  const parsed = parseDecimalInput(raw);
  return parsed.ok ? undefined : parsed.message;
};

describe("a decimal typed the Spanish way", () => {
  it("with a comma, the comma is the decimal and the dots group thousands", () => {
    expect(value("1.200,50")).toBe("1200.50");
    expect(value("12.345.678,9")).toBe("12345678.9");
    expect(value("0,5")).toBe("0.5");
    expect(value("1200,5")).toBe("1200.5");
    expect(value("4,8765")).toBe("4.8765");
  });

  it("without a comma, dots in groups of three are thousands", () => {
    expect(value("1.200")).toBe("1200");
    expect(value("12.345.678")).toBe("12345678");
    expect(value("600")).toBe("600");
  });

  it("refuses a point that could be a decimal, saying how to write it", () => {
    for (const ambiguous of ["1.5", "1234.5", "0.12", "1.20", "1.2345"]) {
      expect(refusal(ambiguous), ambiguous).toContain("no se sabe si son decimales o miles");
    }
    // The sentence gives the two ways out, with the user's own figure.
    expect(refusal("1.5")).toContain("escribe 1,5");
    expect(refusal("1.5")).toContain("1.500");
  });

  it("refuses what is not a number at all", () => {
    for (const wrong of ["abc", "12,3,4", "1.20,5", ",5", "1,", "1.2.3", "1,2a", "--1"]) {
      expect(refusal(wrong), wrong).toMatch(/^No es un número/);
    }
  });

  it("tolerates spaces, a sign and zero padding", () => {
    expect(value(" 1 200,50 ")).toBe("1200.50");
    expect(value("1\u00a0200,50")).toBe("1200.50");
    expect(value("-3,5")).toBe("-3.5");
    expect(value("−3,5")).toBe("-3.5");
    expect(value("+3")).toBe("3");
    expect(value("007,50")).toBe("7.50");
  });

  it("reads a whole number, and nothing with decimals, for a count of days", () => {
    expect(parseIntegerInput("90")).toEqual({ ok: true, value: "90" });
    expect(parseIntegerInput("1.000")).toEqual({ ok: true, value: "1000" });
    expect(parseIntegerInput("90,5").ok).toBe(false);
    expect(parseIntegerInput("noventa").ok).toBe(false);
  });

  it("writes a value of the ledger back the way it is typed", () => {
    expect(decimalForInput("1.0672")).toBe("1,0672");
    expect(decimalForInput("3100")).toBe("3100");
    // And what it writes back is read as what it was.
    expect(value(decimalForInput("1.0672"))).toBe("1.0672");
    expect(value(decimalForInput("-12.5"))).toBe("-12.5");
  });
});

describe("the form reads its numbers with that rule", () => {
  const buy = FORM_SPECS.find((spec) => spec.slug === "buy");
  if (buy === undefined) {
    throw new Error("the buy form is missing");
  }

  it("says under each field what it cannot read, and only there", () => {
    const errors = inputErrors(buy.fields, {
      account_id: "acc_mi",
      quantity: "4,8765",
      amount: "1.5",
      fee: "abc",
      currency: "EUR",
    });
    expect(Object.keys(errors).sort()).toEqual(["amount", "fee"]);
    expect(errors.amount).toContain("escribe 1,5");
  });

  it("does not judge a hidden field: in euros the rate is not the user's", () => {
    expect(inputErrors(buy.fields, { currency: "EUR", fx_rate: "1.5" })).toEqual({});
    expect(Object.keys(inputErrors(buy.fields, { currency: "USD", fx_rate: "1.5" }))).toEqual([
      "fx_rate",
    ]);
  });

  /**
   * Correcting an event fills the form with what the event says. The ledger
   * writes `1.0672`; without writing it back as `1,0672` the rule above would
   * refuse the event's own rate as ambiguous.
   */
  it("fills a correction with values the rule accepts", () => {
    const values = valuesOfEvent(buy, {
      quantity: "31.2343",
      amount: "3100",
      fx_rate: "1.0672",
      currency: "USD",
      fee: "0.5",
    });
    expect(values.quantity).toBe("31,2343");
    expect(values.fx_rate).toBe("1,0672");
    expect(inputErrors(buy.fields, values)).toEqual({});
  });
});
