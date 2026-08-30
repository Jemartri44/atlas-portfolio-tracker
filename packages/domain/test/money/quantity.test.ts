import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { Quantity } from "../../src/money/quantity.js";

const q = (text: string): Quantity => Quantity.parse(text);

describe("Quantity", () => {
  it("keeps many decimals exactly", () => {
    expect(q("0.123456789012345678").add(q("0.000000000000000002")).toString()).toBe(
      "0.12345678901234568",
    );
    expect(q("10.5").sub(q("0.5")).toString()).toBe("10");
    expect(q("10").mul(Decimal.parse("4")).toString()).toBe("40");
    expect(q("1").ratio(q("3")).toString()).toBe("0.3333333333");
  });

  it("compares and classifies", () => {
    expect(q("1").cmp(q("2"))).toBe(-1);
    expect(q("1").eq(q("1.0"))).toBe(true);
    expect(q("1").lt(q("2"))).toBe(true);
    expect(q("2").gt(q("1"))).toBe(true);
    expect(Quantity.ZERO.isZero()).toBe(true);
    expect(q("-1").isNegative()).toBe(true);
    expect(q("1").isPositive()).toBe(true);
    expect(Quantity.of(Decimal.ONE).value.eq(Decimal.ONE)).toBe(true);
  });
});
