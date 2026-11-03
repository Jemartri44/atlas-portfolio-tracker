import { describe, expect, it } from "vitest";
import { Decimal, HUNDRED } from "../../src/money/decimal.js";
import { grow } from "../../src/projections/growth.js";

const d = (text: string) => Decimal.parse(text);

describe("grow", () => {
  it("stays within a millionth of a euro of the exact pot at 20 years, with bounded digits", () => {
    // 100,000 € and 1,000 € a month at 7 %, the pot kept exact every month as reference.
    const input = { start: d("100000"), monthly: d("1000"), annualReturnPct: d("7"), years: 20 };
    const rate = input.annualReturnPct.div(HUNDRED).div(d("12"));
    let exact = input.start;
    for (let month = 1; month <= input.years * 12; month += 1) {
      exact = exact.add(exact.mul(rate)).add(input.monthly);
    }
    const rounded = (grow(input).at(-1) as { value: Decimal }).value;
    expect(rounded.sub(exact).abs().lt(d("0.000001"))).toBe(true);
    expect(rounded.round(2).toString()).toBe(exact.round(2).toString());
    expect(rounded.toString().length).toBeLessThan(20);
  });
});
