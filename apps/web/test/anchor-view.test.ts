// The anchor of what was filed, as the screen reads it (feature 011, block 6
// and its review).
//
// Two things the first version lost. **The origin**: it added the balances of a
// substitution into one total, and the origin —the year a loss comes from— is
// what decides until when it can be offset, so two substitutions with the same
// total and different origins read the same. And **the agreement**: when what
// was declared is exactly what the engine computed, the substitution still
// happened and is still said, but saying it matches is what keeps it from
// reading as a difference.

import { Money } from "@atlas/domain";
import type { TaxYearReport } from "@atlas/domain/fiscal";
import { describe, expect, it } from "vitest";
import { NO_NAMES } from "../src/format/names.js";
import { yearView } from "../src/view-models/fiscal/index.js";

const eur = (value: string): Money => Money.parse(value, "EUR");
const zero = eur("0");

const loss = (origin_year: number, amount: string) => ({
  origin_year,
  category: "capital_gain" as const,
  amount_eur: eur(amount),
  expires_after: origin_year + 4,
});

/** The least of a report the view reads, with the anchors of the case. */
const reportWith = (anchors: TaxYearReport["anchors"]): TaxYearReport =>
  ({
    year: 2029,
    today: "2030-01-15",
    base_eur: zero,
    anchors,
    capital_gains: { lines: [], balance_eur: zero, foreign_releases_eur: zero },
    movable_capital: {
      transmissions: [],
      dividends: [],
      interest: [],
      expenses: [],
      balance_eur: zero,
      foreign_releases_eur: zero,
    },
    compensation: { steps: [], pending: [], expired: [], limit_pct: "25" },
    doubtful: [],
    settled: [],
  }) as unknown as TaxYearReport;

describe("the anchor of what was filed, on the screen", () => {
  it("keeps every origin apart, instead of one total that loses it", () => {
    // Same total (−300) and different origins: they must not read the same.
    const view = yearView(
      reportWith([
        {
          year: 2028,
          computed: [loss(2027, "-300")],
          declared: [loss(2027, "-100"), loss(2028, "-200")],
        },
      ]),
      NO_NAMES,
    );
    const [anchor] = view.anchors;
    expect(
      anchor?.rows.map((row) => [
        row.origin_year,
        row.computed_eur.amount.toString(),
        row.declared_eur.amount.toString(),
      ]),
    ).toEqual([
      [2027, "-300", "-100"],
      [2028, "0", "-200"],
    ]);
    expect(anchor?.matches).toBe(false);
  });

  /**
   * Oldest origin first, and within one year the category, whatever order the
   * engine and the return list them in: the origin is what decides until
   * when a loss can be offset, so it is what the eye reads down the list
   * (second review of feature 011: dropping the sort passed the suite).
   */
  it("orders the rows by origin, then by category, whatever order they arrive in", () => {
    const view = yearView(
      reportWith([
        {
          year: 2028,
          computed: [
            { ...loss(2027, "-5"), category: "movable_capital" as const },
            loss(2027, "-7"),
          ],
          declared: [loss(2028, "-200"), loss(2026, "-300")],
        },
      ]),
      NO_NAMES,
    );
    expect(view.anchors[0]?.rows.map((row) => `${row.origin_year} ${row.category}`)).toEqual([
      "2026 capital_gain",
      "2027 capital_gain",
      "2027 movable_capital",
      "2028 capital_gain",
    ]);
  });

  it("says it matches when what was declared is what the engine computed", () => {
    const view = yearView(
      reportWith([{ year: 2028, computed: [loss(2027, "-300")], declared: [loss(2027, "-300")] }]),
      NO_NAMES,
    );
    expect(view.anchors[0]?.matches).toBe(true);
  });
});
