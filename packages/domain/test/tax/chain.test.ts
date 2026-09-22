import { describe, expect, it } from "vitest";
import { taxYear } from "../../src/tax/year.js";
import type { LedgerBuilder } from "../ledger-builder.js";
import { buy, sell, taxBuilder, text } from "./helpers.js";

const TODAY = "2035-01-01";

/** The return of 2025, declaring −100 of 2022 and −400 of 2023 still pending. */
const fileReturnOf2025 = (b: LedgerBuilder) =>
  b.filed({
    tax_year: 2025,
    filed_at: "2026-06-18",
    declared: {
      savings_base_eur: "0",
      pending_losses: [
        { origin_year: 2022, category: "capital_gain", amount_eur: "-100" },
        { origin_year: 2023, category: "capital_gain", amount_eur: "-400" },
      ],
      deferred_losses_eur: "0",
    },
  });

/** A gain of 300,00 in 2026 and nothing else: the ledger starts that year. */
const ledgerFrom2026 = (filed = true) => {
  const b = taxBuilder();
  buy(b, "stock_s", "2026-01-11", "10", "100");
  sell(b, "stock_s", "2026-06-01", "10", "130");
  if (filed) {
    fileReturnOf2025(b);
  }
  return b.build();
};

describe("where the chain of years starts (P5)", () => {
  it("a return filed for 2025 anchors a ledger that starts in 2026: its losses offset and then expire", () => {
    const events = ledgerFrom2026();
    const y2026 = taxYear(events, 2026, { today: TODAY });
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
    const y2027 = taxYear(events, 2027, { today: TODAY });
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
    const y2025 = taxYear(ledgerFrom2026(), 2025, { today: TODAY });
    expect(y2025.anchor?.before_ledger).toBe(true);
    expect(y2025.anchor?.computed).toEqual([]);
    expect(y2025.anchor?.declared.map((p) => [p.origin_year, text(p.amount_eur)])).toEqual([
      [2022, "-100"],
      [2023, "-400"],
    ]);
    // An empty ledger and a filed return: the anchor still precedes it.
    const onlyTheReturn = taxBuilder();
    fileReturnOf2025(onlyTheReturn);
    expect(taxYear(onlyTheReturn.build(), 2025, { today: TODAY }).anchor?.before_ledger).toBe(true);
  });

  it("without the filed return the same ledger forgets those losses: the proof is not empty", () => {
    expect(text(taxYear(ledgerFrom2026(false), 2026, { today: TODAY }).base_eur)).toBe("300");
    expect(taxYear(ledgerFrom2026(false), 2027, { today: TODAY }).compensation.expired).toEqual([]);
  });

  it("anchors on each filed year of the chain, oldest first", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2026-01-11", "10", "100");
    sell(b, "stock_s", "2026-06-01", "10", "130");
    fileReturnOf2025(b);
    // A second return, of 2026, declaring what the ledger itself computes:
    // −200 of 2023 still pending after offsetting the 300 of gains.
    b.filed({
      tax_year: 2026,
      filed_at: "2027-06-18",
      declared: {
        savings_base_eur: "0",
        pending_losses: [{ origin_year: 2023, category: "capital_gain", amount_eur: "-200" }],
        deferred_losses_eur: "0",
      },
    });
    const report = taxYear(b.build(), 2027, { today: TODAY });
    // The anchor reported is the last one walked, and what expires in 2027 is
    // what the return of 2026 declared.
    expect(report.anchor?.year).toBe(2026);
    expect(report.compensation.expired.map((p) => [p.origin_year, text(p.amount_eur)])).toEqual([
      [2023, "-200"],
    ]);
  });

  it("does not anchor on a return filed after the day asked", () => {
    const events = ledgerFrom2026();
    // The day before it was filed, the return does not exist yet (ADR-0016).
    expect(text(taxYear(events, 2026, { today: "2026-06-17" }).base_eur)).toBe("300");
    expect(text(taxYear(events, 2026, { today: "2026-06-18" }).base_eur)).toBe("0");
  });
});
