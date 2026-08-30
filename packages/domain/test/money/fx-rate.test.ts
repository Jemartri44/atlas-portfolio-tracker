import { describe, expect, it } from "vitest";
import { CurrencyMismatchError, ValidationError } from "../../src/errors.js";
import { Decimal } from "../../src/money/decimal.js";
import { FxRate } from "../../src/money/fx-rate.js";
import { EUR, Money } from "../../src/money/money.js";

const rate = (value: string, currency: string): FxRate =>
  FxRate.of(Decimal.parse(value), currency, "2026-12-30");

describe("FxRate", () => {
  it("converts with eur = amount / rate at 10 decimals", () => {
    expect(rate("1.0850", "USD").toEur(Money.parse("1001.5", "USD")).toString()).toBe(
      "923.0414746544 EUR",
    );
    expect(rate("0.84", "GBP").toEur(Money.parse("84", "GBP")).toString()).toBe("100 EUR");
  });

  it("is the identity for EUR with rate 1", () => {
    expect(rate("1", EUR).toEur(Money.parse("123.45", EUR)).toString()).toBe("123.45 EUR");
    expect(() => rate("1.1", EUR)).toThrow(ValidationError);
  });

  it("rejects non-positive rates and foreign money", () => {
    expect(() => rate("0", "USD")).toThrow(ValidationError);
    expect(() => rate("-1", "USD")).toThrow(ValidationError);
    expect(() => rate("1.0850", "USD").toEur(Money.parse("1", "GBP"))).toThrow(
      CurrencyMismatchError,
    );
  });

  it("keeps the published rate, currency and date", () => {
    const fx = rate("1.0850", "USD");
    expect(fx.rate.toString()).toBe("1.085");
    expect(fx.currency).toBe("USD");
    expect(fx.date).toBe("2026-12-30");
    expect(fx.toString()).toBe("1.085 USD/EUR @ 2026-12-30");
  });
});
