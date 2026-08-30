import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { Price } from "../../src/money/price.js";
import { Quantity } from "../../src/money/quantity.js";

describe("Price", () => {
  it("multiplies exactly by a quantity", () => {
    const price = Price.parse("215.30", "USD");
    expect(price.times(Quantity.parse("12")).toString()).toBe("2583.6 USD");
    expect(price.times(Quantity.parse("0.000001")).toString()).toBe("0.0002153 USD");
    expect(Price.of(Decimal.ONE, "EUR").toString()).toBe("1 EUR");
  });
});
