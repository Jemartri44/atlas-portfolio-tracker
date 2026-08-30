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

  it("rejects the formerly reserved types when their fields are missing", () => {
    rejects({ ...envelope(ID.buy, "thesis_opened"), anything: 1 }, "missing_field");
    rejects({ ...envelope(ID.buy, "corporate_action") }, "missing_field");
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
    rejects(variant(SAMPLES.corporate_action, { effects: "scale" }), "invalid_field");
    rejects(variant(SAMPLES.corporate_action, { kind: "dividend" }), "invalid_field");
    rejects(variant(SAMPLES.corporate_action, { source_document: "" }), "invalid_field");
    rejects(variant(SAMPLES.thesis_opened, { expected_horizon_days: "90" }), "invalid_field");
    rejects(variant(SAMPLES.thesis_opened, { expected_horizon_days: 0 }), "invalid_field");
    rejects(variant(SAMPLES.thesis_opened, { expected_horizon_days: 1.5 }), "invalid_field");
    rejects(variant(SAMPLES.thesis_opened, { planned_size_eur: "0" }), "invalid_field");
    rejects(variant(SAMPLES.thesis_closed, { closing_notes: "" }), "invalid_field");
    expect(validateShape(variant(SAMPLES.sell, { thesis_id: "th_spec_1" }))).toBeTruthy();
  });
});

const withEffects = (effects: unknown): Record<string, unknown> =>
  variant(SAMPLES.corporate_action, { effects });

const rejectsEffects = (effects: unknown, code: string, field: string): void => {
  try {
    validateShape(withEffects(effects));
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe(code);
    expect((error as ValidationError).details.field).toBe(field);
    return;
  }
  throw new Error("expected a ValidationError");
};

describe("validateShape: corporate action effects", () => {
  const sale = {
    op: "forced_sale",
    per_account: [{ account_id: "acc_etf", quantity: "all" }],
    unit_price: "0",
    currency: "USD",
    fx_rate: "1.0850",
    fx_rate_date: "2027-04-01",
  };
  const grant = {
    op: "grant",
    asset_id: "ast_fork",
    per_account: [{ account_id: "acc_etf", quantity: "10" }],
    unit_cost: "0",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2027-04-01",
    acquisition_date: "2027-04-01",
  };

  it("accepts every primitive, an empty list and fractional ratios", () => {
    expect(validateShape(withEffects([]))).toBeTruthy();
    expect(validateShape(withEffects([{ op: "scale", ratio: "4/3" }]))).toBeTruthy();
    expect(
      validateShape(withEffects([{ op: "convert", to_asset_id: "ast_new", ratio: "0.5" }])),
    ).toBeTruthy();
    expect(
      validateShape(
        withEffects([
          { op: "carve_out", to_asset_id: "ast_spin", ratio: "1/4", cost_share: "0.2" },
          { ...sale, asset_id: "ast_spin" },
        ]),
      ),
    ).toBeTruthy();
    expect(validateShape(withEffects([grant]))).toBeTruthy();
    for (const share of ["0", "1", "0.3333333333"]) {
      expect(
        validateShape(
          withEffects([{ op: "carve_out", to_asset_id: "x", ratio: "1", cost_share: share }]),
        ),
      ).toBeTruthy();
    }
  });

  it("rejects malformed effects with the qualified field", () => {
    rejectsEffects(["scale"], "invalid_field", "effects[0]");
    rejectsEffects([{ ratio: "2" }], "missing_field", "effects[0].op");
    rejectsEffects([{ op: "merge", ratio: "2" }], "invalid_field", "effects[0].op");
    rejectsEffects([{ op: "scale" }], "missing_field", "effects[0].ratio");
    for (const ratio of ["0", "-2", "4/0", "0/3", "1.5/2", "a/b", "4/", 4]) {
      rejectsEffects([{ op: "scale", ratio }], "invalid_field", "effects[0].ratio");
    }
    rejectsEffects([{ op: "convert", ratio: "1" }], "missing_field", "effects[0].to_asset_id");
    for (const cost_share of ["1.5", "-0.1", 0.2, "x"]) {
      rejectsEffects(
        [{ op: "carve_out", to_asset_id: "x", ratio: "1", cost_share }],
        "invalid_field",
        "effects[0].cost_share",
      );
    }
    rejectsEffects([{ ...sale, per_account: [] }], "invalid_field", "effects[0].per_account");
    rejectsEffects([{ ...sale, per_account: "all" }], "invalid_field", "effects[0].per_account");
    rejectsEffects(
      [{ ...sale, per_account: ["acc_etf"] }],
      "invalid_field",
      "effects[0].per_account[0]",
    );
    rejectsEffects(
      [
        { op: "scale", ratio: "2" },
        { ...sale, per_account: [{ quantity: "1" }] },
      ],
      "missing_field",
      "effects[1].per_account[0].account_id",
    );
    for (const quantity of ["some", "0", "-1", 1]) {
      rejectsEffects(
        [{ ...sale, per_account: [{ account_id: "acc_etf", quantity }] }],
        "invalid_field",
        "effects[0].per_account[0].quantity",
      );
    }
    rejectsEffects(
      [{ ...sale, per_account: [{ account_id: "acc_etf", quantity: "1", fee: "-1" }] }],
      "invalid_field",
      "effects[0].per_account[0].fee",
    );
    rejectsEffects([{ ...sale, unit_price: "-1" }], "invalid_field", "effects[0].unit_price");
    rejectsEffects([{ ...sale, fx_rate: "0" }], "invalid_field", "effects[0].fx_rate");
    rejectsEffects(
      [{ ...grant, acquisition_date: undefined }],
      "missing_field",
      "effects[0].acquisition_date",
    );
    rejectsEffects(
      [{ ...grant, per_account: [{ account_id: "acc_etf", quantity: "all" }] }],
      "invalid_field",
      "effects[0].per_account[0].quantity",
    );
    rejectsEffects([{ ...grant, unit_cost: "-1" }], "invalid_field", "effects[0].unit_cost");
  });
});

describe("validateShape: consistency rules", () => {
  it("buy/sell: exactly a basis — amount, or unit_price without amount", () => {
    expect(validateShape(variant(SAMPLES.buy, { unit_price: undefined }))).toBeTruthy();
    expect(validateShape(variant(SAMPLES.buy, { amount: undefined }))).toBeTruthy();
    rejects(variant(SAMPLES.buy, { amount: undefined, unit_price: undefined }), "missing_field");
    rejects(variant(SAMPLES.sell, { unit_price: undefined }), "missing_field");
  });

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
