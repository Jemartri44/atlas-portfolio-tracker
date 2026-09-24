import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { FIRST_FILING_YEAR, feeKindOf, type SupportedEvent } from "../../src/schema/events.js";
import { FX_FIELDS, knownFieldsOf, validateShape } from "../../src/schema/validate.js";
import { FIRST_SUPPORTED_YEAR } from "../../src/tax/chain.js";
import { envelope, ID, SAMPLES, sampleList, variant } from "../samples.js";
import { TEST_SCHEMA_V2 } from "./test-schema.js";

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
    // `swap` used to be the example of a type nobody knows. It is a type now,
    // so the example has to be one that really is not (feature 008).
    rejects(variant(SAMPLES.buy, { type: "barter" }), "unknown_event_type");
    expect(validateShape(variant(SAMPLES.buy, { corrects_id: ID.sell })).corrects_id).toBe(ID.sell);
  });

  it("checks the envelope version against the injected schema", () => {
    const v2 = variant(SAMPLES.buy, { schema_version: 2 });
    expect(validateShape(v2, TEST_SCHEMA_V2)).toBe(v2);
    rejects(v2, "invalid_envelope");
    expect(() => validateShape(SAMPLES.buy, TEST_SCHEMA_V2)).toThrow(ValidationError);
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

  /**
   * ADR-0021: where it trades and where the issuer sits. Both optional, both
   * unread by anything today, and the country validated with the same rule as
   * `dividend.source_country` — two uppercase letters, not a closed list, which
   * is what the project already applies to `account.country`.
   */
  it("assets: the market is free text and the issuer country is ISO 3166-1 alpha-2", () => {
    expect(
      validateShape(variant(SAMPLES.asset_created, { market: "XETR", issuer_country: "IE" })),
    ).toBeTruthy();
    // Absent is the normal case: a ledger written before this feature has neither.
    expect(validateShape(variant(SAMPLES.asset_created, { market: undefined }))).toBeTruthy();
    rejects(variant(SAMPLES.asset_created, { issuer_country: "IRL" }), "invalid_field");
    rejects(variant(SAMPLES.asset_created, { issuer_country: "ie" }), "invalid_field");
    rejects(variant(SAMPLES.asset_created, { issuer_country: 7 }), "invalid_field");
    // An empty optional string is accepted, here as in `isin` and `ticker`:
    // that is the rule of the whole schema and this field does not change it.
    expect(validateShape(variant(SAMPLES.asset_created, { market: "" }))).toBeTruthy();
  });

  /**
   * ADR-0021: which article 26.1.a) LIRPF lets phase 5 deduct from movable
   * capital income, and which it does not. Optional, with `other` resolved at
   * the point of use so that a line written before this feature never lands on
   * a kind nobody chose.
   */
  it("standalone_fee: the kind is one of five, or absent and read as other", () => {
    expect(validateShape(variant(SAMPLES.standalone_fee, { fee_kind: "custody" }))).toBeTruthy();
    expect(feeKindOf(SAMPLES.standalone_fee)).toBe("other");
    expect(feeKindOf({ ...SAMPLES.standalone_fee, fee_kind: "connectivity" })).toBe("connectivity");
    rejects(variant(SAMPLES.standalone_fee, { fee_kind: "custodia" }), "invalid_field");
  });

  /**
   * ADR-0021: whether a merger, exchange or spin-off takes the tax deferral.
   * Recorded and not acted on — `KIND_RULES` does not look at it — so the test
   * is that it survives validation in its three states: true, false and absent.
   */
  it("corporate_action: the neutrality regime is a boolean, or not recorded at all", () => {
    expect(
      validateShape(variant(SAMPLES.corporate_action, { neutrality_regime: true })),
    ).toBeTruthy();
    expect(
      validateShape(variant(SAMPLES.corporate_action, { neutrality_regime: false })),
    ).toBeTruthy();
    expect(
      validateShape(variant(SAMPLES.corporate_action, { neutrality_regime: undefined })),
    ).toBeTruthy();
    rejects(variant(SAMPLES.corporate_action, { neutrality_regime: "si" }), "invalid_field");
  });

  /**
   * ADR-0021: a grant creates lots and declares nothing, and these two fields
   * say that what was received **is income when it is received**. They travel
   * together because half of either is a figure the tax engine would have to
   * guess at.
   */
  it("grant: the income amount and its base travel together, or neither", () => {
    const withIncome = (income: Record<string, unknown>) =>
      variant(SAMPLES.corporate_action, {
        kind: "crypto_fork",
        effects: [
          {
            op: "grant",
            asset_id: "ast_fork",
            per_account: [{ account_id: "acc_fund", quantity: "10" }],
            unit_cost: "0",
            currency: "EUR",
            fx_rate: "1",
            fx_rate_date: "2027-03-01",
            acquisition_date: "2027-03-01",
            ...income,
          },
        ],
      });
    expect(
      validateShape(withIncome({ income_eur: "420.50", income_base: "general" })),
    ).toBeTruthy();
    expect(validateShape(withIncome({}))).toBeTruthy();
    rejects(withIncome({ income_eur: "420.50" }), "missing_field");
    rejects(withIncome({ income_base: "savings" }), "missing_field");
    rejects(withIncome({ income_eur: "420.50", income_base: "patrimonial" }), "invalid_field");
    rejects(withIncome({ income_eur: "-1", income_base: "general" }), "invalid_field");
  });

  /**
   * ADR-0021. Swapping an asset for itself would consume its lots by FIFO and
   * open one with the same asset and a date of its own, quietly resetting the
   * antiquity of a position nobody sold.
   */
  it("swap: refuses an asset swapped for itself, and a value date before the trade date", () => {
    expect(validateShape(SAMPLES.swap)).toBeTruthy();
    rejects(variant(SAMPLES.swap, { to_asset_id: "ast_world" }), "invalid_field");
    rejects(variant(SAMPLES.swap, { value_date: "2027-01-31" }), "invalid_field");
    rejects(variant(SAMPLES.swap, { quantity_out: "0" }), "invalid_field");
    rejects(variant(SAMPLES.swap, { market_value_in: undefined }), "missing_field");
  });

  it("settings_changed: validates the settings object", () => {
    rejects(variant(SAMPLES.settings_changed, { settings: {} }), "invalid_settings");
  });

  it("fx_exchange: currencies must differ", () => {
    rejects(
      variant(SAMPLES.fx_exchange, { bought_currency: "EUR", fx_rate_bought: "1" }),
      "invalid_field",
    );
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

  it("names the field every refusal is about, so no message says undefined", () => {
    const fieldOf = (raw: unknown): unknown => {
      try {
        validateShape(raw);
      } catch (error) {
        return (error as ValidationError).details.field;
      }
      throw new Error("expected a ValidationError");
    };
    expect(fieldOf(variant(SAMPLES.transfer, { nav_in: undefined }))).toBe("nav_in");
    expect(fieldOf(variant(SAMPLES.transfer, { nav_out: undefined }))).toBe("nav_out");
    const custody = variant(SAMPLES.transfer, {
      to_asset_id: "ast_world",
      to_account_id: "acc_other",
      quantity_in: "4",
      nav_out: undefined,
      nav_in: undefined,
    });
    expect(fieldOf({ ...custody, to_account_id: "acc_fund" })).toBe("to_account_id");
    expect(fieldOf({ ...custody, nav_out: "1" })).toBe("nav_out");
    expect(fieldOf({ ...custody, nav_in: "1" })).toBe("nav_in");
    expect(fieldOf({ ...custody, quantity_in: "3" })).toBe("quantity_in");
    expect(
      fieldOf(variant(SAMPLES.fx_exchange, { sold_currency: "USD", fx_rate_sold: "1.0783" })),
    ).toBe("bought_currency");
    expect(fieldOf(variant(SAMPLES.buy, { value_date: "2000-01-01" }))).toBe("value_date");
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

describe("ECB rate rules (data-schema.md §4)", () => {
  it("declares every fx_rate field of every event type in one of the two tables", () => {
    const declared = new Set<string>();
    for (const pairs of Object.values(FX_FIELDS.pairs)) {
      for (const [, rate] of pairs) {
        declared.add(rate);
      }
    }
    for (const dates of Object.values(FX_FIELDS.dates)) {
      for (const field of dates) {
        declared.add(field);
      }
    }
    for (const sample of sampleList()) {
      const type = sample.type as Parameters<typeof knownFieldsOf>[0];
      for (const field of knownFieldsOf(type)) {
        if (field.startsWith("fx_rate")) {
          expect({ type, field, declared: declared.has(field) }).toEqual({
            type,
            field,
            declared: true,
          });
        }
      }
    }
  });

  it('requires exactly "1" when the currency is the euro', () => {
    expect(validateShape(variant(SAMPLES.buy, { currency: "EUR", fx_rate: "1" }))).toBeTruthy();
    rejects(variant(SAMPLES.buy, { currency: "EUR", fx_rate: "1.0000" }), "eur_fx_rate_not_one");
    rejects(variant(SAMPLES.buy, { currency: "EUR", fx_rate: "1.08" }), "eur_fx_rate_not_one");
    expect(
      validateShape(variant(SAMPLES.buy, { currency: "USD", fx_rate: "1.0850" })),
    ).toBeTruthy();
  });

  it("checks both currency pairs of an fx_exchange", () => {
    rejects(variant(SAMPLES.fx_exchange, { fx_rate_sold: "1.0001" }), "eur_fx_rate_not_one");
    rejects(
      variant(SAMPLES.fx_exchange, { bought_currency: "EUR", fx_rate_bought: "1.0783" }),
      "eur_fx_rate_not_one",
    );
  });

  it("checks the euro rule on cash movements, fees and valuations", () => {
    rejects(variant(SAMPLES.cash_deposit, { fx_rate: "1.01" }), "eur_fx_rate_not_one");
    rejects(variant(SAMPLES.cash_withdrawal, { fx_rate: "1.01" }), "eur_fx_rate_not_one");
    rejects(variant(SAMPLES.standalone_fee, { fx_rate: "1.01" }), "eur_fx_rate_not_one");
    rejects(
      variant(SAMPLES.valuation, { currency: "EUR", fx_rate: "1.0900" }),
      "eur_fx_rate_not_one",
    );
  });

  /**
   * Feature 005, challenge 3 finding 6: these four carried the ECB rate without
   * the date of the rate, so a 31/12 valuation was not reproducible from the
   * official table. The field is optional (ADR-0018: adding one is compatible),
   * and what is present plays by the same rules as everywhere else.
   */
  it("accepts the optional rate date of valuations, cash movements and fees, weekends aside", () => {
    for (const sample of [
      SAMPLES.valuation,
      SAMPLES.cash_deposit,
      SAMPLES.cash_withdrawal,
      SAMPLES.standalone_fee,
    ]) {
      expect(validateShape(sample)).toBeTruthy(); // without the field, as before
      expect(validateShape(variant(sample, { fx_rate_date: "2027-04-30" }))).toBeTruthy();
      rejects(variant(sample, { fx_rate_date: "2027-05-01" }), "fx_rate_date_weekend");
      rejects(variant(sample, { fx_rate_date: "yesterday" }), "invalid_field");
    }
  });

  it("rejects a rate dated on a weekend and accepts the working days around it", () => {
    // 2027-05-01 is a Saturday and 2027-05-02 a Sunday.
    rejects(variant(SAMPLES.buy, { fx_rate_date: "2027-05-01" }), "fx_rate_date_weekend");
    rejects(variant(SAMPLES.buy, { fx_rate_date: "2027-05-02" }), "fx_rate_date_weekend");
    expect(validateShape(variant(SAMPLES.buy, { fx_rate_date: "2027-04-30" }))).toBeTruthy();
    expect(validateShape(variant(SAMPLES.buy, { fx_rate_date: "2027-05-03" }))).toBeTruthy();
    rejects(variant(SAMPLES.sell, { fx_rate_date: "2027-05-01" }), "fx_rate_date_weekend");
    rejects(variant(SAMPLES.dividend, { fx_rate_date: "2027-05-01" }), "fx_rate_date_weekend");
    rejects(variant(SAMPLES.interest, { fx_rate_date: "2027-05-01" }), "fx_rate_date_weekend");
    rejects(variant(SAMPLES.fx_exchange, { fx_rate_date: "2027-05-01" }), "fx_rate_date_weekend");
  });

  it("applies both rules to the forced_sale and grant effects", () => {
    const effectVariant = (patch: Record<string, unknown>): unknown => ({
      ...SAMPLES.corporate_action,
      effects: [
        SAMPLES.corporate_action.effects[0],
        { ...SAMPLES.corporate_action.effects[1], ...patch },
      ],
    });
    rejects(effectVariant({ currency: "EUR" }), "eur_fx_rate_not_one");
    expect(validateShape(effectVariant({ currency: "EUR", fx_rate: "1" }))).toBeTruthy();
    rejects(effectVariant({ fx_rate_date: "2027-05-01" }), "fx_rate_date_weekend");
    const grant = {
      ...SAMPLES.corporate_action,
      kind: "crypto_fork",
      effects: [
        {
          op: "grant",
          asset_id: "ast_fork",
          per_account: [{ account_id: "acc_etf", quantity: "10" }],
          unit_cost: "0",
          currency: "EUR",
          fx_rate: "1.0000",
          fx_rate_date: "2027-04-01",
          acquisition_date: "2027-04-01",
        },
      ],
    };
    rejects(grant, "eur_fx_rate_not_one");
    rejects(
      { ...grant, effects: [{ ...grant.effects[0], fx_rate: "1", fx_rate_date: "2027-05-02" }] },
      "fx_rate_date_weekend",
    );
  });
});

describe("asset types (ADR-0018)", () => {
  it("accepts an ETF, the type the documents named and the enum did not have", () => {
    expect(validateShape(variant(SAMPLES.asset_created, { asset_type: "etf" }))).toBeTruthy();
    rejects(variant(SAMPLES.asset_created, { asset_type: "etff" }), "invalid_field");
  });
});

describe("transfer fee and dividend source country (challenge 2026-08-31)", () => {
  it("rejects a fee inside a transfer and points at standalone_fee", () => {
    try {
      validateShape(variant(SAMPLES.transfer, { fee: "9" }));
      throw new Error("expected a ValidationError");
    } catch (error) {
      expect((error as ValidationError).code).toBe("transfer_fee_not_allowed");
      expect((error as ValidationError).message).toContain("standalone_fee");
    }
    expect(knownFieldsOf("transfer")).not.toContain("fee");
  });

  it("accepts an ISO 3166-1 alpha-2 source country on a dividend", () => {
    expect(
      (
        validateShape(variant(SAMPLES.dividend, { source_country: "US" })) as {
          source_country: string;
        }
      ).source_country,
    ).toBe("US");
    expect(validateShape(SAMPLES.dividend)).toBeTruthy();
    rejects(variant(SAMPLES.dividend, { source_country: "usa" }), "invalid_field");
    rejects(variant(SAMPLES.dividend, { source_country: "Us" }), "invalid_field");
    rejects(variant(SAMPLES.dividend, { source_country: "USA" }), "invalid_field");
  });
});

describe("validateShape: a filed return (ADR-0020)", () => {
  const filed = SAMPLES.tax_return_filed;
  /** The 720 of the same day, with its two categories and its two assets. */
  const m720 = {
    ...envelope("01ARYZ6S41TSV4RRFFQ69G5FAS", "tax_return_filed"),
    type: "tax_return_filed",
    model: "720",
    tax_year: 2025,
    filed_at: "2026-03-20",
    receipt_reference: "720-2025-000000000000",
    declared: {
      accounts: { balance_eur: "15500.00", q4_average_eur: "15710.47" },
      securities: { value_eur: "51000.92" },
      items: [
        {
          category: "accounts",
          account_id: "acc_ib",
          balance_eur: "17000.00",
          q4_average_eur: "15471.34",
        },
        { category: "securities", account_id: "acc_ib", asset_id: "etf_us", value_eur: "15000.91" },
      ],
    },
    computed: {
      as_of: "2026-03-20",
      settings_origin: "default",
      settings: filed.computed.settings,
      accounts: { balance_eur: "15500.00", q4_average_eur: "15710.47" },
      securities: { value_eur: "51000.92" },
      items: [
        {
          category: "accounts",
          account_id: "acc_ib",
          balance_eur: "17000.00",
          q4_average_eur: "15471.34",
        },
      ],
    },
    ledger_fingerprint: filed.ledger_fingerprint,
    fingerprint: "sha256:720-2025",
  };

  /** A copy of the 720 with one field of `declared` replaced. */
  const declaring = (changes: Record<string, unknown>) => ({
    ...m720,
    declared: { ...m720.declared, ...changes },
  });

  it("accepts a renta, a 720 and a 721, and a supplementary return", () => {
    expect(validateShape(filed)).toBe(filed);
    expect(validateShape(m720)).toBe(m720);
    expect(validateShape(variant(filed, { supersedes: ID.sell }))).toBeTruthy();
    const m721 = {
      ...m720,
      model: "721",
      declared: {
        crypto: { value_eur: "1000.00" },
        items: [
          { category: "crypto", account_id: "acc_ib", asset_id: "coin_x", value_eur: "1000.00" },
        ],
      },
      computed: {
        as_of: "2026-03-20",
        settings_origin: "default",
        settings: filed.computed.settings,
        items: [],
      },
    };
    expect(validateShape(m721)).toBeTruthy();
    expect(knownFieldsOf("tax_return_filed")).toContain("receipt_reference");
  });

  it("refuses a year the model did not exist in: 2018 for the Renta, 2012 for the 720, 2023 for the 721", () => {
    rejects(
      variant(filed, {
        tax_year: 2017,
        filed_at: "2018-06-01",
        declared: { savings_base_eur: "0", pending_losses: [], deferred_losses_eur: "0" },
      }),
      "filing_year_unsupported",
    );
    const empty = { savings_base_eur: "0", pending_losses: [], deferred_losses_eur: "0" };
    expect(
      validateShape(
        variant(filed, {
          tax_year: 2018,
          filed_at: "2019-06-01",
          declared: empty,
          computed: { ...filed.computed, ...empty },
        }),
      ),
    ).toBeTruthy();
    rejects(
      {
        ...m720,
        model: "721",
        tax_year: 2022,
        filed_at: "2023-03-20",
        declared: { items: [] },
        computed: {
          as_of: "2026-03-20",
          settings_origin: "default",
          settings: filed.computed.settings,
          items: [],
        },
      },
      "filing_year_unsupported",
    );
    // The 720 exists since 2012, and nothing about the offsetting regime of
    // the income tax has any say over an informative return: a 720 of 2015 is
    // a return the user may well have filed.
    const informative = (tax_year: number, filed_at: string) => ({
      ...m720,
      tax_year,
      filed_at,
      declared: { items: [] },
      computed: {
        as_of: filed_at,
        settings_origin: "default",
        settings: filed.computed.settings,
        items: [],
      },
    });
    expect(validateShape(informative(2015, "2016-04-20"))).toBeTruthy();
    rejects(informative(2011, "2012-04-20"), "filing_year_unsupported");
  });

  it("keeps the first year of the Renta level with the regime the engine implements", () => {
    // The schema cannot import the tax module, so the two constants are
    // written twice and this is what keeps them from drifting apart. The
    // comment that claimed such a test existed was written before it did.
    expect(FIRST_FILING_YEAR.renta).toBe(FIRST_SUPPORTED_YEAR);
    expect(FIRST_FILING_YEAR["720"]).toBe(2012);
    expect(FIRST_FILING_YEAR["721"]).toBe(2023);
  });

  it("refuses a filing dated before the year ended, and one dated after today", () => {
    // 31 December of the year itself is still inside it; 1 January is not.
    rejects(variant(filed, { filed_at: "2025-12-31" }), "filed_at_not_after_year");
    expect(validateShape(variant(filed, { filed_at: "2026-01-01" }))).toBeTruthy();
    // `recorded_at` of every sample is 1 September 2026 in Madrid.
    rejects(variant(filed, { filed_at: "2026-09-02" }), "filed_at_in_future");
    expect(validateShape(variant(filed, { filed_at: "2026-09-01" }))).toBeTruthy();
  });

  /**
   * `computed.as_of` is the date the comparison of ADR-0020 **re-reads the
   * prefix of the ledger with**, so an absurd one splits the difference
   * between what was declared and what is computed into four causes that are
   * false, and nothing says so.
   *
   * The rule is not a date picked out of the air: it is that `as_of` **covers
   * the whole year it declares**. A calculation made with a cut that leaves
   * half the return out declares incomplete figures. The cut of the ledger
   * **includes its own date** (`asOf` skips only what comes *after* it), so a
   * calculation made on 31 December of the year covers it whole and is valid;
   * 30 December is not.
   */
  it("refuses a calculation that does not cover the year it declares", () => {
    const withAsOf = (as_of: string) => variant(filed, { computed: { ...filed.computed, as_of } });
    rejects(withAsOf("2025-12-30"), "as_of_before_year_end");
    // The last day of the year is inside it, and the cut includes its own date.
    expect(validateShape(withAsOf("2025-12-31"))).toBeTruthy();
    // A whole year early: the ledger could not hold what had not happened yet.
    rejects(withAsOf("2025-06-18"), "as_of_before_year_end");
  });

  /**
   * And nothing is computed **after** the line that carries it was written.
   *
   * The bound is `recorded_at` and **not** `filed_at`: recording a return
   * after filing it is the ordinary flow —file at the tax agency one day, note
   * it here another— and `as_of` is the day the application computed, so it
   * comes **after** `filed_at` every time. Rejecting that would reject the
   * ordinary case (feature 011, P6).
   *
   * There is no third comparison. "`as_of` not in the future" **is** this one.
   */
  it("refuses a calculation dated after the line that carries it", () => {
    const withAsOf = (as_of: string) => variant(filed, { computed: { ...filed.computed, as_of } });
    // `recorded_at` of every sample is 1 September 2026 in Madrid.
    rejects(withAsOf("2026-09-02"), "as_of_in_future");
    expect(validateShape(withAsOf("2026-09-01"))).toBeTruthy();
    // Computed after it was filed, which is what recording it later looks like.
    expect(validateShape(withAsOf("2026-08-20"))).toBeTruthy();
  });

  it("refuses figures that are not what they claim to be", () => {
    rejects(variant(filed, { declared: "175.70" }), "invalid_field");
    rejects(
      variant(filed, { ledger_fingerprint: { schema_version: 1, lines: 12, sha256: "no" } }),
      "invalid_field",
    );
    rejects(
      variant(filed, {
        ledger_fingerprint: {
          schema_version: 1,
          lines: -1,
          sha256: filed.ledger_fingerprint.sha256,
        },
      }),
      "invalid_field",
    );
    // A pending balance that is not negative is not a pending loss, and a
    // deferred one that is positive is not deferred.
    rejects(
      variant(filed, {
        declared: {
          ...filed.declared,
          pending_losses: [{ origin_year: 2024, category: "capital_gain", amount_eur: "260.80" }],
        },
      }),
      "invalid_field",
    );
    rejects(
      variant(filed, { declared: { ...filed.declared, deferred_losses_eur: "20.00" } }),
      "invalid_field",
    );
    rejects(
      variant(filed, { declared: { ...filed.declared, savings_base_eur: "-1" } }),
      "invalid_field",
    );
    rejects(
      variant(filed, {
        declared: {
          ...filed.declared,
          pending_losses: [{ origin_year: 2026, category: "capital_gain", amount_eur: "-1" }],
        },
      }),
      "invalid_field",
    );
    rejects(
      variant(filed, {
        declared: {
          ...filed.declared,
          pending_losses: [{ origin_year: 2024, category: "rendimiento", amount_eur: "-1" }],
        },
      }),
      "invalid_field",
    );
    rejects(
      variant(filed, { declared: { ...filed.declared, pending_losses: ["x"] } }),
      "invalid_field",
    );
  });

  /**
   * `computed` goes through the very same check as `declared`, and nothing
   * held it: deleting the call left the whole suite green. It is the block the
   * comparison reads as "what the application computed that day", it enters a
   * ledger that can never be edited, and a loss with the wrong sign or a
   * repeated origin there poisons the four causes for good.
   */
  it("checks the figures of `computed` exactly as it checks the declared ones", () => {
    const computing = (changes: Record<string, unknown>) =>
      variant(filed, { computed: { ...filed.computed, ...changes } });
    rejects(computing({ deferred_losses_eur: "20.00" }), "invalid_field");
    rejects(computing({ savings_base_eur: "-1" }), "invalid_field");
    rejects(
      computing({
        pending_losses: [{ origin_year: 2024, category: "capital_gain", amount_eur: "260.80" }],
      }),
      "invalid_field",
    );
    rejects(
      computing({
        pending_losses: [{ origin_year: 2026, category: "capital_gain", amount_eur: "-1" }],
      }),
      "invalid_field",
    );
    rejects(
      computing({
        pending_losses: [
          { origin_year: 2024, category: "capital_gain", amount_eur: "-1" },
          { origin_year: 2024, category: "capital_gain", amount_eur: "-2" },
        ],
      }),
      "duplicate_pending_loss",
    );
    // And on an informative return: a category the model does not have.
    rejects(
      { ...m720, computed: { ...m720.computed, crypto: { value_eur: "1.00" } } },
      "invalid_field",
    );
  });

  /**
   * The ordinary case of that border, and the one nothing was testing: you
   * lose in 2027 and you declare 2027. Only a year **after** the one being
   * declared is impossible, so `>` and `>=` were telling the same story.
   */
  it("accepts a pending loss of the very year being declared", () => {
    const ofItsOwnYear = [{ origin_year: 2025, category: "capital_gain", amount_eur: "-1" }];
    expect(
      validateShape(
        variant(filed, {
          declared: { ...filed.declared, pending_losses: ofItsOwnYear },
          computed: { ...filed.computed, pending_losses: ofItsOwnYear },
        }),
      ),
    ).toBeTruthy();
  });

  /**
   * A fingerprint over **zero** lines is the first line of the file: a return
   * recorded before anything else, which is how the losses carried from before
   * the application get in. And a digest is 64 hexadecimal characters, no
   * fewer and no more: nothing was refusing a truncated one.
   */
  it("accepts a fingerprint over no lines and refuses a digest of the wrong length", () => {
    // A real digest, with letters in it: the sample's is all zeros, and zeros
    // have no case, so it could not tell an upper-case digest from its own.
    const digest = "9f5a566a9e5b73b5ad244fd4d15a737e54b751409990f0982cf08b99c28270d1";
    const sealing = (fingerprint: Record<string, unknown>) =>
      variant(filed, { ledger_fingerprint: fingerprint });
    expect(validateShape(sealing({ schema_version: 1, lines: 0, sha256: digest }))).toBeTruthy();
    rejects(sealing({ schema_version: 1, lines: 12, sha256: digest.slice(1) }), "invalid_field");
    rejects(sealing({ schema_version: 1, lines: 12, sha256: `${digest}0` }), "invalid_field");
    rejects(
      sealing({ schema_version: 1, lines: 12, sha256: digest.toUpperCase() }),
      "invalid_field",
    );
    // And the version of the fingerprint is a version, not a count.
    rejects(sealing({ schema_version: 0, lines: 12, sha256: digest }), "invalid_field");
  });

  /**
   * A pending loss of zero is not a loss. Letting it in would put a figure in
   * the comparison that declares nothing and that the chain never computes,
   * and it would be compared against zero for ever.
   */
  it("refuses a pending loss of zero", () => {
    for (const amount of ["0", "0.00", "-0.00"]) {
      rejects(
        variant(filed, {
          declared: {
            ...filed.declared,
            pending_losses: [{ origin_year: 2024, category: "capital_gain", amount_eur: amount }],
          },
        }),
        "invalid_field",
      );
    }
  });

  it("refuses the same origin twice and the same asset twice", () => {
    rejects(
      variant(filed, {
        declared: {
          ...filed.declared,
          pending_losses: [
            { origin_year: 2024, category: "capital_gain", amount_eur: "-1" },
            { origin_year: 2024, category: "capital_gain", amount_eur: "-2" },
          ],
        },
      }),
      "duplicate_pending_loss",
    );
    rejects(
      declaring({
        items: [
          { category: "securities", account_id: "acc_ib", asset_id: "etf_us", value_eur: "1" },
          { category: "securities", account_id: "acc_ib", asset_id: "etf_us", value_eur: "2" },
        ],
      }),
      "duplicate_filed_item",
    );
    // The same asset in two accounts is two assets, and it is allowed.
    expect(
      validateShape(
        declaring({
          items: [
            { category: "securities", account_id: "acc_ib", asset_id: "etf_us", value_eur: "1" },
            { category: "securities", account_id: "acc_mi", asset_id: "etf_us", value_eur: "2" },
          ],
        }),
      ),
    ).toBeTruthy();
  });

  it("refuses a category the model does not have, and an item of a category it does not have", () => {
    rejects(declaring({ crypto: { value_eur: "1" } }), "invalid_field");
    rejects(
      declaring({
        items: [{ category: "crypto", account_id: "acc_ib", asset_id: "coin_x", value_eur: "1" }],
      }),
      "invalid_field",
    );
    // Cash has no asset and needs both balances; a security needs its asset.
    rejects(
      declaring({ items: [{ category: "accounts", account_id: "acc_ib", balance_eur: "1" }] }),
      "missing_field",
    );
    rejects(
      declaring({ items: [{ category: "securities", account_id: "acc_ib", value_eur: "1" }] }),
      "missing_field",
    );
    rejects(declaring({ accounts: { balance_eur: "1" } }), "missing_field");
    rejects(declaring({ items: ["x"] }), "invalid_field");
  });

  it("refuses a computed reading that cannot be reproduced", () => {
    rejects(
      variant(filed, { computed: { ...filed.computed, settings: undefined } }),
      "missing_field",
    );
    rejects(variant(filed, { computed: { ...filed.computed, as_of: "ayer" } }), "invalid_field");
    rejects(
      variant(filed, { computed: { ...filed.computed, settings_origin: "" } }),
      "invalid_field",
    );
    rejects(
      variant(filed, {
        computed: {
          ...filed.computed,
          settings: { fiscal_date_rule: { fund: "mañana" }, wash_sale_window: {} },
        },
      }),
      "invalid_fiscal_date_rule",
    );
  });
});

/**
 * `broker_settled_eur` (ADR-0030, with the amendment of prompt 012 (n)): what
 * the broker really moved in euros, never computed. Mutants 14 and 18 of
 * prompt 012 §5.
 */
describe("validateShape: broker_settled_eur", () => {
  const inDollars = (sample: SupportedEvent): SupportedEvent =>
    ({ ...sample, currency: "USD", fx_rate: "1.1", fx_rate_date: "2026-09-01" }) as SupportedEvent;
  const types = [
    SAMPLES.buy,
    SAMPLES.sell,
    SAMPLES.dividend,
    SAMPLES.interest,
    SAMPLES.standalone_fee,
  ];

  it("is a known, optional field of exactly the five operations", () => {
    for (const sample of sampleList()) {
      const type = sample.type as Parameters<typeof knownFieldsOf>[0];
      expect(knownFieldsOf(type).includes("broker_settled_eur"), type).toBe(
        ["buy", "sell", "dividend", "interest", "standalone_fee"].includes(type),
      );
    }
    for (const sample of types) {
      expect(validateShape(inDollars(sample))).toBeTruthy();
      expect(
        validateShape(variant(inDollars(sample), { broker_settled_eur: "1234.56" })),
      ).toBeTruthy();
    }
  });

  it("is refused in euros, where it would only repeat the amount", () => {
    for (const sample of types) {
      rejects(
        variant(sample, { currency: "EUR", fx_rate: "1", broker_settled_eur: "10" }),
        "broker_settled_eur_in_eur",
      );
    }
  });

  it("is never negative: the event type gives the sign", () => {
    for (const sample of types) {
      rejects(
        variant(inDollars(sample), { broker_settled_eur: "-10" }),
        "broker_settled_eur_negative",
      );
    }
  });

  it("admits a known zero only where it can happen: a dividend or an interest", () => {
    // A dividend withheld whole at source: nothing entered, and that is known.
    expect(
      validateShape(variant(inDollars(SAMPLES.dividend), { broker_settled_eur: "0" })),
    ).toBeTruthy();
    expect(
      validateShape(variant(inDollars(SAMPLES.interest), { broker_settled_eur: "0.00" })),
    ).toBeTruthy();
    // A purchase, a sale or a fee that moved nothing describes no real movement.
    for (const sample of [SAMPLES.buy, SAMPLES.sell, SAMPLES.standalone_fee]) {
      rejects(variant(inDollars(sample), { broker_settled_eur: "0" }), "broker_settled_eur_zero");
    }
  });

  it("is a decimal string like every amount of the ledger", () => {
    rejects(variant(inDollars(SAMPLES.buy), { broker_settled_eur: 10 }), "invalid_field");
    rejects(variant(inDollars(SAMPLES.buy), { broker_settled_eur: "1e3" }), "invalid_field");
  });
});
