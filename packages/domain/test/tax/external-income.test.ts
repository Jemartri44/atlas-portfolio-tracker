// Savings income received outside the portfolio (`external_income`), by hand.
//
// It is movable capital income (art. 25.1.a dividends, 25.2 interest, LIRPF),
// part of the savings income (art. 46.a), integrated and offset with the
// portfolio's (art. 49.1.a) — but **only for the estimate of the quota**: the
// payer already reports it (modelos 193 and 196), so the report of the
// portfolio and its boxes stay as they were. Scale of 2025 on: 19 % up to
// 6,000 €, 21 % up to 50,000 € (arts. 66.1 and 76, `savings-scale.ts`).

import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { simulateSale } from "../../src/projections/sale-tax.js";
import { snapshotOf } from "../../src/projections/snapshot.js";
import { validateShape } from "../../src/schema/validate.js";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults.js";
import { savingsQuota } from "../../src/tax/quota.js";
import { taxYear } from "../../src/tax/year.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { SAMPLES } from "../samples.js";
import { HAND_SETTINGS, taxBuilder } from "./helpers.js";

const TODAY = "2035-01-01";

/** A fund bought for 10,000 € in 2018 and sold at `price` a unit on 10/06/2025. */
const saleOf = (price: string) => {
  const b = taxBuilder(HAND_SETTINGS);
  b.buy({ account_id: "acc_a", asset_id: "fund_f", quantity: "100", value_date: "2018-03-01" });
  b.sell({
    account_id: "acc_a",
    asset_id: "fund_f",
    quantity: "100",
    unit_price: price,
    value_date: "2025-06-10",
  });
  return b;
};

describe("the external_income event", () => {
  it.each([
    ["a withholding above the gross", { withholding_eur: "1000.01" }, "withholding_exceeds_gross"],
    ["a gross of zero", { gross_eur: "0" }, "invalid_field"],
    ["a kind that is neither dividend nor interest", { kind: "rent" }, "invalid_field"],
  ])("is refused with %s", (_, fields, code) => {
    const attempt = () => validateShape({ ...SAMPLES.external_income, ...fields });
    expect(attempt).toThrow(ValidationError);
    expect(attempt).toThrow(expect.objectContaining({ code }));
  });

  it("moves no cash and no income of the portfolio, and keeps its date for asOf", () => {
    const b = new LedgerBuilder();
    b.account("acc_a");
    b.externalIncome({ value_date: "2027-06-30", gross_eur: "1000", withholding_eur: "190" });
    const events = b.build();
    const state = projectLedger(events);
    expect(state.cash.size).toBe(0);
    expect(state.income).toEqual([]);
    expect(state.externalIncome.map((entry) => [entry.year, entry.gross_eur.centsText()])).toEqual([
      [2027, "1000.00"],
    ]);
    expect(projectLedger(events, { asOf: "2027-06-29" }).externalIncome).toEqual([]);
  });
});

describe("the payer and the snapshot", () => {
  it("keeps the payer, and enters the snapshot only when there is some", () => {
    const b = saleOf("180");
    const before = snapshotOf(projectLedger(b.build()));
    expect("external_income" in before).toBe(false);
    b.externalIncome({ value_date: "2025-07-01", payer: "Banco Ejemplo" });
    const events = b.build();
    const after = snapshotOf(projectLedger(events)) as { external_income?: { payer?: string }[] };
    expect(after.external_income?.map((entry) => entry.payer)).toEqual(["Banco Ejemplo"]);
    const report = taxYear(events, 2025, { today: TODAY, external: true });
    expect(report.external_income?.lines.map((line) => line.payer)).toEqual(["Banco Ejemplo"]);
  });
});

describe("the estimate with income from outside the portfolio", () => {
  it("leaves the report of the portfolio as it was unless asked", () => {
    const b = saleOf("180");
    const without = taxYear(b.build(), 2025, { today: TODAY });
    b.externalIncome({ value_date: "2025-07-01", gross_eur: "2000", withholding_eur: "380" });
    const report = taxYear(b.build(), 2025, { today: TODAY });
    expect(report.base_eur.centsText()).toBe(without.base_eur.centsText());
    expect(report.external_income).toBeUndefined();
  });

  it("adds its gross to the base and its withholding to the estimate", () => {
    // Gain 8,000 + dividend 2,000 = base 10,000.
    // Quota: 6,000 × 19 % + 4,000 × 21 % = 1,140 + 840 = 1,980.
    // Withholdings: 380 of the dividend; result 1,980 − 380 = 1,600.
    const b = saleOf("180");
    b.externalIncome({ value_date: "2025-07-01", gross_eur: "2000", withholding_eur: "380" });
    const report = taxYear(b.build(), 2025, { today: TODAY, external: true });
    expect(report.base_eur.centsText()).toBe("10000.00");
    expect(report.withholdings.total_eur.centsText()).toBe("0.00");
    expect(report.external_income?.withholding_eur.centsText()).toBe("380.00");
    const quota = savingsQuota(report);
    expect(quota.quota_eur?.centsText()).toBe("1980.00");
    expect(quota.savings_withholdings_eur.centsText()).toBe("380.00");
    expect(quota.result_eur?.centsText()).toBe("1600.00");
    expect(quota.external_eur?.centsText()).toBe("2000.00");
    expect(quota.criteria).toEqual(["27", "28"]);
  });

  it("is offset with the portfolio's losses as the return offsets them (art. 49)", () => {
    // A capital loss of 1,000 and 2,000 of interest from a bank. The loss
    // offsets up to 25 % of the interest: 500. Base 1,500 and 500 pending.
    // Without the interest, the base is 0 and the whole 1,000 is pending.
    const b = saleOf("90");
    b.externalIncome({
      kind: "interest",
      value_date: "2025-12-31",
      gross_eur: "2000",
      withholding_eur: "380",
    });
    const events = b.build();
    const alone = taxYear(events, 2025, { today: TODAY });
    expect(alone.base_eur.centsText()).toBe("0.00");
    expect(alone.compensation.pending.map((loss) => loss.amount_eur.centsText())).toEqual([
      "-1000.00",
    ]);
    const joint = taxYear(events, 2025, { today: TODAY, external: true });
    expect(joint.base_eur.centsText()).toBe("1500.00");
    expect(joint.compensation.pending.map((loss) => loss.amount_eur.centsText())).toEqual([
      "-500.00",
    ]);
  });

  it("raises the tax a sale would add when it fills the first bracket", () => {
    // 6,000 of dividends already fill the 19 % bracket of 2027 (the 2025
    // wording). A sale with 200 of gain is then taxed at 21 %: 42.00, not 38.00.
    const b = new LedgerBuilder();
    b.account("acc_a");
    b.asset("ast_world");
    b.buy({ account_id: "acc_a", asset_id: "ast_world", quantity: "10", value_date: "2026-01-12" });
    b.valuation({
      account_id: "acc_a",
      asset_id: "ast_world",
      date: "2027-12-01",
      quantity: "10",
      unit_value: "120",
    });
    const simulate = () => {
      const events = b.build();
      return simulateSale(projectLedger(events), events, {
        asset_id: "ast_world",
        date: "2027-12-31",
        settings: DEFAULT_SETTINGS,
      });
    };
    expect(simulate().tax_eur.centsText()).toBe("38.00");
    b.externalIncome({ value_date: "2027-06-30", gross_eur: "6000", withholding_eur: "1140" });
    const simulation = simulate();
    expect(simulation.tax_eur.centsText()).toBe("42.00");
    expect(simulation.quota_before.external_eur?.centsText()).toBe("6000.00");
  });
});
