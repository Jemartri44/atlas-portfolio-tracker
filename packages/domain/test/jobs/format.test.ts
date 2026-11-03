// How the mail writes a figure, Spanish style.

import { describe, expect, it } from "vitest";
import { count, day, euros, monthName, percent, periodName } from "../../src/jobs/mail/format.js";
import { Decimal } from "../../src/money/decimal.js";
import { Money } from "../../src/money/money.js";

describe("the figures of the mail", () => {
  it("writes percentages with one decimal and euros with two, a comma and thousands points", () => {
    expect(percent(Decimal.parse("62.5"))).toBe("62,5 %");
    expect(percent(Decimal.parse("0"))).toBe("0,0 %");
    expect(percent(Decimal.parse("-6.25"))).toBe("-6,3 %");
    expect(percent(Decimal.parse("-0.04"))).toBe("0,0 %");
    expect(euros(Money.parse("1234567.891", "EUR"))).toBe("1.234.567,89 €");
    expect(euros(Money.parse("-12.5", "EUR"))).toBe("-12,50 €");
    expect(count(1048576)).toBe("1.048.576");
    expect(count(7)).toBe("7");
  });

  it("names every month in Spanish", () => {
    expect(monthName("2026-01")).toBe("enero de 2026");
    expect(monthName("2026-09")).toBe("septiembre de 2026");
    expect(monthName("2026-12")).toBe("diciembre de 2026");
  });

  it("says a day and every kind of period the Spanish way", () => {
    expect(day("2026-10-20")).toBe("20/10/2026");
    expect(periodName("2026-10-02")).toBe("02/10/2026");
    expect(periodName("2026-W05")).toBe("la semana 5 de 2026");
    expect(periodName("2026-10")).toBe("octubre de 2026");
    expect(periodName("2026-Q1")).toBe("el primer trimestre de 2026");
    expect(periodName("2026-Q4")).toBe("el cuarto trimestre de 2026");
    expect(periodName("2026")).toBe("2026");
  });
});
