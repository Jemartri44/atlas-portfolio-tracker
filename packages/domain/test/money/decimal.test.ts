import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { Decimal, isDecimalString } from "../../src/money/decimal.js";
import { decimal, decimalString } from "../arbitraries.js";

const d = (text: string): Decimal => Decimal.parse(text);

describe("Decimal.parse", () => {
  it("accepts canonical decimal strings only", () => {
    expect(d("123.4567").toString()).toBe("123.4567");
    expect(d("-0.5").toString()).toBe("-0.5");
    expect(d("007").toString()).toBe("7");
    expect(d("1.50").toString()).toBe("1.5");
    expect(d("-0").toString()).toBe("0");
    expect(isDecimalString("1.")).toBe(false);
    expect(isDecimalString(".5")).toBe(false);
    expect(isDecimalString("1e3")).toBe(false);
    expect(isDecimalString("1,5")).toBe(false);
    expect(isDecimalString(" 1")).toBe(false);
    expect(isDecimalString("+1")).toBe(false);
  });

  it("rejects numbers and anything that is not a decimal string", () => {
    expect(() => Decimal.parse(1.5)).toThrow(ValidationError);
    expect(() => Decimal.parse("1e3")).toThrow(ValidationError);
    expect(() => Decimal.parse(null)).toThrow(ValidationError);
  });
});

describe("Decimal arithmetic", () => {
  it("is exact for addition, subtraction and multiplication", () => {
    expect(d("0.1").add(d("0.2")).toString()).toBe("0.3");
    expect(d("1").sub(d("0.9")).toString()).toBe("0.1");
    expect(d("1.1").mul(d("1.1")).toString()).toBe("1.21");
    expect(d("123456789012345678901234.5678").mul(d("1000")).toString()).toBe(
      "123456789012345678901234567.8",
    );
  });

  it("divides with 10 decimals rounded half-up", () => {
    expect(d("1").div(d("3")).toString()).toBe("0.3333333333");
    expect(d("2").div(d("3")).toString()).toBe("0.6666666667");
    expect(d("1").div(d("4")).toString()).toBe("0.25");
    expect(d("1001.5").div(d("1.0850")).toString()).toBe("923.0414746544");
    expect(() => d("1").div(d("0"))).toThrow(ValidationError);
  });

  it("rounds half-up (commercial rounding) and never half-even", () => {
    expect(d("0.005").round(2).toString()).toBe("0.01");
    expect(d("0.015").round(2).toString()).toBe("0.02");
    expect(d("0.025").round(2).toString()).toBe("0.03");
    expect(d("-0.005").round(2).toString()).toBe("-0.01");
    expect(d("1.23456").round(2).toString()).toBe("1.23");
    expect(d("2").round(2).toString()).toBe("2");
  });

  it("compares, negates and classifies", () => {
    expect(d("1").cmp(d("2"))).toBe(-1);
    expect(d("2").cmp(d("2"))).toBe(0);
    expect(d("3").cmp(d("2"))).toBe(1);
    expect(d("1").eq(d("1.0"))).toBe(true);
    expect(d("1").lt(d("2"))).toBe(true);
    expect(d("2").gt(d("1"))).toBe(true);
    expect(d("-1").neg().toString()).toBe("1");
    expect(d("-1").abs().toString()).toBe("1");
    expect(d("0").isZero()).toBe(true);
    expect(d("-1").isNegative()).toBe(true);
    expect(d("1").isPositive()).toBe(true);
    expect(Decimal.ZERO.isZero()).toBe(true);
    expect(Decimal.ONE.toString()).toBe("1");
  });

  it("never prints exponents", () => {
    expect(d("0.0000000001").toString()).toBe("0.0000000001");
    expect(d("1000000000000000000000000").toString()).toBe("1000000000000000000000000");
    expect(d("0.000000000000000001").mul(d("0.000000000000000001")).toString()).toBe(
      "0.000000000000000000000000000000000001",
    );
  });
});

describe("Decimal properties", () => {
  it("addition is commutative and associative", () => {
    fc.assert(
      fc.property(decimal(), decimal(), decimal(), (a, b, c) => {
        expect(a.add(b).eq(b.add(a))).toBe(true);
        expect(
          a
            .add(b)
            .add(c)
            .eq(a.add(b.add(c))),
        ).toBe(true);
      }),
    );
  });

  it("a − a = 0 and parse(toString(x)) = x", () => {
    fc.assert(
      fc.property(decimal(), (a) => {
        expect(a.sub(a).isZero()).toBe(true);
        expect(Decimal.parse(a.toString()).eq(a)).toBe(true);
      }),
    );
    fc.assert(
      fc.property(decimalString(), (text) => {
        expect(Decimal.parse(text).toString()).toBe(text);
      }),
    );
  });

  it("rounding is idempotent", () => {
    fc.assert(
      fc.property(decimal(), fc.nat({ max: 10 }), (a, places) => {
        const once = a.round(places);
        expect(once.round(places).eq(once)).toBe(true);
      }),
    );
  });
});
