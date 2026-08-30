import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CurrencyMismatchError, ValidationError } from "../../src/errors.js";
import { Decimal } from "../../src/money/decimal.js";
import { assertCurrency, EUR, isCurrency, Money } from "../../src/money/money.js";
import { currency, decimal } from "../arbitraries.js";

const eur = (text: string): Money => Money.parse(text, EUR);
const usd = (text: string): Money => Money.parse(text, "USD");

describe("Money", () => {
  it("adds, subtracts and scales within one currency", () => {
    expect(eur("10.50").add(eur("0.50")).toString()).toBe("11 EUR");
    expect(eur("10").sub(eur("0.01")).toString()).toBe("9.99 EUR");
    expect(eur("10").mul(Decimal.parse("1.5")).toString()).toBe("15 EUR");
    expect(eur("10").div(Decimal.parse("3")).toString()).toBe("3.3333333333 EUR");
    expect(eur("10").neg().toString()).toBe("-10 EUR");
    expect(Money.zero("USD").isZero()).toBe(true);
    expect(eur("-1").isNegative()).toBe(true);
    expect(Money.of(Decimal.ONE, "GBP").currency).toBe("GBP");
  });

  it("refuses to mix currencies", () => {
    expect(() => eur("1").add(usd("1"))).toThrow(CurrencyMismatchError);
    expect(() => eur("1").sub(usd("1"))).toThrow(CurrencyMismatchError);
    expect(() => eur("1").cmp(usd("1"))).toThrow(CurrencyMismatchError);
    expect(eur("1").eq(usd("1"))).toBe(false);
    expect(eur("1").eq(eur("1.00"))).toBe(true);
    expect(eur("1").cmp(eur("2"))).toBe(-1);
  });

  it("rounds to cents half-up, idempotently, only when asked", () => {
    expect(eur("0.005").roundToCents().toString()).toBe("0.01 EUR");
    expect(eur("-0.005").roundToCents().toString()).toBe("-0.01 EUR");
    expect(eur("1.2345").roundToCents().roundToCents().toString()).toBe("1.23 EUR");
    expect(eur("1.2345").toString()).toBe("1.2345 EUR");
  });

  it("validates currency codes", () => {
    expect(isCurrency("EUR")).toBe(true);
    expect(isCurrency("eur")).toBe(false);
    expect(isCurrency("EURO")).toBe(false);
    expect(isCurrency(1)).toBe(false);
    expect(assertCurrency("USD", "currency")).toBe("USD");
    expect(() => assertCurrency("US", "currency")).toThrow(ValidationError);
  });

  it("addition is commutative and associative; a − a = 0", () => {
    fc.assert(
      fc.property(currency(), decimal(), decimal(), decimal(), (code, a, b, c) => {
        const [x, y, z] = [Money.of(a, code), Money.of(b, code), Money.of(c, code)];
        expect(x.add(y).eq(y.add(x))).toBe(true);
        expect(
          x
            .add(y)
            .add(z)
            .eq(x.add(y.add(z))),
        ).toBe(true);
        expect(x.sub(x).isZero()).toBe(true);
      }),
    );
  });

  it("mixing any two different currencies throws", () => {
    fc.assert(
      fc.property(currency(), currency(), decimal(), (left, right, amount) => {
        fc.pre(left !== right);
        expect(() => Money.of(amount, left).add(Money.of(amount, right))).toThrow(
          CurrencyMismatchError,
        );
      }),
    );
  });
});
