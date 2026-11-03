// The estimated quota of the savings base, computed by hand (criterion #27).
//
// Scales: arts. 66.1 and 76 LIRPF in the wording of each year, read in the BOE
// on 2026-11-03 (`savings-scale.ts`). The halves are equal in every wording,
// so the total rate is twice the state one: 19, 21, 23, then 26 (2021-22),
// 27/28 (2023-24), 27/30 (2025 on). Double taxation: art. 80.1 (the lesser of
// the tax paid abroad and the average rate times the part of the base taxed
// abroad) and 80.2 (the average rate, with two decimals).

import { describe, expect, it } from "vitest";
import type { Money } from "../../src/money/money.js";
import { savingsQuota } from "../../src/tax/quota.js";
import { HAND_SETTINGS, reportOf, taxBuilder } from "./helpers.js";

const cents = (money: Money | undefined): string | undefined => money?.roundToCents().centsText();

/** A fund bought for 10,000 € in 2018 and sold at `price` a unit on 10 June of `year`. */
const gainOf = (year: number, price: string) => {
  const b = taxBuilder(HAND_SETTINGS);
  b.buy({ account_id: "acc_a", asset_id: "fund_f", quantity: "100", value_date: "2018-03-01" });
  b.sell({
    account_id: "acc_a",
    asset_id: "fund_f",
    quantity: "100",
    unit_price: price,
    value_date: `${year}-06-10`,
  });
  return reportOf(b.build(), year);
};

describe("savingsQuota", () => {
  it("applies the 2025 scale bracket by bracket, in halves", () => {
    // Base 8,000: 6,000 × 19 % = 1,140 and 2,000 × 21 % = 420 → 1,560.
    // State: 6,000 × 9.5 % + 2,000 × 10.5 % = 570 + 210 = 780; region the same.
    // Average 1,560 / 8,000 = 19.50 %; next euro at 21 %, 42,000 left in it.
    const quota = savingsQuota(gainOf(2025, "180"));
    expect(quota.scale_origin).toBe("law");
    expect(cents(quota.base_eur)).toBe("8000.00");
    expect(quota.brackets.map((b) => [b.rate_pct, cents(b.base_eur), cents(b.quota_eur)])).toEqual([
      ["19", "6000.00", "1140.00"],
      ["21", "2000.00", "420.00"],
    ]);
    expect([cents(quota.state_eur), cents(quota.regional_eur), cents(quota.quota_eur)]).toEqual([
      "780.00",
      "780.00",
      "1560.00",
    ]);
    expect(quota.average_rate_pct).toBe("19.5");
    expect(quota.marginal_rate_pct).toBe("21");
    expect(cents(quota.room_to_next_eur)).toBe("42000.00");
    expect(cents(quota.result_eur)).toBe("1560.00");
    expect(quota.notes).toEqual([]);
  });

  it.each([
    // Base 350,000 (sold at 3,600). Common part up to 200,000:
    // 1,140 + 44,000 × 21 % (9,240) + 150,000 × 23 % (34,500) = 44,880.
    // 2019 (Ley 26/2014): the rest at 23 % → 44,880 + 34,500 = 79,380.
    [2019, "79380.00"],
    // 2022 (Ley 11/2020): the rest at 26 % → 44,880 + 39,000 = 83,880.
    [2022, "83880.00"],
    // 2024 (Ley 31/2022): 100,000 × 27 % + 50,000 × 28 % → 44,880 + 27,000 + 14,000 = 85,880.
    [2024, "85880.00"],
    // 2025 (Ley 7/2024): the last 50,000 at 30 % → 44,880 + 27,000 + 15,000 = 86,880.
    [2025, "86880.00"],
  ])("takes the scale of %i", (year, expected) => {
    const quota = savingsQuota(gainOf(year, "3600"));
    expect(cents(quota.quota_eur)).toBe(expected);
    expect(quota.room_to_next_eur).toBeUndefined();
  });

  it("does not compute a year with no checked scale", () => {
    const quota = savingsQuota({ ...gainOf(2025, "180"), year: 2017 });
    expect(quota.scale_origin).toBe("none");
    expect(quota.quota_eur).toBeUndefined();
    expect(quota.result_eur).toBeUndefined();
  });

  it("warns when the year is later than the check of the scale", () => {
    expect(savingsQuota(gainOf(2027, "180")).notes).toEqual(["scale_after_check"]);
  });

  it("uses the brackets of the settings and warns when they differ from the law", () => {
    // The 2024 scale typed into the settings, applied to 2025: 6,000 × 19 % + 2,000 × 21 %.
    const report = gainOf(2025, "180");
    const differ = savingsQuota(report, [
      { up_to: "6000", rate_pct: "19" },
      { up_to: "50000", rate_pct: "21" },
      { up_to: "200000", rate_pct: "23" },
      { up_to: "300000", rate_pct: "27" },
      { rate_pct: "28" },
    ]);
    expect(differ.scale_origin).toBe("settings");
    expect(differ.notes).toEqual(["settings_differ_from_law"]);
    expect(cents(differ.quota_eur)).toBe("1560.00");
    expect(differ.state_eur).toBeUndefined();
    const same = savingsQuota(report, [
      { up_to: "6000", rate_pct: "19" },
      { up_to: "50000.00", rate_pct: "21" },
      { up_to: "200000", rate_pct: "23" },
      { up_to: "300000", rate_pct: "27" },
      { rate_pct: "30" },
    ]);
    expect(same.notes).toEqual([]);
  });

  it("limits the double taxation deduction to the tax paid abroad, on the net income", () => {
    // A US dividend of 1,000 € with 150 withheld (treaty 15 %), and a custody
    // fee of 100 that is deductible movable capital expense (#23).
    // Base 900; quota 900 × 19 % = 171.00; average 19.00 %.
    // Foreign income in the base: 1,000 − 100 × 1,000 / 1,000 = 900.
    // Second limit 900 × 19 % = 171; first 150 → deduction 150; net 21.00.
    const b = taxBuilder(HAND_SETTINGS);
    b.buy({ account_id: "acc_b", asset_id: "stock_t", value_date: "2025-01-10" });
    b.dividend({
      account_id: "acc_b",
      asset_id: "stock_t",
      value_date: "2025-04-01",
      fx_rate_date: "2025-04-01",
      gross: "1000",
      withholding_origin: "150",
      source_country: "US",
    });
    b.fee({ account_id: "acc_b", value_date: "2025-06-30", amount: "100", fee_kind: "custody" });
    const quota = savingsQuota(reportOf(b.build(), 2025));
    expect(cents(quota.quota_eur)).toBe("171.00");
    expect(quota.average_rate_pct).toBe("19");
    expect(quota.double_taxation && cents(quota.double_taxation.foreign_income_eur)).toBe("900.00");
    expect(quota.double_taxation && cents(quota.double_taxation.second_limit_eur)).toBe("171.00");
    expect(quota.double_taxation && cents(quota.double_taxation.deduction_eur)).toBe("150.00");
    expect(cents(quota.net_quota_eur)).toBe("21.00");
  });

  it("caps the foreign income at the base when losses offset it", () => {
    // The same dividend, no fee, and a loss of 2,000 on a fund. The loss offsets
    // 25 % of the movable capital balance (art. 49): base 1,000 − 250 = 750.
    // Quota 750 × 19 % = 142.50; foreign income min(1,000, 750) = 750;
    // second limit 142.50 < 150 → deduction 142.50 and the net quota is zero.
    const b = taxBuilder(HAND_SETTINGS);
    b.buy({ account_id: "acc_b", asset_id: "stock_t", value_date: "2025-01-10" });
    b.buy({ account_id: "acc_a", asset_id: "fund_f", quantity: "100", value_date: "2024-03-01" });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      quantity: "100",
      unit_price: "80",
      value_date: "2025-06-10",
    });
    b.dividend({
      account_id: "acc_b",
      asset_id: "stock_t",
      value_date: "2025-04-01",
      fx_rate_date: "2025-04-01",
      gross: "1000",
      withholding_origin: "150",
      source_country: "US",
    });
    const quota = savingsQuota(reportOf(b.build(), 2025));
    expect(cents(quota.base_eur)).toBe("750.00");
    expect(cents(quota.quota_eur)).toBe("142.50");
    expect(quota.double_taxation && cents(quota.double_taxation.deduction_eur)).toBe("142.50");
    expect(cents(quota.net_quota_eur)).toBe("0.00");
  });

  it("subtracts the Spanish withholdings and flags a deduction it cannot compute", () => {
    // A Spanish dividend of 100 with 19 withheld: quota 19.00, result 0.00.
    // A dividend from a country without a treaty rate: no first limit, flagged.
    const b = taxBuilder(HAND_SETTINGS);
    b.buy({ account_id: "acc_a", asset_id: "stock_s", value_date: "2025-01-10" });
    b.dividend({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2025-04-01",
      fx_rate_date: "2025-04-01",
      gross: "100",
      withholding_spain: "19",
    });
    b.dividend({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2025-05-02",
      fx_rate_date: "2025-05-02",
      gross: "0.01",
      withholding_origin: "0.01",
      source_country: "BR",
    });
    const quota = savingsQuota(reportOf(b.build(), 2025));
    expect(cents(quota.savings_withholdings_eur)).toBe("19.00");
    expect(quota.double_taxation).toBeUndefined();
    expect(quota.notes).toEqual(["deduction_incomplete"]);
    expect(cents(quota.result_eur)).toBe("0.00");
  });

  it("leaves no empty bracket for a base exactly on a limit", () => {
    // Base 6,000 (sold at 160): 6,000 × 19 % = 1,140; the next euro goes at 21 %.
    const quota = savingsQuota(gainOf(2025, "160"));
    expect(quota.brackets.map((b) => b.rate_pct)).toEqual(["19"]);
    expect(cents(quota.quota_eur)).toBe("1140.00");
    expect(quota.marginal_rate_pct).toBe("21");
    expect(cents(quota.room_to_next_eur)).toBe("44000.00");
  });

  it.each([
    [[]],
    [[{ up_to: "6000", rate_pct: "19" }]],
    [[{ up_to: "50000", rate_pct: "21" }, { up_to: "6000", rate_pct: "19" }, { rate_pct: "23" }]],
    [[{ rate_pct: "19" }, { rate_pct: "21" }]],
  ])("ignores brackets of the settings that are not a scale: %j", (brackets) => {
    // Same base of 8,000 as the first case: the law of 2025 gives 1,560.
    const quota = savingsQuota(gainOf(2025, "180"), brackets);
    expect(quota.scale_origin).toBe("law");
    expect(quota.notes).toEqual(["settings_brackets_invalid"]);
    expect(cents(quota.quota_eur)).toBe("1560.00");
  });

  it("takes only the foreign share of what the compensation leaves", () => {
    // A US dividend of 1,000 (150 withheld), a Spanish one of 1,000 and a loss
    // of 2,000. Movable capital 2,000, offset 25 % = 500 (art. 49): base 1,500.
    // The foreign share of that balance is 1,000 / 2,000: 750 enter the base.
    // Quota 1,500 × 19 % = 285; average 19.00 %; second limit 750 × 19 % = 142.50 < 150.
    const b = taxBuilder(HAND_SETTINGS);
    b.buy({ account_id: "acc_b", asset_id: "stock_t", value_date: "2025-01-10" });
    b.buy({ account_id: "acc_a", asset_id: "stock_s", value_date: "2025-01-10" });
    b.buy({ account_id: "acc_a", asset_id: "fund_f", quantity: "100", value_date: "2024-03-01" });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      quantity: "100",
      unit_price: "80",
      value_date: "2025-06-10",
    });
    for (const [asset, country] of [
      ["stock_t", "US"],
      ["stock_s", undefined],
    ] as const) {
      b.dividend({
        account_id: asset === "stock_t" ? "acc_b" : "acc_a",
        asset_id: asset,
        value_date: "2025-04-01",
        fx_rate_date: "2025-04-01",
        gross: "1000",
        withholding_origin: country === undefined ? "0" : "150",
        ...(country === undefined ? {} : { source_country: country }),
      });
    }
    const quota = savingsQuota(reportOf(b.build(), 2025));
    expect(cents(quota.base_eur)).toBe("1500.00");
    expect(quota.double_taxation && cents(quota.double_taxation.foreign_income_eur)).toBe("750.00");
    expect(quota.double_taxation && cents(quota.double_taxation.deduction_eur)).toBe("142.50");
    expect(cents(quota.net_quota_eur)).toBe("142.50");
  });

  it("computes nothing to deduct on a zero base", () => {
    // A US dividend of 100 (15 withheld) and an ETC, movable capital income
    // (#24), sold at a loss of 200: the movable capital balance is −100 and the
    // base 0. Quota 0, average 0 %, no foreign income left in the base.
    const b = taxBuilder({
      ...HAND_SETTINGS,
      income_category: { ...HAND_SETTINGS.income_category, etc: "movable_capital" },
    });
    b.buy({ account_id: "acc_b", asset_id: "stock_t", value_date: "2025-01-10" });
    b.buy({ account_id: "acc_a", asset_id: "etc_e", value_date: "2024-03-01" });
    b.sell({
      account_id: "acc_a",
      asset_id: "etc_e",
      quantity: "10",
      unit_price: "80",
      value_date: "2025-06-10",
    });
    b.dividend({
      account_id: "acc_b",
      asset_id: "stock_t",
      value_date: "2025-04-01",
      fx_rate_date: "2025-04-01",
      gross: "100",
      withholding_origin: "15",
      source_country: "US",
    });
    const quota = savingsQuota(reportOf(b.build(), 2025));
    expect(cents(quota.base_eur)).toBe("0.00");
    expect(quota.brackets).toEqual([]);
    expect(cents(quota.quota_eur)).toBe("0.00");
    expect(quota.average_rate_pct).toBe("0");
    expect(quota.double_taxation && cents(quota.double_taxation.foreign_income_eur)).toBe("0.00");
    expect(quota.double_taxation && cents(quota.double_taxation.deduction_eur)).toBe("0.00");
  });

  it.each([
    // Fee 200: balance −100 + 500 = 400, quota 400 × 19 % = 76.00.
    ["200", "400.00", "76.00"],
    // Fee 100, exactly the dividend: balance 0 + 500 = 500, quota 95.00.
    ["100", "500.00", "95.00"],
  ])("takes no foreign income when a fee of %s takes all the dividends", (fee, base, quotaEur) => {
    // A US dividend of 100 (15 withheld), a custody fee (#23, as the engine
    // reads it) and an ETC sold with a gain of 500 as movable capital. The
    // dividends net of fees are not positive, so nothing of the base is
    // foreign income and nothing is deducted.
    const b = taxBuilder({
      ...HAND_SETTINGS,
      income_category: { ...HAND_SETTINGS.income_category, etc: "movable_capital" },
    });
    b.buy({ account_id: "acc_b", asset_id: "stock_t", value_date: "2025-01-10" });
    b.buy({ account_id: "acc_a", asset_id: "etc_e", value_date: "2024-03-01" });
    b.sell({
      account_id: "acc_a",
      asset_id: "etc_e",
      quantity: "10",
      unit_price: "150",
      value_date: "2025-06-10",
    });
    b.dividend({
      account_id: "acc_b",
      asset_id: "stock_t",
      value_date: "2025-04-01",
      fx_rate_date: "2025-04-01",
      gross: "100",
      withholding_origin: "15",
      source_country: "US",
    });
    b.fee({ account_id: "acc_b", value_date: "2025-06-30", amount: fee, fee_kind: "custody" });
    const quota = savingsQuota(reportOf(b.build(), 2025));
    expect(cents(quota.base_eur)).toBe(base);
    expect(cents(quota.quota_eur)).toBe(quotaEur);
    expect(quota.double_taxation && cents(quota.double_taxation.deduction_eur)).toBe("0.00");
  });
});
