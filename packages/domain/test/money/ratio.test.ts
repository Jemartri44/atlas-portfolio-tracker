import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { Quantity } from "../../src/money/quantity.js";
import { isRatioString, Ratio, scaleQuantities } from "../../src/money/ratio.js";

const q = (text: string): Quantity => Quantity.parse(text);
const scale = (text: string, ratio: string): string => Ratio.parse(ratio).apply(q(text)).toString();
const sum = (quantities: readonly Quantity[]): Quantity =>
  quantities.reduce((total, value) => total.add(value), Quantity.ZERO);

describe("Ratio", () => {
  it("parses decimals and integer fractions and keeps the text", () => {
    expect(Ratio.parse("4").toString()).toBe("4");
    expect(Ratio.parse("0.25").denominator.toString()).toBe("1");
    expect(Ratio.parse("4/3").numerator.toString()).toBe("4");
    expect(Ratio.parse("4/3").denominator.toString()).toBe("3");
    expect(Ratio.parse("4/3").toString()).toBe("4/3");
    for (const bad of ["0", "-1", "4/0", "0/4", "1.5/2", "a/b", "4/", "", 4, null]) {
      expect(isRatioString(bad)).toBe(false);
      expect(() => Ratio.parse(bad)).toThrow(ValidationError);
    }
    try {
      Ratio.parse("x");
    } catch (error) {
      expect((error as ValidationError).code).toBe("invalid_ratio");
    }
  });

  it("scales exactly when it can and to 10 decimals when it cannot", () => {
    expect(scale("30", "4/3")).toBe("40");
    expect(scale("10", "1/3")).toBe("3.3333333333");
    expect(scale("10", "0.25")).toBe("2.5");
    expect(scale("10", "1/4")).toBe("2.5");
    expect(scale("10.123456", "1.7")).toBe("17.2098752");
    expect(scale("10.123456", "17/10")).toBe("17.2098752");
    expect(scale("7", "1/3")).toBe("2.3333333333");
    expect(scale("2", "2/3")).toBe("1.3333333333");
  });
});

describe("scaleQuantities", () => {
  it("gives the exact remainder to the last element so the sum is the scaled total", () => {
    const third = Ratio.parse("1/3");
    const scaled = scaleQuantities([q("10"), q("7")], third);
    expect(scaled.map(String)).toEqual(["3.3333333333", "2.3333333334"]);
    expect(sum(scaled).toString()).toBe("5.6666666667");
    expect(sum(scaled).eq(third.apply(q("17")))).toBe(true);
    expect(scaleQuantities([q("30")], Ratio.parse("4/3")).map(String)).toEqual(["40"]);
    expect(scaleQuantities([q("15"), q("15")], Ratio.parse("4/3")).map(String)).toEqual([
      "20",
      "20",
    ]);
    expect(scaleQuantities([], third)).toEqual([]);
  });

  it("is exactly q × ratio per element for decimal ratios", () => {
    expect(
      scaleQuantities([q("10.123456"), q("0.000001")], Ratio.parse("1.7")).map(String),
    ).toEqual(["17.2098752", "0.0000017"]);
  });

  it("preserves the scaled total for any list and ratio", () => {
    const quantity = fc
      .integer({ min: 1, max: 10_000_000 })
      .map((n) => Quantity.parse(String(n)).value.div(Quantity.parse("1000").value))
      .map((value) => Quantity.of(value));
    const ratio = fc.oneof(
      fc.constantFrom("2", "0.25", "1.7", "10", "0.1"),
      fc
        .tuple(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 20 }))
        .map(([n, d]) => `${n}/${d}`),
    );
    fc.assert(
      fc.property(fc.array(quantity, { minLength: 1, maxLength: 8 }), ratio, (list, text) => {
        const parsed = Ratio.parse(text);
        const scaled = scaleQuantities(list, parsed);
        expect(scaled).toHaveLength(list.length);
        expect(sum(scaled).eq(parsed.apply(sum(list)))).toBe(true);
        if (parsed.denominator.eq(Ratio.parse("1").denominator)) {
          for (const [index, value] of scaled.entries()) {
            expect(value.eq((list[index] as Quantity).mul(parsed.numerator))).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
