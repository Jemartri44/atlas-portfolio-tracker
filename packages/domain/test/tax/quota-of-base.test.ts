import { describe, expect, it } from "vitest";
import { Money } from "../../src/money/money.js";
import { quotaOfBase } from "../../src/tax/quota.js";

const base = (text: string) => Money.parse(text, "EUR");

describe("quotaOfBase", () => {
  it("takes the scale of the law of the year, bracket by bracket", () => {
    // 6000 at 19 % and 4000 at 21 %.
    expect(quotaOfBase(base("10000"), 2027)?.amount.toString()).toBe("1980");
  });

  it("prefers the brackets of the settings when they are a scale, and ignores them if not", () => {
    expect(quotaOfBase(base("100"), 2027, [{ rate_pct: "10" }])?.amount.toString()).toBe("10");
    expect(quotaOfBase(base("100"), 2027, [])?.amount.toString()).toBe("19");
  });

  it("gives nothing for a year no scale covers, unless the settings bring one", () => {
    expect(quotaOfBase(base("100"), 2000)).toBeUndefined();
    expect(quotaOfBase(base("100"), 2000, [{ rate_pct: "10" }])?.amount.toString()).toBe("10");
  });
});
