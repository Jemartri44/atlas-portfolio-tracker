// The chain of tax years: where it starts and what anchors it (feature 010).
//
// A filed return is the only way the losses the user carried from before the
// application enter the ledger. The chain has to walk back to it, even when
// the ledger itself starts later, or those losses disappear without a word.

import { describe, expect, it } from "vitest";
import { Money } from "../../src/money/money.js";
import type { FiledAnchor } from "../../src/tax/report.js";
import { taxYear } from "../../src/tax/year.js";
import { buy, sell, taxBuilder, text } from "./helpers.js";

const TODAY = "2035-01-01";

/** −100 of 2022 and −400 of 2023, declared as pending in the return of 2025. */
const filed2025: FiledAnchor[] = [
  {
    year: 2025,
    pending: [
      { origin_year: 2022, category: "capital_gain", amount_eur: Money.parse("-100", "EUR") },
      { origin_year: 2023, category: "capital_gain", amount_eur: Money.parse("-400", "EUR") },
    ],
  },
];

/** A gain of 300,00 in 2026 and nothing else: the ledger starts that year. */
const ledgerFrom2026 = () => {
  const b = taxBuilder();
  buy(b, "stock_s", "2026-01-11", "10", "100");
  sell(b, "stock_s", "2026-06-01", "10", "130");
  return b.build();
};

describe("where the chain of years starts (P5)", () => {
  it("a return filed for 2025 anchors a ledger that starts in 2026: its losses offset and then expire", () => {
    const events = ledgerFrom2026();
    const y2026 = taxYear(events, 2026, { today: TODAY, filed: filed2025 });
    // 300 of gains against the declared pending, oldest first (#22): all 100
    // of 2022 and 200 of the 400 of 2023.
    expect(text(y2026.base_eur)).toBe("0");
    expect(
      y2026.compensation.steps.map((s) => [s.phase, s.origin_year, text(s.amount_eur)]),
    ).toEqual([
      [2, 2022, "100"],
      [2, 2023, "200"],
    ]);
    expect(
      y2026.compensation.pending.map((p) => [p.origin_year, text(p.amount_eur), p.expires_after]),
    ).toEqual([[2023, "-200", 2027]]);

    // 2027 has no figures: what is left of 2023 reaches its fourth year and
    // expires, said out loud.
    const y2027 = taxYear(events, 2027, { today: TODAY, filed: filed2025 });
    expect(y2027.compensation.expired.map((p) => [p.origin_year, text(p.amount_eur)])).toEqual([
      [2023, "-200"],
    ]);
    expect(y2027.notes.find((n) => n.code === "tax_loss_expires")?.details).toEqual({
      origin_year: 2023,
      category: "capital_gain",
      amount_eur: "-200",
    });
    expect(y2027.compensation.pending).toEqual([]);
  });

  it("the anchor of a year the ledger does not reach is what was brought in, not a difference", () => {
    const y2025 = taxYear(ledgerFrom2026(), 2025, { today: TODAY, filed: filed2025 });
    expect(y2025.anchor?.before_ledger).toBe(true);
    expect(y2025.anchor?.computed).toEqual([]);
    expect(y2025.anchor?.declared.map((p) => [p.origin_year, text(p.amount_eur)])).toEqual([
      [2022, "-100"],
      [2023, "-400"],
    ]);
    // An empty ledger and a filed return: the anchor still precedes it.
    expect(
      taxYear(taxBuilder().build(), 2025, { today: TODAY, filed: filed2025 })?.anchor
        ?.before_ledger,
    ).toBe(true);
  });

  it("without the filed return the same ledger forgets those losses: the proof is not empty", () => {
    expect(text(taxYear(ledgerFrom2026(), 2026, { today: TODAY }).base_eur)).toBe("300");
    expect(taxYear(ledgerFrom2026(), 2027, { today: TODAY }).compensation.expired).toEqual([]);
  });

  it("a return filed before 2018 is refused like figures before 2018", () => {
    const filed2017: FiledAnchor[] = [{ year: 2017, pending: [] }];
    expect(() => taxYear(ledgerFrom2026(), 2026, { today: TODAY, filed: filed2017 })).toThrow(
      /2017 is earlier/,
    );
  });
});
