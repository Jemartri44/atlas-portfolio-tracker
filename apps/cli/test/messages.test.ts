// The Spanish texts of the CLI: what the user reads has to be true.

import { ValidationError } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { describeError, describeWarning } from "../src/output/messages.js";

const repurchase = (window: string) =>
  describeWarning({
    code: "wash_sale_window_repurchase",
    event_id: "01ARYZ6S41TSV4RRFFQ69G5SET",
    message: "",
    details: {
      asset_id: "ast_world",
      buy_date: "2027-03-01",
      quantity: "4",
      sale_event_id: "01ARYZ6S41TSV4RRFFQ69G5SEV",
      sale_date: "2027-01-06",
      loss_eur: "-10",
      tax_year: 2027,
      window_end: "2028-01-06",
      window,
    },
  });

describe("describeWarning: the wash-sale window by its real name", () => {
  it("names the window that applies, never the one that does not", () => {
    expect(repurchase("1y")).toContain("ventana de un año");
    expect(repurchase("2m")).toContain("ventana de dos meses");
    expect(repurchase("45d")).toContain("ventana de 45 días");
    // The old text called every window "the two-month rule", even a one-year one.
    expect(repurchase("1y")).not.toContain("dos meses");
  });

  it("names the purchase and the sale, says the year with its number, and no identifier", () => {
    const text = repurchase("1y");
    expect(text).toContain("Compra del 2027-03-01 de 4 títulos de ast_world");
    expect(text).toContain("venta con pérdida del 2027-01-06");
    expect(text).toContain("en 2027");
    expect(text).not.toContain("este ejercicio");
    expect(text).not.toContain("01ARYZ6S41TSV4RRFFQ69G5SEV");
  });
});

describe("describeError: the per-asset-type settings name the type and the value", () => {
  it("says which asset type carries a wrong income category or fiscal date rule", () => {
    const category = describeError(
      new ValidationError("invalid_income_category", "english", {
        asset_type: "etc",
        value: "rendimiento",
      }),
    );
    expect(category).toContain("etc");
    expect(category).toContain("rendimiento");
    expect(category).toContain("movable_capital");
    const rule = describeError(
      new ValidationError("invalid_fiscal_date_rule", "english", {
        asset_type: "fund",
        value: "settlement",
      }),
    );
    expect(rule).toContain("fund");
    expect(rule).toContain("settlement");
    expect(rule).toContain("value_date");
  });
});
