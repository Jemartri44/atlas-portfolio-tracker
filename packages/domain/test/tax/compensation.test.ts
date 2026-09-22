// Article 49 LIRPF in two phases (criteria #10 and #22), checked first against
// the practical case of the AEAT manual, as it is, and then quadrant by
// quadrant.

import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { Money } from "../../src/money/money.js";
import { compensate } from "../../src/tax/compensation.js";
import type { BalanceCategory, PendingLoss } from "../../src/tax/report.js";

const eur = (amount: string): Money => Money.parse(amount, "EUR");
const rules = { limitPct: Decimal.parse("25"), carryYears: 4 };
const pending = (origin: number, category: BalanceCategory, amount: string): PendingLoss => ({
  origin_year: origin,
  category,
  amount_eur: eur(amount),
  expires_after: origin + 4,
});
const text = (m: Money): string => m.amount.toString();

describe("compensate: the practical case of the AEAT manual (IRPF 2025, chapter 12)", () => {
  it("gains 5,600 − 1,600, income −800, pending 700 + 2,100 of gains and 500 of income: base 200", () => {
    const result = compensate(
      2025,
      { capital_gain: eur("4000"), movable_capital: eur("-800") },
      [
        pending(2021, "capital_gain", "-700"),
        pending(2022, "capital_gain", "-2100"),
        pending(2021, "movable_capital", "-500"),
      ],
      rules,
    );
    expect(text(result.limit_eur.capital_gain)).toBe("1000");
    expect(
      result.steps.map((s) => [s.phase, s.from, s.origin_year, s.against, text(s.amount_eur)]),
    ).toEqual([
      [1, "movable_capital", 2025, "capital_gain", "800"],
      [2, "capital_gain", 2021, "capital_gain", "700"],
      [2, "capital_gain", 2022, "capital_gain", "2100"],
      [2, "movable_capital", 2021, "capital_gain", "200"],
    ]);
    expect(text(result.base_eur)).toBe("200");
    // What is left of 2021 reaches the end of its fourth year and expires.
    expect(result.expired.map((p) => [p.origin_year, p.category, text(p.amount_eur)])).toEqual([
      [2021, "movable_capital", "-300"],
    ]);
    expect(result.pending).toEqual([]);
  });
});

describe("compensate: quadrant by quadrant", () => {
  it("two positive balances: nothing to offset, the base is their sum", () => {
    const result = compensate(
      2028,
      { capital_gain: eur("10"), movable_capital: eur("5") },
      [],
      rules,
    );
    expect(result.steps).toEqual([]);
    expect(text(result.base_eur)).toBe("15");
  });

  it("two negative balances: nothing to offset, both are carried with their category", () => {
    const result = compensate(
      2028,
      { capital_gain: eur("-10"), movable_capital: eur("-5") },
      [],
      rules,
    );
    expect(result.pending.map((p) => [p.category, text(p.amount_eur), p.expires_after])).toEqual([
      ["capital_gain", "-10", 2032],
      ["movable_capital", "-5", 2032],
    ]);
    expect(text(result.base_eur)).toBe("0");
  });

  it("negative gains against positive income: only up to 25 % of the income", () => {
    const result = compensate(
      2028,
      { capital_gain: eur("-100"), movable_capital: eur("40") },
      [],
      rules,
    );
    expect(result.steps.map((s) => text(s.amount_eur))).toEqual(["10"]);
    expect(text(result.movable_capital_final_eur)).toBe("30");
    expect(result.pending.map((p) => text(p.amount_eur))).toEqual(["-90"]);
  });

  it("a small negative balance is offset whole when it is under the limit", () => {
    const result = compensate(
      2028,
      { capital_gain: eur("100"), movable_capital: eur("-10") },
      [],
      rules,
    );
    expect(result.steps.map((s) => [s.from, s.against, text(s.amount_eur), s.limited])).toEqual([
      ["movable_capital", "capital_gain", "10", true],
    ]);
    expect(text(result.base_eur)).toBe("90");
  });

  it("rounds the limit half-up to cents (25 % of 279.23 is 69.8075)", () => {
    const result = compensate(
      2028,
      { capital_gain: eur("279.23"), movable_capital: eur("-100") },
      [],
      rules,
    );
    expect(text(result.limit_eur.capital_gain)).toBe("69.81");
    expect(result.steps.map((s) => text(s.amount_eur))).toEqual(["69.81"]);
  });

  it("offsets pending gains against income in phase 2 within what phase 1 left of the limit", () => {
    const result = compensate(
      2028,
      { capital_gain: eur("-20"), movable_capital: eur("200") },
      [pending(2026, "capital_gain", "-100")],
      rules,
    );
    // Limit 50: phase 1 takes 20, phase 2 the remaining 30.
    expect(result.steps.map((s) => [s.phase, s.origin_year, text(s.amount_eur)])).toEqual([
      [1, 2028, "20"],
      [2, 2026, "30"],
    ]);
    expect(result.pending.map((p) => [p.origin_year, text(p.amount_eur)])).toEqual([[2026, "-70"]]);
    expect(text(result.base_eur)).toBe("150");
  });

  it("offsets the oldest pending years first, so the one that expires is used first", () => {
    const result = compensate(
      2028,
      { capital_gain: eur("150"), movable_capital: eur("0") },
      [pending(2025, "capital_gain", "-100"), pending(2024, "capital_gain", "-100")],
      rules,
    );
    expect(result.steps.map((s) => [s.origin_year, text(s.amount_eur)])).toEqual([
      [2024, "100"],
      [2025, "50"],
    ]);
    expect(result.expired).toEqual([]);
    expect(result.pending.map((p) => [p.origin_year, text(p.amount_eur)])).toEqual([[2025, "-50"]]);
  });

  it("lets a pending year expire at the end of its fourth year and reports it", () => {
    const result = compensate(
      2031,
      { capital_gain: eur("0"), movable_capital: eur("0") },
      [pending(2027, "capital_gain", "-100")],
      rules,
    );
    expect(result.expired.map((p) => [p.origin_year, text(p.amount_eur)])).toEqual([
      [2027, "-100"],
    ]);
    expect(result.pending).toEqual([]);
  });

  it("reports as expired anything handed over already past its last year, never drops it", () => {
    const result = compensate(
      2032,
      { capital_gain: eur("50"), movable_capital: eur("0") },
      [pending(2027, "capital_gain", "-100")],
      rules,
    );
    expect(result.steps).toEqual([]);
    expect(result.expired.map((p) => p.origin_year)).toEqual([2027]);
    expect(text(result.base_eur)).toBe("50");
  });

  it("follows the configured limit and carry period", () => {
    const result = compensate(2028, { capital_gain: eur("-100"), movable_capital: eur("40") }, [], {
      limitPct: Decimal.parse("10"),
      carryYears: 5,
    });
    expect(result.steps.map((s) => text(s.amount_eur))).toEqual(["4"]);
    expect(result.pending.map((p) => p.expires_after)).toEqual([2033]);
  });
});
