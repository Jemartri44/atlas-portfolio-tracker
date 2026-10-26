import { describe, expect, it } from "vitest";
import { DomainError } from "../../src/errors.js";
import { Decimal } from "../../src/money/decimal.js";
import { Money } from "../../src/money/money.js";
import { Quantity } from "../../src/money/quantity.js";
import { estimateSale, type HypotheticalSale, taxOfBase } from "../../src/projections/sale-tax.js";
import type { TaxBracket } from "../../src/settings/defaults.js";
import { LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
const BRACKETS: TaxBracket[] = [
  { up_to: "6000", rate_pct: "19" },
  { up_to: "50000", rate_pct: "21" },
  { rate_pct: "23" },
];

/** Two lots of a fund in one account: 20 units bought at 100 in 2022 and 16 more at 100 in 2023. */
const fund = (): LedgerBuilder => {
  const b = new LedgerBuilder();
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

  it("leaves the tax unknown, never zero, when the brackets are not configured", () => {
    const result = estimateSale(fund().build(), [], DATE, sale("6.66666667", "150"), undefined);
    expect(result.tax_eur).toBeUndefined();
    expect(eur(result.gain_eur)).toBe("333.33");
  });

  it("brings no tax for a loss", () => {
    const result = estimateSale(fund().build(), [], DATE, sale("5", "80"), BRACKETS);
    expect(result.gain_eur.isNegative()).toBe(true);
    expect(result.tax_eur?.isZero()).toBe(true);
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

  it("refuses to estimate a sale larger than the lots the ledger holds", () => {
    expect(() => estimateSale(fund().build(), [], DATE, sale("100", "150"), BRACKETS)).toThrow(
      DomainError,
    );
  });
});

describe("taxOfBase", () => {
  const tax = (base: string) => eur(taxOfBase(Money.parse(base, "EUR"), BRACKETS));

  it("applies each rate to its slice only", () => {
    expect(tax("1000")).toBe("190");
    expect(tax("6000")).toBe("1140");
    expect(tax("10000")).toBe("1980");
    expect(tax("60000")).toBe("12680");
  });

  it("is zero for a base of zero or a loss", () => {
    expect(tax("0")).toBe("0");
    expect(tax("-500")).toBe("0");
  });

  it("is zero without brackets", () => {
    expect(eur(taxOfBase(Money.parse("100", "EUR"), []))).toBe("0");
  });
});
