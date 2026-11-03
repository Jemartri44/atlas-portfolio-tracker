import { describe, expect, it } from "vitest";
import { DomainError } from "../../src/errors.js";
import { Decimal } from "../../src/money/decimal.js";
import { Money } from "../../src/money/money.js";
import { Quantity } from "../../src/money/quantity.js";
import { estimateSale, type HypotheticalSale } from "../../src/projections/sale-tax.js";
import { DEFAULT_SETTINGS, type TaxBracket } from "../../src/settings/defaults.js";
import { LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
/**
 * Two months for a fund, written down: the dates of the windows below are a
 * hand calculation and must not move when the documented default does.
 */
const pinned = (b: LedgerBuilder): LedgerBuilder => {
  b.settings({
    ...DEFAULT_SETTINGS,
    wash_sale_window: { ...DEFAULT_SETTINGS.wash_sale_window, fund: "2m" },
  });
  return b;
};

const BRACKETS: TaxBracket[] = [
  { up_to: "6000", rate_pct: "19" },
  { up_to: "50000", rate_pct: "21" },
  { rate_pct: "23" },
];

/** Two lots of a fund in one account: 20 units bought at 100 in 2022 and 16 more at 100 in 2023. */
const fund = (): LedgerBuilder => {
  const b = pinned(new LedgerBuilder());
  b.account("acc_fund");
  b.asset("ast_world");
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "20",
    unit_price: "100",
    value_date: "2022-02-01",
  });
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "16",
    unit_price: "100",
    value_date: "2023-03-01",
  });
  return b;
};

/** A sale of `quantity` units at `price` euros each. */
const sale = (quantity: string, price: string, fee = "0"): HypotheticalSale => ({
  account_id: "acc_fund",
  asset_id: "ast_world",
  quantity: Quantity.parse(quantity),
  currency: "EUR",
  fx_rate: Decimal.ONE,
  fx_rate_date: DATE,
  amount: Money.of(Decimal.parse(quantity).mul(Decimal.parse(price)), "EUR").amount.toString(),
  fee,
});

const eur = (money: Money | undefined) => money?.roundToCents().amount.toString();

describe("estimateSale", () => {
  it("estimates the tax of a gain over the oldest lot, with the lots it consumes", () => {
    // 1000 euros at 150 a unit: 6.666… units out of the 2022 lot, which cost 100.
    const events = fund().build();
    const result = estimateSale(events, [], DATE, sale("6.66666667", "150"), BRACKETS);
    expect(eur(result.gain_eur)).toBe("333.33");
    expect(eur(result.cost_eur)).toBe("666.67");
    expect(result.lots.map((lot) => lot.acquisition_date)).toEqual(["2022-02-01"]);
    expect(eur(result.tax_eur)).toBe("63.33");
    expect(result.deferred_eur.isZero()).toBe(true);
    expect(result.deferral_window_end).toBeUndefined();
  });

  it("uses the scale of the law when the settings carry no brackets", () => {
    // Gain 333.33, all in the first bracket: each half 333.33 × 9.5 % = 31.666…
    // rounds to 31.67 (arts. 66.1 and 76), so the quota is 63.34. The settings
    // above give one rate and round the total once: 63.33.
    const result = estimateSale(fund().build(), [], DATE, sale("6.66666667", "150"), undefined);
    expect(result.quota_after.scale_origin).toBe("law");
    expect(result.quota_before.quota_eur?.centsText()).toBe("0.00");
    expect(result.quota_after.quota_eur?.centsText()).toBe("63.34");
    expect(eur(result.tax_eur)).toBe("63.34");
    expect(result.repurchase_until).toBeUndefined();
  });

  it("brings no tax for a loss and says until when not to buy it back", () => {
    // 5 units at 80 against a cost of 100: −100. Two months from 31/12/2027,
    // date to date, end on the last day of February: 29/02/2028 (criterion #14).
    const result = estimateSale(fund().build(), [], DATE, sale("5", "80"), BRACKETS);
    expect(eur(result.gain_eur)).toBe("-100");
    expect(result.tax_eur.isZero()).toBe(true);
    expect(result.repurchase_until).toBe("2028-02-29");
  });

  it("defers a loss when the same fund was bought inside the window", () => {
    const b = fund();
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "5",
      unit_price: "100",
      value_date: "2027-12-01",
    });
    const result = estimateSale(b.build(), [], DATE, sale("5", "80"), BRACKETS);
    expect(result.deferred_eur.amount.isPositive()).toBe(true);
    expect(result.deferral_window_end).toBe("2028-02-29");
    // The 5 units bought on 01/12 defer the whole loss: buying more defers nothing more.
    expect(result.repurchase_until).toBeUndefined();
  });

  it("takes the documented default window when nothing is pinned", () => {
    // No settings in the ledger: a fund takes one year (criterion #2,
    // `2:fund_1y`), so a loss sold on 31/12/2027 stays open until 31/12/2028.
    const b = new LedgerBuilder();
    b.account("acc_fund");
    b.asset("ast_world");
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", value_date: "2022-02-01" });
    const result = estimateSale(b.build(), [], DATE, sale("5", "80"), BRACKETS);
    expect(result.repurchase_until).toBe("2028-12-31");
  });

  it("keeps a repurchase date while part of the loss is not deferred", () => {
    // 2 units bought on 01/12/2027, inside the window before the sale: 2 of the
    // 5 sold are deferred (−40 of −100), the other −60 can still be.
    const b = fund();
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "2",
      unit_price: "100",
      value_date: "2027-12-01",
    });
    const result = estimateSale(b.build(), [], DATE, sale("5", "80"), BRACKETS);
    expect(eur(result.deferred_eur)).toBe("40");
    expect(result.repurchase_until).toBe("2028-02-29");
  });

  it("keeps a repurchase date for a sale with a gain that releases a loss", () => {
    // 10 at 100 sold at 80 on 01/10/2027 (−200), bought back at 80 on 15/10:
    // the 200 ride on the new lot. Selling it at 110 on 31/12 gains +300 and
    // releases the −200 (#21), which a purchase until 29/02/2028 defers again.
    const b = pinned(new LedgerBuilder());
    b.account("acc_fund");
    b.asset("ast_world");
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", value_date: "2027-01-11" });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "80",
      value_date: "2027-10-01",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      unit_price: "80",
      value_date: "2027-10-15",
    });
    const result = estimateSale(b.build(), [], DATE, sale("10", "110"), BRACKETS);
    expect(eur(result.gain_eur)).toBe("300");
    expect(result.repurchase_until).toBe("2028-02-29");
  });

  it("counts the sales already planned as done when it prices the next one", () => {
    const small: TaxBracket[] = [{ up_to: "500", rate_pct: "19" }, { rate_pct: "21" }];
    const events = fund().build();
    const first = estimateSale(events, [], DATE, sale("6.66666667", "150"), small);
    const second = estimateSale(events, [first.event], DATE, sale("6.66666667", "150"), small);
    // The first gain fills 333.33 of the first bracket; the second crosses into 21 %.
    expect(eur(first.tax_eur)).toBe("63.33");
    expect(eur(second.tax_eur)).toBe("66.67");
    expect(eur(second.base_after_eur)).toBe("666.66");
  });

  it("saves tax, with a negative figure, when a loss offsets a gain already made that year", () => {
    const events = fund().build();
    const gain = estimateSale(events, [], DATE, sale("6.66666667", "150"), BRACKETS);
    const loss = estimateSale(events, [gain.event], DATE, sale("5", "80"), BRACKETS);
    expect(loss.gain_eur.isNegative()).toBe(true);
    expect(loss.tax_eur.isNegative()).toBe(true);
  });

  it("never writes: the ledger it was given is the same afterwards", () => {
    const events = fund().build();
    const before = JSON.stringify(events);
    estimateSale(events, [], DATE, sale("5", "80"), undefined);
    expect(JSON.stringify(events)).toBe(before);
  });

  it("refuses to estimate a sale larger than the lots the ledger holds", () => {
    expect(() => estimateSale(fund().build(), [], DATE, sale("100", "150"), BRACKETS)).toThrow(
      DomainError,
    );
  });
});
