// The net foreign income of the double-taxation window, by hand: the gross
// less its share of the deductible fees, split by the gross of dividends and
// of the interest of securities, and never below zero.

import { describe, expect, it } from "vitest";
import { EUR, Money } from "../../src/money/money.js";
import { foreignNetOf } from "../../src/tax/foreign-net.js";
import type { TaxYearReport } from "../../src/tax/report.js";

const eur = (amount: string): Money => Money.parse(amount, EUR);

const report = (
  dividends: string[],
  interest: string[],
  fees: string[],
  accountInterest: string[] = [],
): TaxYearReport =>
  ({
    movable_capital: {
      dividends: dividends.map((gross) => ({ gross_eur_rounded: eur(gross) })),
      interest: [
        ...interest.map((gross) => ({ gross_eur_rounded: eur(gross), asset_id: "bond" })),
        ...accountInterest.map((gross) => ({ gross_eur_rounded: eur(gross) })),
      ],
      expenses: fees.map((fee) => ({ amount_eur_rounded: eur(fee) })),
    },
  }) as unknown as TaxYearReport;

describe("foreignNetOf", () => {
  it.each([
    // 100 of 200 of income bears half of the 20 of fees.
    ["half the income bears half the fees", ["100", "60"], ["40"], ["-20"], "100", "90.00"],
    // No fees: the gross is the net.
    ["no fees leave the gross", ["100"], [], [], "100", "100"],
    // No income to split by: nothing is taken.
    ["no income leaves the gross", [], [], ["-5"], "0", "0"],
    // Fees above the income never turn the net negative.
    ["fees above the income stop at zero", ["10"], [], ["-30"], "10", "0"],
  ])("%s", (_name, dividends, interest, fees, gross, net) => {
    expect(foreignNetOf(report(dividends, interest, fees))(eur(gross)).amount.toString()).toBe(
      Money.parse(net, EUR).amount.toString(),
    );
  });

  it("leaves the interest of an account out of the split: it bears no custody fees", () => {
    const net = foreignNetOf(report(["100"], [], ["-20"], ["100"]))(eur("100"));
    expect(net.amount.toString()).toBe("80");
  });
});
