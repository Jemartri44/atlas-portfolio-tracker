import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { validateShape } from "../../src/schema/validate.js";
import { envelope, ID, SAMPLES, sampleList, variant } from "../samples.js";

const rejects = (raw: unknown, code: string): void => {
  try {
    validateShape(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe(code);
    return;
  }
  throw new Error("expected a ValidationError");
};

describe("validateShape: envelope", () => {
  it("accepts every sample unchanged", () => {
    for (const sample of sampleList()) {
      expect(validateShape(sample)).toBe(sample);
    }
  });

  it("rejects non-objects and broken envelopes", () => {
    rejects("x", "invalid_line");
    rejects(variant(SAMPLES.buy, { schema_version: 2 }), "invalid_envelope");
    rejects(variant(SAMPLES.buy, { id: "nope" }), "invalid_envelope");
    rejects(variant(SAMPLES.buy, { recorded_at: "2026-09-01" }), "invalid_envelope");
    rejects(variant(SAMPLES.buy, { recorded_at: 5 }), "invalid_envelope");
    rejects(variant(SAMPLES.buy, { recorded_at: "2026-13-01T00:00:00Z" }), "invalid_envelope");
    rejects(variant(SAMPLES.buy, { corrects_id: "nope" }), "invalid_envelope");
    rejects(variant(SAMPLES.buy, { type: "swap" }), "unknown_event_type");
    expect(validateShape(variant(SAMPLES.buy, { corrects_id: ID.sell })).corrects_id).toBe(ID.sell);
  });

  it("accepts reserved types at envelope level without checking their fields", () => {
    const reserved = { ...envelope(ID.buy, "thesis_opened"), anything: 1 };
    expect(validateShape(reserved)).toBe(reserved);
  });
});

describe("validateShape: field rules", () => {
  it("requires mandatory fields and allows optional ones to be absent", () => {
    rejects(variant(SAMPLES.buy, { quantity: undefined }), "missing_field");
    expect(
      validateShape(variant(SAMPLES.buy, { amount: undefined, notes: undefined })),
    ).toBeTruthy();
  });

  it("checks every rule kind", () => {
    rejects(variant(SAMPLES.buy, { account_id: "" }), "invalid_field");
    rejects(variant(SAMPLES.buy, { account_id: 7 }), "invalid_field");
    expect(validateShape(variant(SAMPLES.buy, { notes: "" }))).toBeTruthy();
    rejects(variant(SAMPLES.buy, { fee: 1.5 }), "invalid_field");
    rejects(variant(SAMPLES.buy, { fee: "-1" }), "invalid_field");
    rejects(variant(SAMPLES.buy, { quantity: "0" }), "invalid_field");
    rejects(variant(SAMPLES.buy, { quantity: "1e3" }), "invalid_field");
    rejects(variant(SAMPLES.buy, { trade_date: "2026-02-30" }), "invalid_field");
    rejects(variant(SAMPLES.buy, { currency: "eur" }), "invalid_field");
    rejects(variant(SAMPLES.account_created, { country: "ESP" }), "invalid_field");
    rejects(variant(SAMPLES.account_created, { active: "yes" }), "invalid_field");
    rejects(variant(SAMPLES.account_created, { book: "other" }), "invalid_field");
    rejects(variant(SAMPLES.order_updated, { order_id: "1" }), "invalid_field");
    rejects(variant(SAMPLES.reversal, { reason: "" }), "invalid_field");
  });
});

describe("validateShape: consistency rules", () => {
  it("buy/sell: value_date must not precede trade_date", () => {
    rejects(variant(SAMPLES.sell, { value_date: "2027-01-31" }), "invalid_field");
    expect(validateShape(variant(SAMPLES.sell, { value_date: "2027-02-01" }))).toBeTruthy();
  });

  it("assets: asset_class only and always in core", () => {
    rejects(variant(SAMPLES.asset_created, { asset_class: undefined }), "missing_field");
    rejects(
      variant(SAMPLES.asset_created, { book: "bucket", asset_class: "equity" }),
      "invalid_field",
    );
    expect(
      validateShape(variant(SAMPLES.asset_created, { book: "bucket", asset_class: undefined })),
    ).toBeTruthy();
  });

  it("settings_changed: validates the settings object", () => {
    rejects(variant(SAMPLES.settings_changed, { settings: {} }), "invalid_settings");
  });

  it("fx_exchange: currencies must differ", () => {
    rejects(variant(SAMPLES.fx_exchange, { bought_currency: "EUR" }), "invalid_field");
  });

  it("order_placed and transfer_requested: exactly one sizing field", () => {
    rejects(variant(SAMPLES.order_placed, { quantity: "1" }), "invalid_field");
    rejects(variant(SAMPLES.order_placed, { amount: undefined }), "invalid_field");
    expect(
      validateShape(variant(SAMPLES.order_placed, { amount: undefined, quantity: "1" })),
    ).toBeTruthy();
    rejects(variant(SAMPLES.transfer_requested, { amount_eur: "100" }), "invalid_field");
    expect(
      validateShape(
        variant(SAMPLES.transfer_requested, { quantity_out: undefined, amount_eur: "100" }),
      ),
    ).toBeTruthy();
  });

  it("transfer: fund mode needs both navs, custody mode needs neither", () => {
    rejects(variant(SAMPLES.transfer, { nav_in: undefined }), "missing_field");
    const custody = variant(SAMPLES.transfer, {
      to_asset_id: "ast_world",
      to_account_id: "acc_other",
      quantity_in: "4",
      nav_out: undefined,
      nav_in: undefined,
    });
    expect(validateShape(custody)).toBeTruthy();
    rejects({ ...custody, to_account_id: "acc_fund" }, "invalid_field");
    rejects({ ...custody, nav_out: "1" }, "invalid_field");
    rejects({ ...custody, quantity_in: "3" }, "invalid_field");
  });
});
